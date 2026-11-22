"""Pure, raise-only verdict application for the optional semantic judge."""

from collections.abc import Sequence
from typing import Literal

from backend.models.challenge import DefectCriterion, FlaggedLineRef
from backend.services.grading.judge.models import JudgeDefectVerdict, JudgeOutcome
from backend.services.grading.reveal import should_reveal
from backend.services.grading.review import ReviewSubmission
from backend.services.grading.scoring import (
    DetectedIssue,
    GradeReport,
    GradingPolicy,
    MissedIssue,
    _format_output_lines,
    aggregate_scores,
    generate_critique,
    redact_missed_issues,
)
from backend.services.grading.weights import defect_weights


def _uses_scoped_output(
    report: GradeReport,
    defects: Sequence[DefectCriterion],
) -> bool:
    return (
        any(
            isinstance(ln, FlaggedLineRef)
            for issue in report.detected_issues
            for ln in issue.matched_lines
        )
        or any(isinstance(ln, FlaggedLineRef) for ln in report.false_positive_lines)
        or any(
            d.file_path is not None
            or any(isinstance(ln, FlaggedLineRef) for ln in d.lines)
            for d in defects
        )
    )


def _unredact_missed_issues(
    missed_issues: Sequence[MissedIssue],
    defect_by_id: dict[str, DefectCriterion],
    *,
    scoped_output: bool,
) -> list[MissedIssue]:
    restored: list[MissedIssue] = []
    for item in missed_issues:
        defect = defect_by_id.get(item.id)
        if defect is None:
            restored.append(item)
            continue
        expected_lines = item.expected_lines
        if not expected_lines:
            scoped = defect.get_scoped_lines()
            expected_lines = (
                _format_output_lines(scoped, scoped_output=scoped_output)
                if scoped
                else list(defect.lines)
            )
        restored.append(
            item.model_copy(
                update={
                    "expected_lines": expected_lines,
                    "missing_keywords": item.missing_keywords or list(defect.keywords),
                    "explanation": item.explanation or defect.explanation,
                }
            )
        )
    return restored


def apply_verdicts(
    report: GradeReport,
    verdicts: Sequence[JudgeDefectVerdict],
    defects: Sequence[DefectCriterion],
    policy: GradingPolicy,
    review: ReviewSubmission,
    *,
    key_source: Literal["byok", "server"],
) -> GradeReport:
    """Apply raise-only judge concept verdicts to borderline defects."""
    borderline_ids = set(report.borderline_defect_ids)

    filtered_verdicts: list[JudgeDefectVerdict] = []
    verdict_by_id: dict[str, JudgeDefectVerdict] = {}
    for verdict in verdicts:
        if verdict.defect_id not in borderline_ids:
            continue
        if verdict.defect_id in verdict_by_id:
            continue
        verdict_by_id[verdict.defect_id] = verdict
        filtered_verdicts.append(verdict)

    uplifted = False
    updated_detected: list[DetectedIssue] = []
    for issue in report.detected_issues:
        verdict = verdict_by_id.get(issue.id)
        if verdict is not None and float(verdict.concept_credit) > issue.concept_score:
            uplifted = True
            updated_detected.append(
                issue.model_copy(
                    update={
                        "concept_score": float(verdict.concept_credit),
                        "concept_source": "judge",
                    }
                )
            )
        else:
            updated_detected.append(issue)

    detected_by_id = {issue.id: issue for issue in updated_detected}
    if defects:
        weights = defect_weights(defects, policy.severity_weights)
        line_scores: list[float] = []
        concept_scores: list[float] = []
        for defect in defects:
            matched_issue = detected_by_id.get(defect.id)
            if matched_issue is not None:
                line_scores.append(matched_issue.line_score)
                concept_scores.append(matched_issue.concept_score)
            else:
                line_scores.append(0.0)
                concept_scores.append(0.0)
        _, new_concept_score, new_score = aggregate_scores(
            line_scores,
            concept_scores,
            weights,
            report.false_positive_penalty,
            policy,
        )
    else:
        new_concept_score = report.concept_score
        new_score = report.score

    reveal_now = should_reveal(policy, review, new_score)
    gated_verdicts = [
        v if reveal_now else v.model_copy(update={"feedback": ""})
        for v in filtered_verdicts
    ]

    if report.missed_issues:
        if reveal_now:
            defect_by_id = {d.id: d for d in defects}
            updated_missed = _unredact_missed_issues(
                report.missed_issues,
                defect_by_id,
                scoped_output=_uses_scoped_output(report, defects),
            )
        else:
            updated_missed = redact_missed_issues(report.missed_issues)
    else:
        updated_missed = []

    summary_phrase, critique = generate_critique(
        score=new_score,
        detected_issues=updated_detected,
        missed_issues=updated_missed,
        false_positive_lines=report.false_positive_lines,
        false_positive_penalty=report.false_positive_penalty,
    )

    score_delta = new_score - report.score
    outcome_status: Literal["applied", "no_change"] = (
        "applied" if uplifted else "no_change"
    )
    outcome = JudgeOutcome(
        status=outcome_status,
        reason=None,
        key_source=key_source,
        verdicts=gated_verdicts,
        score_delta=score_delta,
    )

    return report.model_copy(
        update={
            "score": new_score,
            "line_precision_score": report.line_precision_score,
            "concept_score": new_concept_score,
            "detected_issues": updated_detected,
            "missed_issues": updated_missed,
            "summary": summary_phrase,
            "critique": critique,
            "judge": outcome,
        }
    )


__all__ = ["apply_verdicts"]
