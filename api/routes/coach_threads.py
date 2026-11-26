"""Actor-scoped Coach conversation thread and message persistence routes."""

from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Path,
    Query,
    Response,
    status,
)
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.deps import ActorDep, SessionDep
from backend.core.rate_limit import rate_limit
from backend.models.coach_thread import CoachMessage, CoachThread
from backend.services.coach_thread_service import (
    MAX_APPEND_BATCH_SIZE,
    MAX_FROM_SEQUENCE,
    MAX_MESSAGE_ID_LENGTH,
    MAX_PARTS_PER_MESSAGE,
    MAX_RAW_TITLE_LENGTH,
    MAX_THREAD_ID_LENGTH,
    CoachMessageConflictError,
    CoachMessageLimitExceeded,
    CoachThreadNotFoundError,
    CoachThreadValidationError,
    append_coach_messages,
    create_coach_thread,
    delete_coach_thread,
    get_coach_thread,
    list_coach_threads,
    rename_coach_thread,
    truncate_coach_messages,
    validate_title,
)
from backend.services.ownership import CoachThreadQuotaExceeded


router = APIRouter(prefix="/coach-threads", tags=["coach-threads"])

ThreadIdPath = Annotated[
    str,
    Path(min_length=1, max_length=MAX_THREAD_ID_LENGTH),
]


class CoachThreadSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    title: str
    mode: Literal["patterns", "debrief"]
    challenge_slug: str | None = None
    message_count: int = Field(ge=0)
    created_at: datetime
    updated_at: datetime


class CoachThreadListResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: list[CoachThreadSummary] = Field(default_factory=list)
    total: int = Field(default=0, ge=0)


class CoachMessageResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    role: Literal["user", "assistant"]
    parts: list[dict[str, Any]]
    sequence: int = Field(ge=0)
    created_at: datetime


class CoachThreadDetailResponse(CoachThreadSummary):
    messages: list[CoachMessageResponse] = Field(default_factory=list)


class CreateCoachThreadRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = Field(default=None, max_length=MAX_RAW_TITLE_LENGTH)
    mode: Literal["patterns", "debrief"] = "patterns"
    challenge_slug: str | None = Field(default=None, max_length=200)


class RenameCoachThreadRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(max_length=MAX_RAW_TITLE_LENGTH)

    @field_validator("title")
    @classmethod
    def validate_thread_title(cls, value: str) -> str:
        try:
            return validate_title(value)
        except CoachThreadValidationError as exc:
            raise ValueError(str(exc)) from exc


class CoachMessageInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str | None = Field(default=None, max_length=MAX_MESSAGE_ID_LENGTH)
    role: Literal["user", "assistant"]
    parts: list[dict[str, Any]] = Field(min_length=1, max_length=MAX_PARTS_PER_MESSAGE)


class AppendCoachMessagesRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    messages: list[CoachMessageInput] = Field(
        min_length=1,
        max_length=MAX_APPEND_BATCH_SIZE,
    )


class AppendCoachMessagesResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    thread: CoachThreadSummary
    messages: list[CoachMessageResponse]
    message_count: int = Field(ge=0)


class TruncateCoachMessagesResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    deleted_count: int = Field(ge=0)
    remaining_count: int = Field(ge=0)


def _to_thread_summary(thread: CoachThread, message_count: int) -> CoachThreadSummary:
    mode: Literal["patterns", "debrief"] = (
        "debrief" if thread.mode == "debrief" else "patterns"
    )
    return CoachThreadSummary(
        id=thread.id,
        title=thread.title,
        mode=mode,
        challenge_slug=thread.challenge_slug,
        message_count=message_count,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


def _to_message_response(message: CoachMessage) -> CoachMessageResponse:
    role: Literal["user", "assistant"] = (
        "assistant" if message.role == "assistant" else "user"
    )
    return CoachMessageResponse(
        id=message.id,
        role=role,
        parts=message.get_parts(),
        sequence=message.sequence,
        created_at=message.created_at,
    )


def _raise_domain_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, CoachThreadNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc) or "Coach thread not found",
        )
    if isinstance(exc, CoachThreadValidationError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        )
    if isinstance(
        exc,
        (
            CoachThreadQuotaExceeded,
            CoachMessageLimitExceeded,
            CoachMessageConflictError,
        ),
    ):
        detail = exc.message if isinstance(exc, CoachThreadQuotaExceeded) else str(exc)
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        )
    raise exc


@router.get(
    "",
    response_model=CoachThreadListResponse,
    status_code=status.HTTP_200_OK,
)
def list_coach_threads_endpoint(
    session: SessionDep,
    actor: ActorDep,
    limit: Annotated[
        int,
        Query(ge=1, le=100, description="Maximum number of coach threads to return"),
    ] = 30,
    offset: Annotated[
        int,
        Query(ge=0, le=100_000, description="Number of coach threads to skip"),
    ] = 0,
    mode: Annotated[
        str | None,
        Query(max_length=32, description="Filter by coach mode (patterns or debrief)"),
    ] = None,
    challenge_slug: Annotated[
        str | None,
        Query(max_length=200, description="Filter by debrief challenge slug"),
    ] = None,
) -> CoachThreadListResponse:
    """List coach threads owned by the current authenticated user or guest."""
    normalized_mode = mode if mode else None
    normalized_slug = challenge_slug if challenge_slug else None
    try:
        rows, total = list_coach_threads(
            session,
            actor,
            limit=limit,
            offset=offset,
            mode=normalized_mode,
            challenge_slug=normalized_slug,
        )
    except CoachThreadValidationError as exc:
        raise _raise_domain_http_error(exc) from exc

    return CoachThreadListResponse(
        items=[_to_thread_summary(thread, count) for thread, count in rows],
        total=total,
    )


