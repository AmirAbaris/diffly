import json
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, or_, select
from sqlmodel.sql.expression import SelectOfScalar

from api.deps import ActorDep, OwnerActorDep, SessionDep
from backend.core.rate_limit import rate_limit
from backend.models.challenge import (
    Category,
    Challenge,
    ChallengeDetail,
    ChallengeFile,
    ChallengeSolutionResponse,
    ChallengeSummary,
    CustomChallengeResponse,
    CustomChallengesListResponse,
    DefectCriterion,
    Difficulty,
    FlaggedLineItem,
    FlaggedLines,
    GenerateCustomChallengeRequest,
    HintResponse,
    Language,
    validate_flagged_line_bounds,
)
from backend.models.submission import Submission
from backend.services.evaluation_service import (
    DetectedIssue,
    MissedIssue,
    evaluate_review,
)
from backend.services.gemini_generator import (
    GeminiAPIError,
    GeminiAuthError,
    GeminiRateLimitError,
    GeminiSchemaError,
    generate_custom_challenge,
)
from backend.services.ownership import (
    CUSTOM_CHALLENGE_QUOTA,
    Actor,
    CustomQuotaExceeded,
    can_access_challenge,
    challenge_owner_filter,
    ensure_custom_quota,
    is_challenge_owner,
    submission_owner_filter,
)


router = APIRouter(prefix="/api/challenges", tags=["challenges"])

_QUOTA_REACHED_DETAIL = (
    f"Quota limit reached. You can have at most {CUSTOM_CHALLENGE_QUOTA} custom "
    "challenges. Please delete an existing custom challenge to create a new one."
)


def _compute_best_scores_map(
    session: Session,
    challenges: list[Challenge],
    actor: Actor,
) -> dict[int, int]:
    """Compute highest submission score per challenge for the given actor."""
    owner_filter = submission_owner_filter(actor)
    if owner_filter is None or not challenges:
        return {}
    challenge_ids = [ch.id for ch in challenges if ch.id is not None]
    if not challenge_ids:
        return {}
    sub_stmt = (
        select(Submission.challenge_id, func.max(Submission.score))
        .where(
            Submission.challenge_id.in_(challenge_ids),
            owner_filter,
        )
        .group_by(Submission.challenge_id)
    )
    return {
        ch_id: int(max_score)
        for ch_id, max_score in session.exec(sub_stmt).all()
        if max_score is not None
    }


@router.get("", response_model=list[ChallengeSummary])
def list_challenges(
    session: SessionDep,
    actor: ActorDep,
    difficulty: Annotated[
        Difficulty | None,
        Query(description="Filter by challenge difficulty level"),
    ] = None,
    category: Annotated[
        Category | None,
        Query(description="Filter by challenge category"),
    ] = None,
    language: Annotated[
        Language | None,
        Query(description="Filter by programming language"),
    ] = None,
    search: Annotated[
        str | None,
        Query(description="Search by title, description, or slug"),
    ] = None,
) -> list[ChallengeSummary]:
    """Retrieve list of challenges with optional filtering and completion status."""
    statement = select(Challenge).where(Challenge.is_public.is_(True))

    if difficulty is not None:
        statement = statement.where(Challenge.difficulty == difficulty)
    if category is not None:
        statement = statement.where(Challenge.category == category)
    if language is not None:
        statement = statement.where(Challenge.language == language)
    if search and search.strip():
        search_pattern = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                Challenge.title.ilike(search_pattern),
                Challenge.description.ilike(search_pattern),
                Challenge.slug.ilike(search_pattern),
            )
        )

    statement = statement.order_by(Challenge.id)
    challenges = list(session.exec(statement).all())

    best_scores_map = _compute_best_scores_map(session, challenges, actor)

    return [
        ch.to_summary(
            is_solved=(
                best_scores_map.get(ch.id or 0) is not None
                and best_scores_map[ch.id or 0] >= 80
            ),
            best_score=best_scores_map.get(ch.id or 0),
        )
        for ch in challenges
    ]


class CustomEvaluationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    expected_issues: list[DefectCriterion] = Field(
        ...,
        max_length=20,
        description="Expected defect criteria for grading",
    )
    code_snippet: str = Field(
        default="",
        max_length=50000,
        description="Code snippet of the challenge",
    )
    files: list[ChallengeFile] = Field(
        default_factory=list,
        max_length=25,
        description="Optional multi-file PR entries for evaluation",
    )
    flagged_lines: FlaggedLines = Field(
        default_factory=list,
        description="Line numbers flagged by reviewer as defective",
    )
    comments: str = Field(
        default="",
        max_length=20000,
        description="User review critique explaining the defect",
    )

    @model_validator(mode="after")
    def validate_flagged_lines_bounds(self) -> "CustomEvaluationRequest":
        if self.flagged_lines and (self.code_snippet or self.files):
            validate_flagged_line_bounds(
                self.flagged_lines,
                code_snippet=self.code_snippet,
                files=self.files,
                require_non_empty=False,
            )
        return self


class CustomEvaluationResponse(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    score: int = Field(ge=0, le=100)
    line_precision_score: float = Field(default=0.0, ge=0.0, le=100.0)
    concept_score: float = Field(default=0.0, ge=0.0, le=100.0)
    false_positive_penalty: float = Field(default=0.0, ge=0.0)
    false_positive_lines: list[FlaggedLineItem] = Field(default_factory=list)
    detected_issues: list[DetectedIssue] = Field(default_factory=list)
    missed_issues: list[MissedIssue] = Field(default_factory=list)
    summary: str = ""
    critique: str = ""
    feedback: str = ""
    execution_time_ms: float = 0.0
    flagged_lines: list[FlaggedLineItem] = Field(default_factory=list)
    comments: str = ""


@router.post(
    "/generate-custom",
    response_model=CustomChallengeResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("generate-custom", 10, 60))],
)
async def generate_custom_challenge_endpoint(
    payload: GenerateCustomChallengeRequest,
    session: SessionDep,
    actor: OwnerActorDep,
    x_gemini_key: Annotated[
        str | None,
        Header(
            alias="X-Gemini-Key",
            description="User-supplied Google Gemini API key",
        ),
    ] = None,
) -> CustomChallengeResponse:
    """Generate a custom challenge and persist to PostgreSQL (max 5 quota)."""
    if not x_gemini_key or not x_gemini_key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Missing or invalid Gemini API key. "
                "Provide a valid key in the X-Gemini-Key header."
            ),
        )

    try:
        ensure_custom_quota(session, actor, lock=False)
    except CustomQuotaExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_QUOTA_REACHED_DETAIL,
        ) from exc
    finally:
        # Release read transaction and pooled connection before external Gemini HTTP I/O
        session.rollback()

    try:
        generated = await generate_custom_challenge(
            request=payload,
            api_key=x_gemini_key,
        )
    except GeminiAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except GeminiRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (GeminiAPIError, GeminiSchemaError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    max_persist_attempts = 5
    new_challenge: Challenge | None = None
    base_slug = generated.slug
    expected_issues_json = json.dumps(
        [issue.model_dump() for issue in generated.expected_issues]
    )
    hints_json = json.dumps([h.model_dump() for h in generated.hints])

    for attempt in range(max_persist_attempts):
        try:
            ensure_custom_quota(session, actor, lock=True)
        except CustomQuotaExceeded as exc:
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=_QUOTA_REACHED_DETAIL,
            ) from exc

        candidate_slug = base_slug if attempt == 0 else f"{base_slug}-{uuid4().hex[:6]}"
        while (
            session.exec(
                select(Challenge.id).where(Challenge.slug == candidate_slug)
            ).first()
            is not None
        ):
            candidate_slug = f"{base_slug}-{uuid4().hex[:6]}"

        candidate = Challenge(
            slug=candidate_slug,
            title=generated.title,
            difficulty=generated.difficulty,
            category=generated.category,
            language=generated.language,
            description=generated.description,
            threat_model=generated.threat_model,
            defect_target=generated.defect_target,
            code_snippet=generated.code_snippet,
            expected_issues=expected_issues_json,
            hints=hints_json,
            canonical_review=generated.canonical_review,
            recommended_fix_diff=generated.recommended_fix_diff,
            estimated_minutes=generated.estimated_minutes,
            is_public=False,
            user_id=actor.user_id,
            session_id=actor.guest_session_id,
        )
        session.add(candidate)
        try:
            session.commit()
            session.refresh(candidate)
            new_challenge = candidate
            break
        except IntegrityError as exc:
            session.rollback()
            if attempt == max_persist_attempts - 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Failed to allocate a unique challenge slug. Please retry.",
                ) from exc

    if new_challenge is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Failed to allocate a unique challenge slug. Please retry.",
        )

    return CustomChallengeResponse(
        id=new_challenge.id or 0,
        slug=new_challenge.slug,
        title=new_challenge.title,
        difficulty=new_challenge.difficulty,
        category=new_challenge.category,
        language=new_challenge.language,
        description=new_challenge.description,
        threat_model=new_challenge.threat_model,
        defect_target=new_challenge.defect_target,
        code_snippet=new_challenge.code_snippet,
        expected_issues=new_challenge.get_expected_issues(),
        hints=[h.to_response() for h in new_challenge.get_hints()],
        canonical_review=new_challenge.canonical_review,
        recommended_fix_diff=new_challenge.recommended_fix_diff,
        estimated_minutes=new_challenge.estimated_minutes,
        line_count=len(new_challenge.code_snippet.splitlines()),
        total_hints=len(new_challenge.get_hints()),
        is_custom=True,
        session_id=actor.guest_session_id,
    )


