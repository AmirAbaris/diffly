"""Actor-scoped persistence service for Coach conversation threads and messages."""

import json
import re
import uuid
from collections.abc import Mapping, Sequence
from typing import Any

from sqlalchemy import delete as sa_delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from sqlmodel import Session, func, select

from backend.models.coach_thread import CoachMessage, CoachThread
from backend.models.user import get_utc_now
from backend.services.ownership import (
    Actor,
    coach_thread_owner_filter,
    ensure_coach_thread_quota,
    lock_actor_scope,
)


DEFAULT_THREAD_TITLE = "New chat"
MAX_THREAD_ID_LENGTH = 64
MAX_MESSAGE_ID_LENGTH = 128
MAX_TITLE_LENGTH = 120
MAX_RAW_TITLE_LENGTH = 200
AUTO_TITLE_MAX_LENGTH = 80
MAX_CHALLENGE_SLUG_LENGTH = 200
MAX_PARTS_PER_MESSAGE = 50
MAX_TEXT_PART_CHARS = 16_000
MAX_PARTS_JSON_BYTES = 131_072
MAX_MESSAGES_PER_THREAD = 200
MAX_APPEND_BATCH_SIZE = 20
MAX_JSON_DEPTH = 20
MAX_FROM_SEQUENCE = 2_147_483_647

VALID_MODES = ("patterns", "debrief")
VALID_ROLES = ("user", "assistant")
TERMINAL_TOOL_STATES = frozenset(
    {
        "output-available",
        "output-error",
        "output-denied",
    }
)
NON_TERMINAL_TOOL_STATES = frozenset(
    {
        "input-streaming",
        "input-available",
        "approval-requested",
        "approval-responded",
    }
)
VALID_TOOL_STATES = TERMINAL_TOOL_STATES | NON_TERMINAL_TOOL_STATES

_MESSAGE_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}\Z")
_TOOL_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+\Z")
_ALLOWED_USER_TEXT_KEYS = frozenset({"type", "text"})


class CoachThreadNotFoundError(Exception):
    """Raised when a coach thread does not exist or is not owned by the actor."""


class CoachThreadValidationError(Exception):
    """Raised when coach thread or message payloads violate domain constraints."""


class CoachMessageLimitExceeded(Exception):
    """Raised when appending messages exceeds the per-thread message cap."""


class CoachMessageConflictError(Exception):
    """Raised on conflicting message updates, role mismatch, or sequence race."""


def _has_control_chars(value: str) -> bool:
    return any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in value)


def _validate_thread_id(thread_id: str) -> None:
    if (
        not isinstance(thread_id, str)
        or not thread_id
        or len(thread_id) > MAX_THREAD_ID_LENGTH
        or _has_control_chars(thread_id)
    ):
        raise CoachThreadNotFoundError("Coach thread not found")


def _validate_parts_tree(value: Any) -> None:
    stack: list[tuple[Any, int]] = [(value, 0)]
    while stack:
        node, depth = stack.pop()
        if isinstance(node, str):
            if "\x00" in node:
                raise CoachThreadValidationError(
                    "Message parts cannot contain null bytes"
                )
        elif isinstance(node, (list, tuple)):
            if depth > MAX_JSON_DEPTH:
                raise CoachThreadValidationError(
                    "Message parts nesting depth exceeds limit"
                )
            for item in node:
                stack.append((item, depth + 1))
        elif isinstance(node, dict):
            if depth > MAX_JSON_DEPTH:
                raise CoachThreadValidationError(
                    "Message parts nesting depth exceeds limit"
                )
            for key, item in node.items():
                if isinstance(key, str) and "\x00" in key:
                    raise CoachThreadValidationError(
                        "Message parts cannot contain null bytes"
                    )
                stack.append((item, depth + 1))


def validate_title(title: str) -> str:
    """Validate and normalize a coach thread title."""
    if not isinstance(title, str):
        raise CoachThreadValidationError("Title must be a string")
    if len(title) > MAX_RAW_TITLE_LENGTH:
        raise CoachThreadValidationError(
            f"Title must be between 1 and {MAX_TITLE_LENGTH} characters"
        )
    if _has_control_chars(title):
        raise CoachThreadValidationError("Title must not contain control characters")
    cleaned = title.strip()
    if not cleaned or len(cleaned) > MAX_TITLE_LENGTH:
        raise CoachThreadValidationError(
            f"Title must be between 1 and {MAX_TITLE_LENGTH} characters"
        )
    return cleaned


