"""Submission and review evaluation API routes."""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlmodel import Session, func, select
from starlette.concurrency import run_in_threadpool

from api.deps import ActorDep, SessionDep
from api.routes.challenges import ShareTokenQuery, get_challenge_or_404
from backend.core.config import settings
from backend.core.guest_session import mint_guest_session, write_guest_cookie
from backend.core.rate_limit import rate_limit
from backend.models.challenge import FlaggedLineItem, FlaggedLines
from backend.models.submission import Submission
from backend.services.grading import (
    MAX_BLIND_ATTEMPTS,
    PASS_SCORE_THRESHOLD,
    Finding,
    GradeReport,
    GradingPolicy,
    JudgeRequest,
    ReviewSubmission,
    grade_review,
    redact_judge_outcome,
    redact_missed_issue_dicts,
    refine_with_judge,
    should_reveal,
    validate_review_bounds,
    validate_review_text,
)
from backend.services.ownership import Actor, submission_owner_filter


router = APIRouter(prefix="/api/challenges", tags=["submissions"])


class ReviewSubmissionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    flagged_lines: FlaggedLines = Field(
        default_factory=list,
        description="Line numbers flagged as defective in the code snippet",
    )
    findings: list[Finding] | None = Field(
        default=None,
        max_length=200,
        description="v2 inline review findings anchored to lines or ranges",
    )
    comments: str = Field(
        default="",
        max_length=20000,
        description="Written review critique explaining the defect",
    )
    summary_note: str | None = Field(
        default=None,
        max_length=20000,
        description="Optional v2 summary note alias for comments",
    )
    reveal: bool = Field(
        default=False,
        description="Explicitly reveal missed issue details on this submission",
    )
    semantic_judge: bool = Field(
        default=False,
        description="Opt in to optional async semantic judge for borderline concepts",
    )

    def to_review_submission(self) -> ReviewSubmission:
        note = (
            self.summary_note if self.summary_note is not None else self.comments
        ).strip()
        if self.findings is not None:
            return ReviewSubmission(
                findings=self.findings,
                summary_note=note,
                reveal=self.reveal,
            )
        return ReviewSubmission.model_validate(
            {
                "flagged_lines": self.flagged_lines,
                "summary_note": note,
                "reveal": self.reveal,
            }
        )

    @model_validator(mode="after")
    def validate_review_payload(self) -> "ReviewSubmissionRequest":
        review = self.to_review_submission()
        validate_review_text(review)
        return self


class ReviewSubmissionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    submission_id: int
    id: int
    score: int
    line_precision_score: float = 0.0
    concept_score: float = 0.0
    false_positive_penalty: float = 0.0
    false_positive_lines: list[FlaggedLineItem] = Field(default_factory=list)
    summary: str = ""
    feedback: str
    detected_issues: list[dict[str, Any]] = Field(default_factory=list)
    missed_issues: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    flagged_lines: list[FlaggedLineItem] = Field(default_factory=list)
    findings: list[dict[str, Any]] = Field(default_factory=list)
    finding_verdicts: list[dict[str, Any]] = Field(default_factory=list)
    comments: str = ""
    session_id: str | None = None
    judge: dict[str, Any] | None = None


class SubmissionHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    attempt_number: int
    id: int
    submission_id: int
    challenge_id: int
    flagged_lines: list[FlaggedLineItem] = Field(default_factory=list)
    findings: list[dict[str, Any]] = Field(default_factory=list)
    finding_verdicts: list[dict[str, Any]] = Field(default_factory=list)
    comments: str
    score: int
    line_precision_score: float = 0.0
    concept_score: float = 0.0
    false_positive_penalty: float = 0.0
    false_positive_lines: list[FlaggedLineItem] = Field(default_factory=list)
    summary: str = ""
    feedback: str
    detected_issues: list[dict[str, Any]] = Field(default_factory=list)
    missed_issues: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    judge: dict[str, Any] | None = None


def _prepare_submission_context(
    *,
    identifier: str,
    session: Session,
    actor: Actor,
    share_token: str | None,
    review: ReviewSubmission,
) -> tuple[int, dict[str, Any], int, bool]:
    # Authorize challenge access before minting a guest cookie so 404s do not mint.
    challenge = get_challenge_or_404(
        identifier,
        session,
        actor=actor,
        share_token=share_token,
    )
    try:
        validate_review_bounds(review, challenge)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err

    needs_guest_cookie = actor.user_id is None and actor.guest_session_id is None
    prior_attempts = 0
    if not needs_guest_cookie and challenge.id is not None:
        owner_filter = submission_owner_filter(actor)
        if owner_filter is not None:
            prior_attempts = session.exec(
                select(func.count(Submission.id)).where(
                    Submission.challenge_id == challenge.id,
                    owner_filter,
                )
            ).one()

    challenge_snapshot: dict[str, Any] = {
        "expected_issues": challenge.get_expected_issues(),
        "canonical_review": challenge.canonical_review,
        "files": challenge.get_files(),
        "code_snippet": challenge.code_snippet,
    }
    return (
        challenge.id or 0,
        challenge_snapshot,
        prior_attempts,
        needs_guest_cookie,
    )


