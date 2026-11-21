"""Submission and review evaluation API routes."""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlmodel import func, select

from api.deps import ActorDep, SessionDep
from api.routes.challenges import ShareTokenQuery, get_challenge_or_404
from backend.core.guest_session import mint_guest_session, write_guest_cookie
from backend.core.rate_limit import rate_limit
from backend.models.challenge import FlaggedLines
from backend.models.submission import Submission
from backend.services.evaluation_service import (
    MAX_BLIND_ATTEMPTS,
    PASS_SCORE_THRESHOLD,
    evaluate_review,
)
from backend.services.ownership import Actor, submission_owner_filter


router = APIRouter(prefix="/api/challenges", tags=["submissions"])


class ReviewSubmissionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    flagged_lines: FlaggedLines = Field(
        default_factory=list,
        description="Line numbers flagged as defective in the code snippet",
    )
    comments: str = Field(
        ...,
        min_length=5,
        max_length=20000,
        description="Written review critique explaining the defect",
    )
    reveal: bool = Field(
        default=False,
        description="Explicitly reveal missed issue details on this submission",
    )

    @field_validator("comments")
    @classmethod
    def validate_comments(cls, comments: str) -> str:
        trimmed = comments.strip()
        if len(trimmed) < 5:
            raise ValueError("Comments must contain at least 5 characters")
        return trimmed


class ReviewSubmissionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    submission_id: int
    id: int
    score: int
    line_precision_score: float = 0.0
    concept_score: float = 0.0
    false_positive_penalty: float = 0.0
    false_positive_lines: list[int] = Field(default_factory=list)
    summary: str = ""
    feedback: str
    detected_issues: list[dict[str, Any]] = Field(default_factory=list)
    missed_issues: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    flagged_lines: list[int] = Field(default_factory=list)
    comments: str = ""
    session_id: str | None = None


class SubmissionHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    attempt_number: int
    id: int
    submission_id: int
    challenge_id: int
    flagged_lines: list[int] = Field(default_factory=list)
    comments: str
    score: int
    line_precision_score: float = 0.0
    concept_score: float = 0.0
    false_positive_penalty: float = 0.0
    false_positive_lines: list[int] = Field(default_factory=list)
    summary: str = ""
    feedback: str
    detected_issues: list[dict[str, Any]] = Field(default_factory=list)
    missed_issues: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime


@router.post(
    "/{identifier}/review",
    response_model=ReviewSubmissionResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("review", 30, 60))],
)
def submit_review(
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
) -> ReviewSubmissionResponse:
    # Authorize challenge access before minting a guest cookie so 404s do not mint
    challenge = get_challenge_or_404(
        identifier,
        session,
        actor=actor,
        share_token=share_token,
    )

    snippet_line_count = len(challenge.code_snippet.splitlines())
    if snippet_line_count == 0:
        if payload.flagged_lines:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Challenge has no code lines to flag",
            )
    else:
        if not payload.flagged_lines:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="At least one line must be flagged",
            )
        if any(line > snippet_line_count for line in payload.flagged_lines):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Flagged lines must be between 1 and {snippet_line_count}",
            )

    if actor.user_id is None and actor.guest_session_id is None:
        guest = mint_guest_session()
        write_guest_cookie(response, guest)
        actor = Actor.resolve(None, guest)

    owner_filter = submission_owner_filter(actor)
    prior_attempts = 0
    if owner_filter is not None and challenge.id is not None:
        prior_attempts = session.exec(
            select(func.count(Submission.id)).where(
                Submission.challenge_id == challenge.id,
                owner_filter,
            )
        ).one()

    eval_result = evaluate_review(
        challenge=challenge,
        flagged_lines=payload.flagged_lines,
        user_comments=payload.comments,
        attempt_number=prior_attempts + 1,
        reveal_solution=reveal or payload.reveal,
    )

    detected_issues_data = [issue.model_dump() for issue in eval_result.detected_issues]
    missed_issues_data = [issue.model_dump() for issue in eval_result.missed_issues]

    submission = Submission(
        challenge_id=challenge.id,
        user_id=actor.user_id,
        session_id=actor.guest_session_id,
        flagged_lines=payload.flagged_lines,
        comments=payload.comments,
        score=eval_result.score,
        line_precision_score=eval_result.line_precision_score,
        concept_score=eval_result.concept_score,
        false_positive_penalty=eval_result.false_positive_penalty,
        false_positive_lines=eval_result.false_positive_lines,
        summary=eval_result.summary,
        feedback=eval_result.critique,
        detected_issues=detected_issues_data,
        missed_issues=missed_issues_data,
    )
    session.add(submission)
    session.commit()
    session.refresh(submission)

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
        detected_issues=detected_issues_data,
        missed_issues=missed_issues_data,
        created_at=submission.created_at,
        flagged_lines=submission.get_flagged_lines(),
        comments=submission.comments,
        session_id=submission.session_id,
    )


def _gate_history_missed_issues(missed_issues: list[Any]) -> list[Any]:
    gated: list[Any] = []
    for item in missed_issues:
        if isinstance(item, dict):
            gated.append(
                {
                    **item,
                    "expected_lines": [],
                    "missing_keywords": [],
                    "explanation": "",
                }
            )
        else:
            gated.append(item)
    return gated


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
        if not has_unlocked:
            missed = _gate_history_missed_issues(missed)
        history_items.append(
            SubmissionHistoryResponse(
                attempt_number=index,
                id=sub.id or 0,
                submission_id=sub.id or 0,
                challenge_id=sub.challenge_id,
                flagged_lines=sub.get_flagged_lines(),
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
            )
        )

    history_items.reverse()
    return history_items