def validate_mode_and_slug(
    mode: str,
    challenge_slug: str | None,
) -> tuple[str, str | None]:
    """Validate coach thread mode and optional debrief challenge_slug."""
    if mode not in VALID_MODES:
        raise CoachThreadValidationError(
            f"Mode must be one of: {', '.join(VALID_MODES)}"
        )

    if mode == "patterns":
        if challenge_slug is not None:
            raise CoachThreadValidationError(
                "challenge_slug is only allowed in debrief mode"
            )
        return mode, None

    if challenge_slug is None:
        return mode, None

    if not isinstance(challenge_slug, str):
        raise CoachThreadValidationError("challenge_slug must be a string")
    if (
        not challenge_slug
        or len(challenge_slug) > MAX_CHALLENGE_SLUG_LENGTH
        or _has_control_chars(challenge_slug)
        or any(ch.isspace() for ch in challenge_slug)
    ):
        raise CoachThreadValidationError(
            "challenge_slug must be 1..200 non-whitespace chars"
        )
    return mode, challenge_slug


def validate_message_id(message_id: str | None) -> str:
    """Validate an optional opaque message ID or generate a fresh UUID."""
    if message_id is None:
        return str(uuid.uuid4())
    if (
        not isinstance(message_id, str)
        or not (1 <= len(message_id) <= MAX_MESSAGE_ID_LENGTH)
        or not _MESSAGE_ID_RE.match(message_id)
    ):
        raise CoachThreadValidationError(
            "Message id must be 1..128 characters of [A-Za-z0-9._:-]"
        )
    return message_id


def _validate_single_part(role: str, part: Any) -> None:
    if not isinstance(part, dict):
        raise CoachThreadValidationError("Each message part must be an object")

    part_type = part.get("type")
    if (
        not isinstance(part_type, str)
        or not part_type
        or len(part_type) > 100
        or _has_control_chars(part_type)
    ):
        raise CoachThreadValidationError(
            "Each message part must include a valid type string"
        )

    if role == "user":
        if part_type != "text":
            raise CoachThreadValidationError(
                "User messages may only contain text parts"
            )
        if set(part.keys()) != _ALLOWED_USER_TEXT_KEYS:
            raise CoachThreadValidationError(
                "User text parts may only include type and text"
            )
        text = part.get("text")
        if (
            not isinstance(text, str)
            or len(text) > MAX_TEXT_PART_CHARS
            or not any(
                not ch.isspace() and ord(ch) >= 0x20 and ord(ch) != 0x7F for ch in text
            )
        ):
            raise CoachThreadValidationError(
                f"User text must be non-empty and at most {MAX_TEXT_PART_CHARS} chars"
            )
        return

    if part_type in ("text", "reasoning"):
        text = part.get("text")
        if not isinstance(text, str) or len(text) > MAX_TEXT_PART_CHARS:
            raise CoachThreadValidationError(
                f"Assistant {part_type} must be at most {MAX_TEXT_PART_CHARS} chars"
            )
        return

    if part_type == "step-start":
        return

    if part_type.startswith("tool-") and _TOOL_NAME_RE.match(part_type[5:]):
        tool_call_id = part.get("toolCallId")
        if (
            not isinstance(tool_call_id, str)
            or len(tool_call_id) > 200
            or not tool_call_id.strip()
            or _has_control_chars(tool_call_id)
        ):
            raise CoachThreadValidationError(
                "Tool parts must include a valid toolCallId"
            )
        state = part.get("state")
        if not isinstance(state, str) or state not in VALID_TOOL_STATES:
            raise CoachThreadValidationError("Tool part has an invalid state")
        return

    raise CoachThreadValidationError("Unsupported assistant message part type")