@router.get("/custom", response_model=CustomChallengesListResponse)
def list_custom_challenges(
    session: SessionDep,
    actor: ActorDep,
) -> CustomChallengesListResponse:
    """List the current user's private custom challenges and quota status."""
    owner_filter = challenge_owner_filter(actor)

    if owner_filter is None:
        return CustomChallengesListResponse(
            items=[],
            total=0,
            quota_limit=CUSTOM_CHALLENGE_QUOTA,
            quota_remaining=CUSTOM_CHALLENGE_QUOTA,
        )

    stmt = (
        select(Challenge)
        .where(Challenge.is_public.is_(False), owner_filter)
        .order_by(Challenge.created_at.desc())
    )
    challenges = list(session.exec(stmt).all())
    best_scores_map = _compute_best_scores_map(session, challenges, actor)

    summaries = [
        ch.to_summary(
            is_solved=(
                best_scores_map.get(ch.id or 0) is not None
                and best_scores_map[ch.id or 0] >= 80
            ),
            best_score=best_scores_map.get(ch.id or 0),
        )
        for ch in challenges
    ]
    total = len(summaries)
    return CustomChallengesListResponse(
        items=summaries,
        total=total,
        quota_limit=CUSTOM_CHALLENGE_QUOTA,
        quota_remaining=max(0, CUSTOM_CHALLENGE_QUOTA - total),
    )


_INT32_MAX = 2_147_483_647


def parse_positive_int32(identifier: str) -> int | None:
    """Parse an ASCII positive 32-bit integer identifier, or return None."""
    if (
        not identifier
        or identifier[0] == "0"
        or len(identifier) > 10
        or not (identifier.isascii() and identifier.isdigit())
    ):
        return None
    val = int(identifier)
    if 1 <= val <= _INT32_MAX:
        return val
    return None


def _challenge_lookup_statement(identifier: str) -> SelectOfScalar[Challenge]:
    ch_id = parse_positive_int32(identifier)
    if ch_id is not None:
        return select(Challenge).where(
            or_(Challenge.id == ch_id, Challenge.slug == identifier)
        )
    return select(Challenge).where(Challenge.slug == identifier)


@router.delete("/custom/{identifier}")
def delete_custom_challenge(
    identifier: str,
    session: SessionDep,
    actor: ActorDep,
) -> dict[str, Any]:
    """Delete a user's private custom challenge to free up quota."""
    stmt = _challenge_lookup_statement(identifier)

    challenge = session.exec(stmt).first()
    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Challenge not found",
        )

    if challenge.is_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete public catalog challenges",
        )

    if not is_challenge_owner(challenge, actor):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Challenge not found",
        )

    sub_stmt = select(Submission).where(Submission.challenge_id == challenge.id)
    for sub in session.exec(sub_stmt).all():
        session.delete(sub)

    deleted_id = challenge.id
    deleted_slug = challenge.slug
    session.delete(challenge)
    session.commit()

    return {
        "detail": "Custom challenge deleted successfully",
        "id": deleted_id,
        "slug": deleted_slug,
    }


