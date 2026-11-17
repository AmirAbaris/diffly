"""Submission and review evaluation API routes."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlmodel import select

from api.deps import ActorDep, SessionDep
from api.routes.challenges import get_challenge_or_404
from backend.core.guest_session import mint_guest_session, write_guest_cookie
from backend.models.submission import Submission
from backend.services.evaluation_service import evaluate_review
from backend.services.ownership import Actor, submission_owner_filter


router = APIRouter(prefix="/api/challenges", tags=["submissions"])


class ReviewSubmissionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    flagged_lines: list[int] = Field(
        default_factory=list,
        description="Line numbers flagged as defective in the code snippet",
    )
    comments: str = Field(
        ...,
        min_length=5,
        description="Written review critique explaining the defect",
    )

    @field_validator("flagged_lines")
    @classmethod
    def validate_flagged_lines(cls, lines: list[int]) -> list[int]:
        for line in lines:
            if not isinstance(line, int) or line <= 0:
                raise ValueError("Flagged lines must be valid positive integers (>= 1)")
        return lines

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
    feedback: str
    detected_issues: list[dict[str, Any]] = Field(default_factory=list)
    missed_issues: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime


@router.post(
    "/{identifier}/review",
    response_model=ReviewSubmissionResponse,
    status_code=status.HTTP_200_OK,
)
def submit_review(
    identifier: str,
    payload: ReviewSubmissionRequest,
    response: Response,
    session: SessionDep,
    actor: ActorDep,
) -> ReviewSubmissionResponse:
    # Authorize challenge access before minting a guest cookie so 404s do not mint
    challenge = get_challenge_or_404(identifier, session, actor=actor)

    if actor.user_id is None and actor.guest_session_id is None:
        guest = mint_guest_session()
        write_guest_cookie(response, guest)
        actor = Actor.resolve(None, guest)

    eval_result = evaluate_review(
        challenge=challenge,
        flagged_lines=payload.flagged_lines,
        user_comments=payload.comments,
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
        feedback=submission.feedback,
        detected_issues=detected_issues_data,
        missed_issues=missed_issues_data,
        created_at=submission.created_at,
        flagged_lines=submission.get_flagged_lines(),
        comments=submission.comments,
        session_id=submission.session_id,
    )


@router.get(
    "/{identifier}/submissions",
    response_model=list[SubmissionHistoryResponse],
)
def get_submission_history(
    identifier: str,
    session: SessionDep,
    actor: ActorDep,
) -> list[SubmissionHistoryResponse]:
    challenge = get_challenge_or_404(identifier, session, actor=actor)

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

    history_items: list[SubmissionHistoryResponse] = []
    for index, sub in enumerate(submissions, start=1):
        history_items.append(
            SubmissionHistoryResponse(
                attempt_number=index,
                id=sub.id or 0,
                submission_id=sub.id or 0,
                challenge_id=sub.challenge_id,
                flagged_lines=sub.get_flagged_lines(),
                comments=sub.comments,
                score=sub.score,
                feedback=sub.feedback,
                detected_issues=sub.get_detected_issues(),
                missed_issues=sub.get_missed_issues(),
                created_at=sub.created_at,
            )
        )

    history_items.reverse()
    return history_items