def validate_and_serialize_parts(
    role: str,
    parts: list[dict[str, Any]],
) -> str:
    """Validate message parts for a role and serialize compactly as JSON."""
    if role not in VALID_ROLES:
        raise CoachThreadValidationError(
            f"Role must be one of: {', '.join(VALID_ROLES)}"
        )
    if not isinstance(parts, list) or not (1 <= len(parts) <= MAX_PARTS_PER_MESSAGE):
        raise CoachThreadValidationError(
            f"Message must contain between 1 and {MAX_PARTS_PER_MESSAGE} parts"
        )

    for part in parts:
        _validate_single_part(role, part)

    _validate_parts_tree(parts)

    try:
        serialized = json.dumps(
            parts,
            separators=(",", ":"),
            sort_keys=True,
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise CoachThreadValidationError(
            "Message parts must be JSON-serializable without NaN or Infinity"
        ) from exc

    if len(serialized.encode("utf-8")) > MAX_PARTS_JSON_BYTES:
        raise CoachThreadValidationError(
            f"Serialized message parts exceed {MAX_PARTS_JSON_BYTES} bytes"
        )
    return serialized


def _collapse_title_candidate(raw_text: str) -> str:
    normalized = raw_text.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    stripped_controls = "".join(
        ch for ch in normalized if ord(ch) >= 0x20 and ord(ch) != 0x7F
    )
    return " ".join(stripped_controls.split())


def derive_auto_title(parts: list[dict[str, Any]]) -> str | None:
    """Derive a concise thread title from the first non-empty text part."""
    collapsed = ""
    for part in parts:
        if part.get("type") == "text" and isinstance(part.get("text"), str):
            candidate = _collapse_title_candidate(part["text"])
            if candidate:
                collapsed = candidate
                break

    if not collapsed:
        return None
    if len(collapsed) <= AUTO_TITLE_MAX_LENGTH:
        return collapsed

    cutoff = AUTO_TITLE_MAX_LENGTH - 3
    window = collapsed[: cutoff + 1]
    if " " in window:
        trimmed = window.rsplit(" ", 1)[0].rstrip()
        if trimmed:
            return f"{trimmed}..."
    return f"{collapsed[:cutoff]}..."


def _require_owned_thread(
    session: Session,
    actor: Actor,
    thread_id: str,
    *,
    for_update: bool = False,
) -> CoachThread:
    _validate_thread_id(thread_id)
    owner_filter = coach_thread_owner_filter(actor)
    if owner_filter is None:
        raise CoachThreadNotFoundError("Coach thread not found")

    stmt = select(CoachThread).where(CoachThread.id == thread_id, owner_filter)
    if for_update:
        stmt = stmt.with_for_update()

    thread = session.exec(stmt).first()
    if thread is None:
        raise CoachThreadNotFoundError("Coach thread not found")
    return thread


def _count_thread_messages(session: Session, thread_id: str) -> int:
    return int(
        session.exec(
            select(func.count(CoachMessage.id)).where(
                CoachMessage.thread_id == thread_id
            )
        ).one()
    )


def list_coach_threads(
    session: Session,
    actor: Actor,
    *,
    limit: int = 30,
    offset: int = 0,
    mode: str | None = None,
    challenge_slug: str | None = None,
) -> tuple[list[tuple[CoachThread, int]], int]:
    """Return actor-owned (thread, message_count) pairs ordered by updated_at DESC."""
    if mode is not None and mode not in VALID_MODES:
        raise CoachThreadValidationError(
            f"Mode must be one of: {', '.join(VALID_MODES)}"
        )

    if challenge_slug is not None and (
        not isinstance(challenge_slug, str)
        or len(challenge_slug) > MAX_CHALLENGE_SLUG_LENGTH
        or _has_control_chars(challenge_slug)
        or any(ch.isspace() for ch in challenge_slug)
    ):
        raise CoachThreadValidationError("Invalid challenge_slug filter")

    owner_filter = coach_thread_owner_filter(actor)
    if owner_filter is None:
        return [], 0

    conditions: list[Any] = [owner_filter]
    if mode is not None:
        conditions.append(CoachThread.mode == mode)
    if challenge_slug is not None:
        conditions.append(CoachThread.challenge_slug == challenge_slug)

    total = int(
        session.exec(select(func.count(CoachThread.id)).where(*conditions)).one()
    )
    threads = list(
        session.exec(
            select(CoachThread)
            .where(*conditions)
            .order_by(CoachThread.updated_at.desc(), CoachThread.id.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )
    if not threads:
        return [], total

    thread_ids = [t.id for t in threads]
    counts_rows = session.exec(
        select(CoachMessage.thread_id, func.count(CoachMessage.id))
        .where(CoachMessage.thread_id.in_(thread_ids))
        .group_by(CoachMessage.thread_id)
    ).all()
    counts = {tid: int(cnt) for tid, cnt in counts_rows}
    return [(thread, counts.get(thread.id, 0)) for thread in threads], total


def create_coach_thread(
    session: Session,
    actor: Actor,
    *,
    title: str | None = None,
    mode: str = "patterns",
    challenge_slug: str | None = None,
) -> CoachThread:
    """Create a new actor-owned coach thread within quota."""
    if coach_thread_owner_filter(actor) is None:
        raise CoachThreadValidationError(
            "Authenticated user or verified guest session is required"
        )

    validated_mode, validated_slug = validate_mode_and_slug(mode, challenge_slug)
    resolved_title = (
        validate_title(title) if title is not None else DEFAULT_THREAD_TITLE
    )

    lock_actor_scope(session, actor)
    try:
        ensure_coach_thread_quota(session, actor, adding=1, lock=False)
        now = get_utc_now()
        thread = CoachThread(
            user_id=actor.user_id,
            session_id=actor.guest_session_id,
            title=resolved_title,
            mode=validated_mode,
            challenge_slug=validated_slug,
            created_at=now,
            updated_at=now,
        )
        session.add(thread)
        session.commit()
    except Exception:
        session.rollback()
        raise

    session.refresh(thread)
    return thread


def get_coach_thread(
    session: Session,
    actor: Actor,
    thread_id: str,
) -> tuple[CoachThread, list[CoachMessage]]:
    """Load an actor-owned coach thread and its ordered messages."""
    thread = _require_owned_thread(session, actor, thread_id)
    messages = list(
        session.exec(
            select(CoachMessage)
            .where(CoachMessage.thread_id == thread.id)
            .order_by(CoachMessage.sequence.asc())
        ).all()
    )
    return thread, messages


def rename_coach_thread(
    session: Session,
    actor: Actor,
    thread_id: str,
    title: str,
) -> tuple[CoachThread, int]:
    """Rename an actor-owned coach thread and return (thread, message_count)."""
    cleaned_title = validate_title(title)
    _validate_thread_id(thread_id)

    lock_actor_scope(session, actor)
    try:
        thread = _require_owned_thread(session, actor, thread_id, for_update=True)
        message_count = _count_thread_messages(session, thread.id)
        thread.title = cleaned_title
        thread.updated_at = get_utc_now()
        session.add(thread)
        session.commit()
    except StaleDataError as exc:
        session.rollback()
        raise CoachThreadNotFoundError("Coach thread not found") from exc
    except Exception:
        session.rollback()
        raise

    session.refresh(thread)
    return thread, message_count


def delete_coach_thread(
    session: Session,
    actor: Actor,
    thread_id: str,
) -> None:
    """Delete an actor-owned coach thread and cascade its messages."""
    _validate_thread_id(thread_id)

    lock_actor_scope(session, actor)
    try:
        thread = _require_owned_thread(session, actor, thread_id, for_update=True)
        session.delete(thread)
        session.commit()
    except StaleDataError as exc:
        session.rollback()
        raise CoachThreadNotFoundError("Coach thread not found") from exc
    except Exception:
        session.rollback()
        raise


def _extract_item_fields(item: Any) -> tuple[str | None, str, list[dict[str, Any]]]:
    if isinstance(item, Mapping):
        return item.get("id"), item.get("role", ""), item.get("parts", [])
    return (
        getattr(item, "id", None),
        getattr(item, "role", ""),
        getattr(item, "parts", []),
    )


def _has_terminal_tool_state_regression(
    existing_parts: list[dict[str, Any]],
    new_parts: list[dict[str, Any]],
) -> bool:
    terminal_ids: set[str] = set()
    for part in existing_parts:
        part_type = part.get("type")
        tool_call_id = part.get("toolCallId")
        state = part.get("state")
        if (
            isinstance(part_type, str)
            and part_type.startswith("tool-")
            and isinstance(tool_call_id, str)
            and state in TERMINAL_TOOL_STATES
        ):
            terminal_ids.add(tool_call_id)

    if not terminal_ids:
        return False

    for part in new_parts:
        part_type = part.get("type")
        tool_call_id = part.get("toolCallId")
        state = part.get("state")
        if (
            isinstance(part_type, str)
            and part_type.startswith("tool-")
            and isinstance(tool_call_id, str)
            and tool_call_id in terminal_ids
            and state in NON_TERMINAL_TOOL_STATES
        ):
            return True
    return False


def append_coach_messages(
    session: Session,
    actor: Actor,
    thread_id: str,
    items: Sequence[Any],
) -> tuple[CoachThread, list[CoachMessage], int]:
    """Validate and atomically append or update messages in an owned thread."""
    if not items or len(items) > MAX_APPEND_BATCH_SIZE:
        raise CoachThreadValidationError(
            f"Append batch must contain between 1 and {MAX_APPEND_BATCH_SIZE} messages"
        )

    prepared: list[tuple[str, str, list[dict[str, Any]], str]] = []
    seen_ids: set[str] = set()
    for item in items:
        raw_id, role, parts = _extract_item_fields(item)
        msg_id = validate_message_id(raw_id)
        if msg_id in seen_ids:
            raise CoachThreadValidationError(f"Duplicate message id in batch: {msg_id}")
        seen_ids.add(msg_id)
        serialized = validate_and_serialize_parts(role, parts)
        prepared.append((msg_id, role, parts, serialized))

    _validate_thread_id(thread_id)
    lock_actor_scope(session, actor)
    try:
        thread = _require_owned_thread(session, actor, thread_id, for_update=True)
    except Exception:
        session.rollback()
        raise

    stats_row = session.exec(
        select(
            func.count(CoachMessage.id),
            func.max(CoachMessage.sequence),
        ).where(CoachMessage.thread_id == thread.id)
    ).one()
    current_count = int(stats_row[0] or 0)
    max_sequence = stats_row[1]
    next_seq = (int(max_sequence) + 1) if max_sequence is not None else 0

    incoming_ids = [msg_id for msg_id, _, _, _ in prepared]
    existing_messages = list(
        session.exec(
            select(CoachMessage).where(
                CoachMessage.thread_id == thread.id,
                CoachMessage.id.in_(incoming_ids),
            )
        ).all()
    )
    by_id: dict[str, CoachMessage] = {msg.id: msg for msg in existing_messages}

    new_inserts = 0
    pending_auto_title: str | None = None
    planned_ops: list[tuple[str, str, str, int, str]] = []

    for msg_id, role, parts, serialized in prepared:
        existing_msg = by_id.get(msg_id)
        if existing_msg is not None:
            if existing_msg.role != role:
                session.rollback()
                raise CoachMessageConflictError(
                    "Message role conflicts with existing message"
                )
            if existing_msg.parts_json == serialized:
                planned_ops.append(("noop", msg_id, role, -1, serialized))
                continue
            if existing_msg.role == "user":
                session.rollback()
                raise CoachMessageConflictError(
                    "Existing user messages cannot be modified"
                )
            if _has_terminal_tool_state_regression(existing_msg.get_parts(), parts):
                session.rollback()
                raise CoachMessageConflictError(
                    "Terminal tool state cannot regress to non-terminal state"
                )
            planned_ops.append(("update", msg_id, role, -1, serialized))
            continue

        if current_count + new_inserts >= MAX_MESSAGES_PER_THREAD:
            session.rollback()
            raise CoachMessageLimitExceeded(
                f"Coach thread cannot exceed {MAX_MESSAGES_PER_THREAD} messages"
            )

        seq = next_seq
        next_seq += 1
        new_inserts += 1
        planned_ops.append(("insert", msg_id, role, seq, serialized))

        if (
            role == "user"
            and thread.title == DEFAULT_THREAD_TITLE
            and pending_auto_title is None
        ):
            pending_auto_title = derive_auto_title(parts)

    mutated = False
    saved_messages: list[CoachMessage] = []
    for op, msg_id, role, seq, serialized in planned_ops:
        if op == "noop":
            saved_messages.append(by_id[msg_id])
        elif op == "update":
            existing_msg = by_id[msg_id]
            existing_msg.parts_json = serialized
            session.add(existing_msg)
            mutated = True
            saved_messages.append(existing_msg)
        else:
            new_msg = CoachMessage(
                id=msg_id,
                thread_id=thread.id,
                role=role,
                parts_json=serialized,
                sequence=seq,
            )
            session.add(new_msg)
            mutated = True
            saved_messages.append(new_msg)

    if pending_auto_title is not None and thread.title == DEFAULT_THREAD_TITLE:
        thread.title = pending_auto_title

    total_count = current_count + new_inserts
    if mutated:
        thread.updated_at = get_utc_now()
        session.add(thread)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise CoachMessageConflictError("Message could not be saved") from exc
        session.refresh(thread)
        for msg in saved_messages:
            session.refresh(msg)
    else:
        session.rollback()

    return thread, saved_messages, total_count


def truncate_coach_messages(
    session: Session,
    actor: Actor,
    thread_id: str,
    from_sequence: int,
) -> tuple[int, int]:
    """Delete messages at or after from_sequence and return (deleted, remaining)."""
    if from_sequence < 0 or from_sequence > MAX_FROM_SEQUENCE:
        raise CoachThreadValidationError("from_sequence must be non-negative")
    _validate_thread_id(thread_id)

    lock_actor_scope(session, actor)
    try:
        thread = _require_owned_thread(session, actor, thread_id, for_update=True)
        result = session.exec(
            sa_delete(CoachMessage).where(
                CoachMessage.thread_id == thread.id,
                CoachMessage.sequence >= from_sequence,
            )
        )
        deleted_count = int(result.rowcount or 0)
        remaining_count = _count_thread_messages(session, thread.id)

        if deleted_count > 0:
            thread.updated_at = get_utc_now()
            session.add(thread)
            session.commit()
        else:
            session.rollback()
    except Exception:
        session.rollback()
        raise

    return deleted_count, remaining_count