def _persist_submission(
    *,
    session: Session,
    challenge_id: int,
    actor: Actor,
    review: ReviewSubmission,
    report: GradeReport,
    unlocked: bool,
) -> ReviewSubmissionResponse:
    submission = Submission.record(
        challenge_id=challenge_id,
        user_id=actor.user_id,
        session_id=actor.guest_session_id,
        review=review,
        report=report,
    )
    session.add(submission)
    session.commit()
    session.refresh(submission)

    judge_data = submission.get_judge_outcome()
    if not unlocked:
        judge_data = redact_judge_outcome(judge_data)

    return ReviewSubmissionResponse(
        submission_id=submission.id or 0,
        id=submission.id or 0,
        score=submission.score,
        line_precision_score=submission.line_precision_score,
        concept_score=submission.concept_score,
        false_positive_penalty=submission.false_positive_penalty,
        false_positive_lines=submission.get_false_positive_lines(),
        summary=submission.summary,
        feedback=submission.feedback,
        detected_issues=submission.get_detected_issues(),
        missed_issues=submission.get_missed_issues(),
        created_at=submission.created_at,
        flagged_lines=submission.get_flagged_lines(),
        findings=submission.get_findings(),
        finding_verdicts=submission.get_finding_verdicts(),
        comments=submission.comments,
        session_id=submission.session_id,
        judge=judge_data,
    )


@router.post(
    "/{identifier}/review",
    response_model=ReviewSubmissionResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("review", 30, 60))],
)
async def submit_review(
    identifier: str,
    payload: ReviewSubmissionRequest,
    response: Response,
    session: SessionDep,
    actor: ActorDep,
    reveal: Annotated[
        bool,
        Query(description="Explicitly reveal missed issue details"),
    ] = False,
    share_token: ShareTokenQuery = None,
    x_gemini_key: Annotated[
        str | None,
        Header(
            alias="X-Gemini-Key",
            description="Optional BYOK Gemini API key for semantic judge",
        ),
    ] = None,
) -> ReviewSubmissionResponse:
    review = payload.to_review_submission()
    (
        challenge_id,
        challenge_snapshot,
        prior_attempts,
        needs_guest_cookie,
    ) = await run_in_threadpool(
        _prepare_submission_context,
        identifier=identifier,
        session=session,
        actor=actor,
        share_token=share_token,
        review=review,
    )

    if needs_guest_cookie:
        guest = mint_guest_session()
        write_guest_cookie(response, guest)
        actor = Actor.resolve(None, guest)

    policy = GradingPolicy(
        attempt_number=prior_attempts + 1,
        reveal=reveal or review.reveal,
    )
    report = await run_in_threadpool(
        grade_review,
        challenge=challenge_snapshot,
        review=review,
        policy=policy,
    )

    judge_req = JudgeRequest.from_headers(
        byok_key=x_gemini_key,
        opt_in=payload.semantic_judge,
        settings=settings,
    )
    if judge_req is not None:
        # Release pooled DB connection before waiting on external Gemini HTTP I/O.
        await run_in_threadpool(session.rollback)
        report = await refine_with_judge(
            challenge_snapshot,
            review,
            report,
            judge_req,
            policy,
            redact_judge_feedback=False,
        )

    unlocked = should_reveal(policy, review, report.score)
    return await run_in_threadpool(
        _persist_submission,
        session=session,
        challenge_id=challenge_id,
        actor=actor,
        review=review,
        report=report,
        unlocked=unlocked,
    )


@router.get(
    "/{identifier}/submissions",
    response_model=list[SubmissionHistoryResponse],
)
def get_submission_history(
    identifier: str,
    session: SessionDep,
    actor: ActorDep,
    reveal: Annotated[
        bool,
        Query(description="Explicitly reveal missed issue details"),
    ] = False,
    share_token: ShareTokenQuery = None,
) -> list[SubmissionHistoryResponse]:
    challenge = get_challenge_or_404(
        identifier,
        session,
        actor=actor,
        share_token=share_token,
    )

    owner_filter = submission_owner_filter(actor)
    if owner_filter is None:
        return []

    statement = (
        select(Submission)
        .where(
            Submission.challenge_id == challenge.id,
            owner_filter,
        )
        .order_by(Submission.created_at.asc(), Submission.id.asc())
    )
    submissions = session.exec(statement).all()
    has_unlocked = (
        reveal
        or len(submissions) >= MAX_BLIND_ATTEMPTS
        or any(sub.score >= PASS_SCORE_THRESHOLD for sub in submissions)
    )

    history_items: list[SubmissionHistoryResponse] = []
    for index, sub in enumerate(submissions, start=1):
        missed = sub.get_missed_issues()
        judge_data = sub.get_judge_outcome()
        if not has_unlocked:
            missed = redact_missed_issue_dicts(missed)
            judge_data = redact_judge_outcome(judge_data)
        history_items.append(
            SubmissionHistoryResponse(
                attempt_number=index,
                id=sub.id or 0,
                submission_id=sub.id or 0,
                challenge_id=sub.challenge_id,
                flagged_lines=sub.get_flagged_lines(),
                findings=sub.get_findings(),
                finding_verdicts=sub.get_finding_verdicts(),
                comments=sub.comments,
                score=sub.score,
                line_precision_score=sub.line_precision_score,
                concept_score=sub.concept_score,
                false_positive_penalty=sub.false_positive_penalty,
                false_positive_lines=sub.get_false_positive_lines(),
                summary=sub.summary,
                feedback=sub.feedback,
                detected_issues=sub.get_detected_issues(),
                missed_issues=missed,
                created_at=sub.created_at,
                judge=judge_data,
            )
        )

    history_items.reverse()
    return history_items
