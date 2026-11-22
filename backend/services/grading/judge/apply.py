"""Pure, raise-only verdict application for the optional semantic judge."""

from collections.abc import Sequence
from typing import Literal

from backend.models.challenge import DefectCriterion, FlaggedLineRef
from backend.services.grading.judge.models import JudgeDefectVerdict, JudgeOutcome
from backend.services.grading.judge.prompt import (
    BorderlineDefectEvidence,
    collect_borderline_evidence,
    pair_defects_with_issues,
)
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
    defects: Sequence[DefectCriterion],
    *,
    scoped_output: bool,
    default_file_path: str | None = None,
) -> list[MissedIssue]:
    used_defects: set[int] = set()
    restored: list[MissedIssue] = []

    for item in missed_issues:
        d_idx = getattr(item, "_defect_index", None)
        defect: DefectCriterion | None = None
        if isinstance(d_idx, int) and 0 <= d_idx < len(defects):
            defect = defects[d_idx]
            used_defects.add(d_idx)
        else:
            for idx, cand in enumerate(defects):
                if idx in used_defects or cand.id != item.id:
                    continue
                if (cand.title or cand.id) == (item.title or item.id):
                    defect = cand
                    used_defects.add(idx)
                    break
            if defect is None:
                for idx, cand in enumerate(defects):
                    if idx not in used_defects and cand.id == item.id:
                        defect = cand
                        used_defects.add(idx)
                        break

        if defect is None:
            restored.append(item)
            continue

        expected_lines = item.expected_lines
        if not expected_lines:
            scoped = defect.get_scoped_lines(default_file_path=default_file_path)
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
                    "denied_keywords": list(item.denied_keywords),
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
    default_file_path: str | None = None,
    borderline_evidence: Sequence[BorderlineDefectEvidence] | None = None,
    redact_judge_feedback: bool = True,
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

    weights = defect_weights(defects, policy.severity_weights) if defects else ()
    paired_detected = (
        pair_defects_with_issues(
            defects, report.detected_issues, report.missed_issues, weights
        )
        if defects
        else {}
    )
    det_obj_to_idx = {id(issue): d_idx for d_idx, issue in paired_detected.items()}

    evidence_items = (
        list(borderline_evidence)
        if borderline_evidence is not None
        else collect_borderline_evidence(
            {"expected_issues": defects},
            review,
            report,
            defects=defects,
            policy=policy,
        )
    )
    max_credit_by_idx = {ev.defect_index: ev.max_credit for ev in evidence_items}
    max_credit_by_id = {ev.defect_id: ev.max_credit for ev in evidence_items}

    uplifted = False
    updated_detected: list[DetectedIssue] = []
    for issue in report.detected_issues:
        d_idx = det_obj_to_idx.get(id(issue))
        verdict = verdict_by_id.get(issue.id)
        max_credit = (
            max_credit_by_idx.get(d_idx, max_credit_by_id.get(issue.id, 1.0))
            if d_idx is not None
            else max_credit_by_id.get(issue.id, 1.0)
        )
        if verdict is not None:
            effective_credit = min(float(verdict.concept_credit), max_credit)
        else:
            effective_credit = 0.0

        if verdict is not None and effective_credit > issue.concept_score:
            uplifted = True
            updated_issue = issue.model_copy(
                update={
                    "concept_score": effective_credit,
                    "concept_source": "judge",
                }
            )
            if d_idx is not None:
                updated_issue._defect_index = d_idx
                paired_detected[d_idx] = updated_issue
            updated_detected.append(updated_issue)
        else:
            updated_detected.append(issue)

    if defects:
        line_scores: list[float] = []
        concept_scores: list[float] = []
        for idx in range(len(defects)):
            matched_issue = paired_detected.get(idx)
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
        v
        if (reveal_now or not redact_judge_feedback)
        else v.model_copy(update={"feedback": ""})
        for v in filtered_verdicts
    ]

    raw_missed = getattr(report, "_raw_missed_issues", None)
    if report.missed_issues:
        if reveal_now:
            if raw_missed is not None:
                updated_missed = [item.model_copy() for item in raw_missed]
            else:
                updated_missed = _unredact_missed_issues(
                    report.missed_issues,
                    defects,
                    scoped_output=_uses_scoped_output(report, defects),
                    default_file_path=default_file_path,
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

    updated_report = report.model_copy(
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
    updated_report._raw_missed_issues = raw_missed if not reveal_now else None
    return updated_report


__all__ = ["apply_verdicts"]