@router.post(
    "/evaluate-custom",
    response_model=CustomEvaluationResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("evaluate-custom", 30, 60))],
)
def evaluate_custom_challenge_endpoint(
    payload: CustomEvaluationRequest,
) -> CustomEvaluationResponse:
    """Statelessly evaluate a review submission against custom challenge metadata."""
    eval_result = evaluate_review(
        challenge={
            "expected_issues": payload.expected_issues,
            "code_snippet": payload.code_snippet,
            "files": payload.files,
        },
        flagged_lines=payload.flagged_lines,
        user_comments=payload.comments,
    )

    return CustomEvaluationResponse(
        score=eval_result.score,
        line_precision_score=eval_result.line_precision_score,
        concept_score=eval_result.concept_score,
        false_positive_penalty=eval_result.false_positive_penalty,
        false_positive_lines=eval_result.false_positive_lines,
        detected_issues=eval_result.detected_issues,
        missed_issues=eval_result.missed_issues,
        summary=eval_result.summary,
        critique=eval_result.critique,
        feedback=eval_result.critique,
        execution_time_ms=eval_result.execution_time_ms,
        flagged_lines=payload.flagged_lines,
        comments=payload.comments,
    )


def get_challenge_or_404(
    identifier: str,
    session: Session,
    actor: Actor | None = None,
) -> Challenge:
    """Find a challenge by ID or slug, raising 404 if missing or unauthorized."""
    statement = _challenge_lookup_statement(identifier)

    challenge = session.exec(statement).first()
    if challenge is None or not can_access_challenge(challenge, actor or Actor()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Challenge not found",
        )

    return challenge


@router.get("/{identifier}", response_model=ChallengeDetail)
def get_challenge(
    identifier: str,
    session: SessionDep,
    actor: ActorDep,
) -> ChallengeDetail:
    """Retrieve challenge detail by numeric ID or URL slug with completion status."""
    challenge = get_challenge_or_404(identifier, session, actor=actor)

    owner_filter = submission_owner_filter(actor)

    best_score: int | None = None
    if owner_filter is not None and challenge.id is not None:
        max_score = session.exec(
            select(func.max(Submission.score)).where(
                Submission.challenge_id == challenge.id,
                owner_filter,
            )
        ).one()
        if max_score is not None:
            best_score = int(max_score)

    is_solved = best_score is not None and best_score >= 80

    return challenge.to_detail(is_solved=is_solved, best_score=best_score)


@router.get("/{identifier}/hints", response_model=list[HintResponse])
def get_challenge_hints(
    identifier: str,
    session: SessionDep,
    actor: ActorDep,
    tier: Annotated[
        int | None,
        Query(
            ge=1,
            le=3,
            description="Filter by progressive hint tier (1, 2, or 3)",
        ),
    ] = None,
) -> list[HintResponse]:
    """Retrieve progressive tiered hints for a challenge by numeric ID or URL slug."""
    challenge = get_challenge_or_404(identifier, session, actor=actor)

    hints = [h.to_response() for h in challenge.get_hints()]
    hints.sort(key=lambda h: h.tier)

    if tier is not None:
        hints = [h for h in hints if h.tier == tier]

    return hints


@router.get("/{identifier}/solution", response_model=ChallengeSolutionResponse)
def get_challenge_solution(
    identifier: str,
    session: SessionDep,
    actor: ActorDep,
    reveal: Annotated[
        bool,
        Query(description="Explicitly reveal solution without prior submission"),
    ] = False,
) -> ChallengeSolutionResponse:
    """Retrieve canonical expert review, recommended fix diff, and expected issues.

    Requires at least one submission attempt for the challenge or explicit ?reveal=true.
    """
    challenge = get_challenge_or_404(identifier, session, actor=actor)

    if not reveal:
        owner_filter = submission_owner_filter(actor)

        has_submitted = False
        if owner_filter is not None and challenge.id is not None:
            stmt = select(Submission.id).where(
                Submission.challenge_id == challenge.id,
                owner_filter,
            )
            has_submitted = session.exec(stmt).first() is not None

        if not has_submitted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Submission required to view solution. "
                    "Submit a review attempt first or pass reveal=true."
                ),
            )

    return ChallengeSolutionResponse(
        id=challenge.id or 0,
        challenge_id=challenge.id or 0,
        slug=challenge.slug,
        canonical_review=challenge.canonical_review,
        recommended_fix_diff=challenge.recommended_fix_diff,
        expected_issues=challenge.get_expected_issues(),
    )