@router.post(
    "",
    response_model=CoachThreadSummary,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("coach-thread-create", 120, 60))],
)
def create_coach_thread_endpoint(
    session: SessionDep,
    actor: ActorDep,
    payload: Annotated[CreateCoachThreadRequest | None, Body()] = None,
) -> CoachThreadSummary:
    """Create a new actor-scoped coach thread."""
    if actor.user_id is None and actor.guest_session_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication or verified guest session required",
        )

    body = payload or CreateCoachThreadRequest()
    try:
        thread = create_coach_thread(
            session,
            actor,
            title=body.title,
            mode=body.mode,
            challenge_slug=body.challenge_slug,
        )
    except CoachThreadQuotaExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Maximum limit of {exc.limit} coach threads reached. "
                "Delete an existing thread to create a new one."
            ),
        ) from exc
    except CoachThreadValidationError as exc:
        raise _raise_domain_http_error(exc) from exc

    return _to_thread_summary(thread, 0)


@router.get(
    "/{thread_id}",
    response_model=CoachThreadDetailResponse,
    status_code=status.HTTP_200_OK,
)
def get_coach_thread_endpoint(
    thread_id: ThreadIdPath,
    session: SessionDep,
    actor: ActorDep,
) -> CoachThreadDetailResponse:
    """Fetch a single actor-owned coach thread and its ordered messages."""
    try:
        thread, messages = get_coach_thread(session, actor, thread_id)
    except CoachThreadNotFoundError as exc:
        raise _raise_domain_http_error(exc) from exc

    summary = _to_thread_summary(thread, len(messages))
    return CoachThreadDetailResponse(
        **summary.model_dump(),
        messages=[_to_message_response(msg) for msg in messages],
    )


@router.patch(
    "/{thread_id}",
    response_model=CoachThreadSummary,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("coach-thread-rename", 120, 60))],
)
def rename_coach_thread_endpoint(
    thread_id: ThreadIdPath,
    payload: RenameCoachThreadRequest,
    session: SessionDep,
    actor: ActorDep,
) -> CoachThreadSummary:
    """Rename an actor-owned coach thread."""
    try:
        thread, count = rename_coach_thread(session, actor, thread_id, payload.title)
    except (CoachThreadNotFoundError, CoachThreadValidationError) as exc:
        raise _raise_domain_http_error(exc) from exc

    return _to_thread_summary(thread, count)


@router.delete(
    "/{thread_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit("coach-thread-delete", 120, 60))],
)
def delete_coach_thread_endpoint(
    thread_id: ThreadIdPath,
    response: Response,
    session: SessionDep,
    actor: ActorDep,
) -> None:
    """Delete an actor-owned coach thread and all its messages."""
    try:
        delete_coach_thread(session, actor, thread_id)
    except CoachThreadNotFoundError as exc:
        raise _raise_domain_http_error(exc) from exc

    response.status_code = status.HTTP_204_NO_CONTENT
    return None


@router.post(
    "/{thread_id}/messages",
    response_model=AppendCoachMessagesResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("coach-thread-append", 120, 60))],
)
def append_coach_messages_endpoint(
    thread_id: ThreadIdPath,
    payload: AppendCoachMessagesRequest,
    session: SessionDep,
    actor: ActorDep,
) -> AppendCoachMessagesResponse:
    """Append or update messages in an actor-owned coach thread."""
    try:
        thread, messages, count = append_coach_messages(
            session,
            actor,
            thread_id,
            payload.messages,
        )
    except (
        CoachThreadNotFoundError,
        CoachThreadValidationError,
        CoachMessageLimitExceeded,
        CoachMessageConflictError,
    ) as exc:
        raise _raise_domain_http_error(exc) from exc

    return AppendCoachMessagesResponse(
        thread=_to_thread_summary(thread, count),
        messages=[_to_message_response(msg) for msg in messages],
        message_count=count,
    )


@router.delete(
    "/{thread_id}/messages",
    response_model=TruncateCoachMessagesResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("coach-thread-truncate", 120, 60))],
)
def truncate_coach_messages_endpoint(
    thread_id: ThreadIdPath,
    session: SessionDep,
    actor: ActorDep,
    from_sequence: Annotated[
        int,
        Query(
            ge=0,
            le=MAX_FROM_SEQUENCE,
            description="Delete messages with sequence >= from_sequence",
        ),
    ],
) -> TruncateCoachMessagesResponse:
    """Truncate messages from a sequence index onward in an owned coach thread."""
    try:
        deleted_count, remaining_count = truncate_coach_messages(
            session,
            actor,
            thread_id,
            from_sequence,
        )
    except (CoachThreadNotFoundError, CoachThreadValidationError) as exc:
        raise _raise_domain_http_error(exc) from exc

    return TruncateCoachMessagesResponse(
        deleted_count=deleted_count,
        remaining_count=remaining_count,
    )
