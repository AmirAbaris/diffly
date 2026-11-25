"""Comprehensive unit and API tests for Coach thread and message persistence."""

import json
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select, text

from backend.core.config import settings
from backend.core.db import create_db_engine, init_db
from backend.core.guest_session import GuestSession, _encode
from backend.core.security import hash_password
from backend.models.challenge import Category, Challenge, Difficulty, Language
from backend.models.coach_thread import CoachMessage, CoachThread
from backend.models.submission import Submission
from backend.models.user import User
from backend.services.coach_thread_service import (
    MAX_MESSAGES_PER_THREAD,
    MAX_PARTS_JSON_BYTES,
    MAX_TEXT_PART_CHARS,
    CoachThreadNotFoundError,
    CoachThreadValidationError,
    append_coach_messages,
    delete_coach_thread,
    derive_auto_title,
    get_coach_thread,
    rename_coach_thread,
    truncate_coach_messages,
    validate_and_serialize_parts,
    validate_message_id,
)
from backend.services.ownership import COACH_THREAD_QUOTA, Actor


def _text_part(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def _create_thread(
    client: TestClient,
    *,
    title: str | None = None,
    mode: str = "patterns",
    challenge_slug: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"mode": mode}
    if title is not None:
        payload["title"] = title
    if challenge_slug is not None:
        payload["challenge_slug"] = challenge_slug
    res = client.post("/api/user/coach-threads", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_coach_thread_crud_lifecycle_for_user_and_guest(
    session: Session,
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    client_factory: Callable[[], TestClient],
    as_guest: Callable[[TestClient, str | None], str],
):
    """Both authenticated users and signed-cookie guests have full CRUD isolation."""
    register_user("thread_crud_user")
    user_client = login_as("thread_crud_user")
    guest_client = client_factory()
    as_guest(guest_client, "g-thread-crud-1")

    for actor_client in (user_client, guest_client):
        created = _create_thread(actor_client)
        assert created["title"] == "New chat"
        assert created["mode"] == "patterns"
        assert created["challenge_slug"] is None
        assert created["message_count"] == 0
        assert "user_id" not in created
        assert "session_id" not in created
        thread_id = created["id"]

        listed = actor_client.get("/api/user/coach-threads")
        assert listed.status_code == 200
        body = listed.json()
        assert body["total"] == 1
        assert [item["id"] for item in body["items"]] == [thread_id]

        detail = actor_client.get(f"/api/user/coach-threads/{thread_id}")
        assert detail.status_code == 200
        assert detail.json()["messages"] == []
        assert "user_id" not in detail.json()
        assert "session_id" not in detail.json()

        renamed = actor_client.patch(
            f"/api/user/coach-threads/{thread_id}",
            json={"title": "  SQLi patterns deep dive  "},
        )
        assert renamed.status_code == 200
        assert renamed.json()["title"] == "SQLi patterns deep dive"

        deleted = actor_client.delete(f"/api/user/coach-threads/{thread_id}")
        assert deleted.status_code == 204
        assert deleted.text == ""

        assert (
            actor_client.get(f"/api/user/coach-threads/{thread_id}").status_code == 404
        )
        assert actor_client.get("/api/user/coach-threads").json()["items"] == []


def test_coach_thread_pagination_filtering_and_ordering(
    session: Session,
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """List threads supports limit, offset, mode, slug, and updated_at DESC."""
    user = register_user("thread_list_user")
    auth_client = login_as("thread_list_user")

    base_time = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
    t_old_pat = CoachThread(
        user_id=user["id"],
        title="Old patterns",
        mode="patterns",
        created_at=base_time,
        updated_at=base_time,
    )
    t_mid_debrief = CoachThread(
        user_id=user["id"],
        title="Mid debrief",
        mode="debrief",
        challenge_slug="sql-injection-auth",
        created_at=base_time,
        updated_at=base_time + timedelta(minutes=5),
    )
    t_new_pat = CoachThread(
        user_id=user["id"],
        title="New patterns",
        mode="patterns",
        created_at=base_time,
        updated_at=base_time + timedelta(minutes=10),
    )
    t_other_debrief = CoachThread(
        user_id=user["id"],
        title="Other debrief",
        mode="debrief",
        challenge_slug="race-cache-ttl",
        created_at=base_time,
        updated_at=base_time + timedelta(minutes=15),
    )
    session.add_all([t_old_pat, t_mid_debrief, t_new_pat, t_other_debrief])
    session.commit()

    session.add_all(
        [
            CoachMessage(
                thread_id=t_new_pat.id,
                role="user",
                parts_json=json.dumps([_text_part("msg 0")]),
                sequence=0,
            ),
            CoachMessage(
                thread_id=t_new_pat.id,
                role="assistant",
                parts_json=json.dumps([_text_part("msg 1")]),
                sequence=1,
            ),
        ]
    )
    session.commit()

    page1 = auth_client.get(
        "/api/user/coach-threads?limit=2&offset=0&mode=&challenge_slug="
    )
    assert page1.status_code == 200
    p1_data = page1.json()
    assert p1_data["total"] == 4
    assert [item["id"] for item in p1_data["items"]] == [
        t_other_debrief.id,
        t_new_pat.id,
    ]
    assert p1_data["items"][1]["message_count"] == 2

    page2 = auth_client.get("/api/user/coach-threads?limit=2&offset=2")
    assert page2.status_code == 200
    assert page2.json()["total"] == 4
    assert [item["id"] for item in page2.json()["items"]] == [
        t_mid_debrief.id,
        t_old_pat.id,
    ]

    patterns_only = auth_client.get("/api/user/coach-threads?mode=patterns")
    assert patterns_only.status_code == 200
    assert patterns_only.json()["total"] == 2
    assert [item["id"] for item in patterns_only.json()["items"]] == [
        t_new_pat.id,
        t_old_pat.id,
    ]

    slug_only = auth_client.get(
        "/api/user/coach-threads?mode=debrief&challenge_slug=sql-injection-auth"
    )
    assert slug_only.status_code == 200
    assert slug_only.json()["total"] == 1
    assert slug_only.json()["items"][0]["id"] == t_mid_debrief.id

    assert auth_client.get("/api/user/coach-threads?mode=unknown").status_code == 422


def test_append_messages_batch_auto_title_idempotency_and_tool_update(
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Append supports batching, auto-title, idempotent retries, and tool outputs."""
    register_user("thread_msg_user")
    auth_client = login_as("thread_msg_user")

    thread = _create_thread(auth_client)
    thread_id = thread["id"]
    user_msg_id = str(uuid.uuid4())
    asst_msg_id = str(uuid.uuid4())

    first_prompt = (
        "Why\tdid I miss\nthe subtle   authorization bypass in the second handler "
        "when reviewing multi-tenant endpoints?"
    )
    append_res = auth_client.post(
        f"/api/user/coach-threads/{thread_id}/messages",
        json={
            "messages": [
                {
                    "id": user_msg_id,
                    "role": "user",
                    "parts": [_text_part(first_prompt)],
                },
                {
                    "id": asst_msg_id,
                    "role": "assistant",
                    "parts": [
                        {"type": "step-start"},
                        {"type": "reasoning", "text": "Checking patterns..."},
                        {
                            "type": "tool-configure_challenge",
                            "toolCallId": "call_123",
                            "state": "input-available",
                            "input": {"topic": "IDOR", "language": "python"},
                        },
                    ],
                },
            ]
        },
    )
    assert append_res.status_code == 201, append_res.text
    body = append_res.json()
    assert body["message_count"] == 2
    assert len(body["thread"]["title"]) <= 80
    assert body["thread"]["title"].endswith("...")
    assert "\n" not in body["thread"]["title"]
    assert "\t" not in body["thread"]["title"]
    assert body["messages"][0]["id"] == user_msg_id
    assert body["messages"][0]["sequence"] == 0
    assert body["messages"][1]["sequence"] == 1

    # Idempotent retry with identical content succeeds without duplicating rows
    retry_res = auth_client.post(
        f"/api/user/coach-threads/{thread_id}/messages",
        json={
            "messages": [
                {
                    "id": user_msg_id,
                    "role": "user",
                    "parts": [_text_part(first_prompt)],
                }
            ]
        },
    )
    assert retry_res.status_code == 201
    assert retry_res.json()["message_count"] == 2
    assert retry_res.json()["messages"][0]["sequence"] == 0

    # Assistant message updates in place when addToolOutput resolves configure_challenge
    tool_update_res = auth_client.post(
        f"/api/user/coach-threads/{thread_id}/messages",
        json={
            "messages": [
                {
                    "id": asst_msg_id,
                    "role": "assistant",
                    "parts": [
                        {"type": "step-start"},
                        {"type": "reasoning", "text": "Checking patterns..."},
                        {
                            "type": "tool-configure_challenge",
                            "toolCallId": "call_123",
                            "state": "output-available",
                            "input": {"topic": "IDOR", "language": "python"},
                            "output": {"status": "created", "slug": "idor-drill-1"},
                        },
                        _text_part("Try this IDOR challenge next."),
                    ],
                }
            ]
        },
    )
    assert tool_update_res.status_code == 201
    assert tool_update_res.json()["message_count"] == 2
    assert tool_update_res.json()["messages"][0]["sequence"] == 1
    assert (
        tool_update_res.json()["messages"][0]["parts"][2]["state"] == "output-available"
    )

    # Custom titles are never overwritten by subsequent user messages
    custom_thread = _create_thread(auth_client, title="Custom pinned title")
    custom_append = auth_client.post(
        f"/api/user/coach-threads/{custom_thread['id']}/messages",
        json={
            "messages": [
                {
                    "role": "user",
                    "parts": [_text_part("Do not overwrite my custom title.")],
                }
            ]
        },
    )
    assert custom_append.status_code == 201
    assert custom_append.json()["thread"]["title"] == "Custom pinned title"

    # Existing user message parts are immutable (409) and role mismatches conflict (409)
    mutate_user_res = auth_client.post(
        f"/api/user/coach-threads/{thread_id}/messages",
        json={
            "messages": [
                {
                    "id": user_msg_id,
                    "role": "user",
                    "parts": [_text_part("Attempted overwrite")],
                }
            ]
        },
    )
    assert mutate_user_res.status_code == 409

    role_mismatch_res = auth_client.post(
        f"/api/user/coach-threads/{thread_id}/messages",
        json={
            "messages": [
                {
                    "id": user_msg_id,
                    "role": "assistant",
                    "parts": [_text_part(first_prompt)],
                }
            ]
        },
    )
    assert role_mismatch_res.status_code == 409


def test_truncate_messages_and_sequence_reuse(
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Truncate removes tail messages idempotently and allows clean sequence reuse."""
    register_user("thread_truncate_user")
    auth_client = login_as("thread_truncate_user")
    thread_id = _create_thread(auth_client)["id"]

    auth_client.post(
        f"/api/user/coach-threads/{thread_id}/messages",
        json={
            "messages": [
                {"role": "user", "parts": [_text_part("Turn 0")]},
                {"role": "assistant", "parts": [_text_part("Reply 1")]},
                {"role": "user", "parts": [_text_part("Turn 2")]},
                {"role": "assistant", "parts": [_text_part("Reply 3")]},
            ]
        },
    )

    trunc_res = auth_client.delete(
        f"/api/user/coach-threads/{thread_id}/messages?from_sequence=2"
    )
    assert trunc_res.status_code == 200
    assert trunc_res.json() == {"deleted_count": 2, "remaining_count": 2}

    noop_res = auth_client.delete(
        f"/api/user/coach-threads/{thread_id}/messages?from_sequence=99"
    )
    assert noop_res.status_code == 200
    assert noop_res.json() == {"deleted_count": 0, "remaining_count": 2}

    reappend_res = auth_client.post(
        f"/api/user/coach-threads/{thread_id}/messages",
        json={
            "messages": [
                {"role": "user", "parts": [_text_part("Edited Turn 2")]},
            ]
        },
    )
    assert reappend_res.status_code == 201
    assert reappend_res.json()["message_count"] == 3
    assert reappend_res.json()["messages"][0]["sequence"] == 2

    detail = auth_client.get(f"/api/user/coach-threads/{thread_id}").json()
    assert [m["sequence"] for m in detail["messages"]] == [0, 1, 2]
    assert detail["messages"][2]["parts"][0]["text"] == "Edited Turn 2"

    assert (
        auth_client.delete(
            f"/api/user/coach-threads/{thread_id}/messages?from_sequence=-1"
        ).status_code
        == 422
    )
    assert (
        auth_client.delete(f"/api/user/coach-threads/{thread_id}/messages").status_code
        == 422
    )


def test_coach_thread_and_message_caps_enforced(
    session: Session,
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """50 threads per actor and 200 messages per thread return 409 when exceeded."""
    user = register_user("thread_cap_user")
    auth_client = login_as("thread_cap_user")

    threads = [
        CoachThread(user_id=user["id"], title=f"Thread {idx}", mode="patterns")
        for idx in range(COACH_THREAD_QUOTA)
    ]
    session.add_all(threads)
    session.commit()

    over_thread = auth_client.post("/api/user/coach-threads", json={"mode": "patterns"})
    assert over_thread.status_code == 409
    assert "Cannot claim" not in over_thread.json()["detail"]
    assert (
        f"Maximum limit of {COACH_THREAD_QUOTA} coach threads reached."
        in over_thread.json()["detail"]
    )

    del_res = auth_client.delete(f"/api/user/coach-threads/{threads[0].id}")
    assert del_res.status_code == 204
    assert auth_client.post("/api/user/coach-threads", json={}).status_code == 201

    target_thread_id = threads[1].id
    session.add_all(
        [
            CoachMessage(
                thread_id=target_thread_id,
                role="user" if seq % 2 == 0 else "assistant",
                parts_json=json.dumps([_text_part(f"msg {seq}")]),
                sequence=seq,
            )
            for seq in range(MAX_MESSAGES_PER_THREAD - 1)
        ]
    )
    session.commit()

    # Batch of 2 messages when 199 exist must fail atomically at 409
    over_batch = auth_client.post(
        f"/api/user/coach-threads/{target_thread_id}/messages",
        json={
            "messages": [
                {"role": "user", "parts": [_text_part("slot 200")]},
                {"role": "assistant", "parts": [_text_part("slot 201")]},
            ]
        },
    )
    assert over_batch.status_code == 409

    ok_last = auth_client.post(
        f"/api/user/coach-threads/{target_thread_id}/messages",
        json={"messages": [{"role": "assistant", "parts": [_text_part("slot 200")]}]},
    )
    assert ok_last.status_code == 201
    assert ok_last.json()["message_count"] == MAX_MESSAGES_PER_THREAD

    over_single = auth_client.post(
        f"/api/user/coach-threads/{target_thread_id}/messages",
        json={"messages": [{"role": "user", "parts": [_text_part("slot 201")]}]},
    )
    assert over_single.status_code == 409


def test_coach_thread_validation_and_abuse_cases(
    session: Session,
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    client_factory: Callable[[], TestClient],
):
    """Validation rejects malformed payloads and ignores owner injection fields."""
    other = register_user("thread_victim_user")
    register_user("thread_abuse_user")
    auth_client = login_as("thread_abuse_user")

    # Owner injection fields in POST body are ignored
    create_res = auth_client.post(
        "/api/user/coach-threads",
        json={
            "title": "Injected check",
            "mode": "debrief",
            "challenge_slug": "sql-injection-auth",
            "user_id": other["id"],
            "session_id": "forged-sid",
            "id": "00000000-0000-0000-0000-000000000001",
        },
    )
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["id"] != "00000000-0000-0000-0000-000000000001"
    db_thread = session.get(CoachThread, created["id"])
    assert db_thread is not None
    assert db_thread.user_id != other["id"]
    assert db_thread.session_id is None

    tid = created["id"]

    bad_create_payloads = [
        {"mode": "invalid"},
        {"mode": "patterns", "challenge_slug": "unexpected-slug"},
        {"mode": "debrief", "challenge_slug": "has space"},
        {"mode": "debrief", "challenge_slug": "bad\x07slug"},
        {"mode": "debrief", "challenge_slug": ""},
        {"mode": "debrief", "challenge_slug": "s" * 201},
        {"title": ""},
        {"title": "   "},
        {"title": "bad\x00title"},
        {"title": "bad\ntitle"},
        {"title": "bad\x7ftitle"},
        {"title": "x" * 121},
    ]
    for bad in bad_create_payloads:
        assert (
            auth_client.post("/api/user/coach-threads", json=bad).status_code == 422
        ), bad

    for bad_title in ("", "   ", "ctrl\x01char", "del\x7fchar", "t" * 121):
        assert (
            auth_client.patch(
                f"/api/user/coach-threads/{tid}",
                json={"title": bad_title},
            ).status_code
            == 422
        )

    bad_message_payloads: list[dict[str, Any]] = [
        {"messages": []},
        {
            "messages": [
                {"role": "user", "parts": [_text_part(f"m{i}")]} for i in range(21)
            ]
        },
        {"messages": [{"id": "bad/id", "role": "user", "parts": [_text_part("x")]}]},
        {"messages": [{"id": "", "role": "user", "parts": [_text_part("x")]}]},
        {"messages": [{"id": "bad id", "role": "user", "parts": [_text_part("x")]}]},
        {"messages": [{"id": "x" * 129, "role": "user", "parts": [_text_part("x")]}]},
        {"messages": [{"role": "system", "parts": [_text_part("hack")]}]},
        {"messages": [{"role": "user", "parts": []}]},
        {
            "messages": [
                {"role": "user", "parts": [{"type": "reasoning", "text": "no"}]}
            ]
        },
        {
            "messages": [
                {
                    "role": "user",
                    "parts": [{"type": "text", "text": "hi", "extra": "smuggled"}],
                }
            ]
        },
        {"messages": [{"role": "user", "parts": [_text_part("   ")]}]},
        {"messages": [{"role": "user", "parts": [_text_part("\x01\x02\t")]}]},
        {
            "messages": [
                {
                    "role": "user",
                    "parts": [_text_part("x" * (MAX_TEXT_PART_CHARS + 1))],
                }
            ]
        },
        {"messages": [{"role": "user", "parts": [_text_part("hello\x00world")]}]},
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [{"type": "data", "blob": "unsupported"}],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [
                        {
                            "type": "tool-",
                            "toolCallId": "call_1",
                            "state": "input-available",
                        }
                    ],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [
                        {
                            "type": "tool-bad name",
                            "toolCallId": "call_1",
                            "state": "input-available",
                        }
                    ],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [
                        {
                            "type": "tool-configure_challenge",
                            "toolCallId": "   ",
                            "state": "input-available",
                        }
                    ],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [
                        {
                            "type": "tool-configure_challenge",
                            "toolCallId": "call_1",
                        }
                    ],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [
                        {
                            "type": "tool-configure_challenge",
                            "toolCallId": "",
                            "state": "input-available",
                        }
                    ],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [
                        {
                            "type": "tool-configure_challenge",
                            "toolCallId": "call_1",
                            "state": "invalid-state",
                        }
                    ],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [_text_part("a" * 16_000) for _ in range(9)],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [{"type": "step-start"} for _ in range(51)],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [_text_part("b" * (MAX_TEXT_PART_CHARS + 1))],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "parts": [
                        {
                            "type": "tool-configure_challenge",
                            "toolCallId": "bad\x07id",
                            "state": "input-available",
                        }
                    ],
                }
            ]
        },
    ]
    for bad_msg in bad_message_payloads:
        assert (
            auth_client.post(
                f"/api/user/coach-threads/{tid}/messages",
                json=bad_msg,
            ).status_code
            == 422
        ), bad_msg

    with pytest.raises(CoachThreadValidationError):
        validate_and_serialize_parts(
            "assistant",
            [
                {
                    "type": "tool-configure_challenge",
                    "toolCallId": "call_nan",
                    "state": "input-available",
                    "input": {"val": float("nan")},
                }
            ],
        )
    with pytest.raises(CoachThreadValidationError):
        validate_and_serialize_parts(
            "assistant",
            [
                {
                    "type": "tool-configure_challenge",
                    "toolCallId": "call_big",
                    "state": "input-available",
                    "input": {"blob": "x" * MAX_PARTS_JSON_BYTES},
                }
            ],
        )
    for bad_msg_id in ("", "bad/id", "bad id", "bad\x00id", "x" * 129):
        with pytest.raises(CoachThreadValidationError):
            validate_message_id(bad_msg_id)
    assert derive_auto_title([{"type": "step-start"}]) is None
    assert derive_auto_title([_text_part("   \n\t  ")]) is None
    assert (
        derive_auto_title([_text_part("\x01\n\t"), _text_part("Real second title")])
        == "Real second title"
    )
    assert len(derive_auto_title([_text_part("x" * 120)]) or "") == 80

    # Forged X-Diffly-Session-Id header cannot create or access threads
    forged_client = client_factory()
    assert (
        forged_client.post(
            "/api/user/coach-threads",
            headers={"X-Diffly-Session-Id": "forged-sid"},
            json={},
        ).status_code
        == 401
    )
    assert (
        forged_client.get(
            f"/api/user/coach-threads/{tid}",
            headers={"X-Diffly-Session-Id": "forged-sid"},
        ).status_code
        == 404
    )

    # Multi-item batch fails atomically when second item has a role conflict
    existing_id = str(uuid.uuid4())
    assert (
        auth_client.post(
            f"/api/user/coach-threads/{tid}/messages",
            json={
                "messages": [
                    {"id": existing_id, "role": "user", "parts": [_text_part("seed")]}
                ]
            },
        ).status_code
        == 201
    )
    batch_fail = auth_client.post(
        f"/api/user/coach-threads/{tid}/messages",
        json={
            "messages": [
                {"role": "assistant", "parts": [_text_part("should rollback")]},
                {
                    "id": existing_id,
                    "role": "assistant",
                    "parts": [_text_part("seed")],
                },
            ]
        },
    )
    assert batch_fail.status_code == 409
    detail_msgs = auth_client.get(f"/api/user/coach-threads/{tid}").json()["messages"]
    assert len(detail_msgs) == 1

    with patch.object(
        session,
        "commit",
        side_effect=IntegrityError("INSERT", {}, Exception("sequence race")),
    ):
        race_res = auth_client.post(
            f"/api/user/coach-threads/{tid}/messages",
            json={"messages": [{"role": "assistant", "parts": [_text_part("race")]}]},
        )
    assert race_res.status_code == 409


def test_coach_thread_cascade_delete_and_db_constraints(tmp_path):
    """Deleting a thread cascades messages and DB constraints reject invalid rows."""
    db_url = f"sqlite:///{tmp_path / 'coach_cascade.db'}"
    test_engine = create_db_engine(db_url)
    try:
        init_db(test_engine)
        with Session(test_engine) as db:
            user = User(
                email="cascade_coach@diffly.dev",
                username="cascade_coach",
                hashed_password=hash_password("Password123!"),
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            dual_owner = CoachThread(
                user_id=user.id,
                session_id="g_dual_owner",
                title="Dual owner",
            )
            db.add(dual_owner)
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()

            no_owner = CoachThread(
                user_id=None,
                session_id=None,
                title="No owner",
            )
            db.add(no_owner)
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()

            bad_mode = CoachThread(
                user_id=user.id,
                title="Invalid mode",
                mode="invalid",
            )
            db.add(bad_mode)
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()

            thread = CoachThread(user_id=user.id, title="Cascade check")
            db.add(thread)
            db.commit()
            db.refresh(thread)

            msg1 = CoachMessage(
                thread_id=thread.id,
                role="user",
                parts_json=json.dumps([_text_part("hello")]),
                sequence=0,
            )
            db.add(msg1)
            db.commit()

            bad_role = CoachMessage(
                thread_id=thread.id,
                role="system",
                parts_json=json.dumps([_text_part("bad role")]),
                sequence=1,
            )
            db.add(bad_role)
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()

            dup_seq = CoachMessage(
                thread_id=thread.id,
                role="assistant",
                parts_json=json.dumps([_text_part("dup seq")]),
                sequence=0,
            )
            db.add(dup_seq)
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()

            neg_seq = CoachMessage(
                thread_id=thread.id,
                role="assistant",
                parts_json=json.dumps([_text_part("neg seq")]),
                sequence=-1,
            )
            db.add(neg_seq)
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()

            thread_id = thread.id
            db.delete(thread)
            db.commit()

            remaining = db.exec(
                select(CoachMessage).where(CoachMessage.thread_id == thread_id)
            ).all()
            assert remaining == []

            sql_thread = CoachThread(user_id=user.id, title="SQL user delete cascade")
            db.add(sql_thread)
            db.commit()
            db.refresh(sql_thread)
            sql_msg = CoachMessage(
                thread_id=sql_thread.id,
                role="user",
                parts_json=json.dumps([_text_part("sql user cascade")]),
                sequence=0,
            )
            db.add(sql_msg)
            db.commit()
            sql_tid = sql_thread.id
            user_id = user.id

        with test_engine.begin() as conn:
            conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})

        with Session(test_engine) as db:
            assert db.get(CoachThread, sql_tid) is None
            assert (
                db.exec(
                    select(CoachMessage).where(CoachMessage.thread_id == sql_tid)
                ).all()
                == []
            )

            orm_user = User(
                email="orm_cascade_coach@diffly.dev",
                username="orm_cascade_coach",
                hashed_password=hash_password("Password123!"),
            )
            db.add(orm_user)
            db.commit()
            db.refresh(orm_user)

            orm_thread = CoachThread(
                user_id=orm_user.id, title="ORM user delete cascade"
            )
            db.add(orm_thread)
            db.commit()
            db.refresh(orm_thread)
            orm_msg = CoachMessage(
                thread_id=orm_thread.id,
                role="user",
                parts_json=json.dumps([_text_part("orm user cascade")]),
                sequence=0,
            )
            db.add(orm_msg)
            db.commit()
            orm_tid = orm_thread.id

            db.delete(orm_user)
            db.commit()

            assert db.get(CoachThread, orm_tid) is None
            assert (
                db.exec(
                    select(CoachMessage).where(CoachMessage.thread_id == orm_tid)
                ).all()
                == []
            )
    finally:
        test_engine.dispose()


def test_coach_message_get_parts_corrupt_fallback():
    """CoachMessage.get_parts handles empty, non-list, and corrupt JSON safely."""
    empty_msg = CoachMessage(thread_id="t1", role="user", parts_json="", sequence=0)
    corrupt_msg = CoachMessage(
        thread_id="t1", role="user", parts_json="{bad json", sequence=1
    )
    non_list_msg = CoachMessage(
        thread_id="t1", role="user", parts_json='{"type":"text"}', sequence=2
    )
    assert empty_msg.get_parts() == []
    assert corrupt_msg.get_parts() == []
    assert non_list_msg.get_parts() == []


def test_guest_claim_transfers_threads_and_enforces_quota_atomically(
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    as_guest: Callable[[TestClient, str | None], str],
):
    """Claiming transfers guest threads, revokes guest access, and enforces quota."""
    user = register_user("thread_claim_owner")
    auth_client = login_as("thread_claim_owner")
    guest_client = client_factory()
    guest_sid = as_guest(guest_client, "g-claim-threads-1")

    guest_thread = _create_thread(guest_client, title="Guest thread to claim")
    append_coach_messages(
        session,
        Actor(guest_session_id=guest_sid),
        guest_thread["id"],
        [{"role": "user", "parts": [_text_part("Keep this history")]}],
    )

    saved_guest_cookie = guest_client.cookies.get(settings.GUEST_COOKIE_NAME)
    assert saved_guest_cookie is not None
    auth_client.cookies.set(
        settings.GUEST_COOKIE_NAME, saved_guest_cookie, domain="testserver.local"
    )

    claim_res = auth_client.post("/api/user/claim-session")
    assert claim_res.status_code == 200
    assert claim_res.json()["claimed_threads_count"] == 1
    assert claim_res.json()["claimed_count"] == 1

    db_thread = session.get(CoachThread, guest_thread["id"])
    assert db_thread is not None
    assert db_thread.user_id == user["id"]
    assert db_thread.session_id is None

    # Old guest cookie can no longer read or list the claimed thread
    assert guest_client.get("/api/user/coach-threads").json()["items"] == []
    assert (
        guest_client.get(f"/api/user/coach-threads/{guest_thread['id']}").status_code
        == 404
    )

    # Atomic quota rollback when user already owns 48 threads and guest brings 3
    for idx in range(COACH_THREAD_QUOTA - 3):
        session.add(
            CoachThread(user_id=user["id"], title=f"Owned {idx}", mode="patterns")
        )
    overflow_guest = client_factory()
    overflow_sid = as_guest(overflow_guest, "g-claim-threads-overflow")
    pub_ch = Challenge(
        slug="claim-rollback-pub",
        title="Claim Rollback Pub",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Public",
        code_snippet="x = 1",
        is_public=True,
    )
    priv_ch = Challenge(
        slug="claim-rollback-priv",
        title="Claim Rollback Priv",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Private",
        code_snippet="x = 1",
        is_public=False,
        user_id=None,
        session_id=overflow_sid,
    )
    session.add_all([pub_ch, priv_ch])
    session.commit()
    session.refresh(pub_ch)
    session.refresh(priv_ch)

    overflow_sub = Submission(
        challenge_id=pub_ch.id,
        user_id=None,
        session_id=overflow_sid,
        flagged_lines=[1],
        comments="Must roll back on thread quota failure",
        score=85,
    )
    session.add(overflow_sub)
    for idx in range(3):
        session.add(
            CoachThread(
                user_id=None,
                session_id=overflow_sid,
                title=f"Incoming {idx}",
                mode="patterns",
            )
        )
    session.commit()

    overflow_cookie = overflow_guest.cookies.get(settings.GUEST_COOKIE_NAME)
    assert overflow_cookie is not None
    auth_client.cookies.set(
        settings.GUEST_COOKIE_NAME, overflow_cookie, domain="testserver.local"
    )
    conflict_res = auth_client.post("/api/user/claim-session")
    assert conflict_res.status_code == 409

    # None of the incoming guest threads, challenges, or submissions were transferred
    still_guest = session.exec(
        select(CoachThread).where(CoachThread.session_id == overflow_sid)
    ).all()
    assert len(still_guest) == 3
    assert all(t.user_id is None for t in still_guest)
    session.refresh(priv_ch)
    session.refresh(overflow_sub)
    assert priv_ch.user_id is None
    assert priv_ch.session_id == overflow_sid
    assert overflow_sub.user_id is None
    assert overflow_sub.session_id == overflow_sid


def test_signin_over_coach_thread_quota_sets_header_and_preserves_guest_cookie(
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    as_guest: Callable[[TestClient, str | None], str],
):
    """Sign-in returns X-Diffly-Claim-Status: quota_exceeded on thread quota."""
    user = register_user("thread_signin_quota_user")
    for idx in range(COACH_THREAD_QUOTA - 1):
        session.add(
            CoachThread(user_id=user["id"], title=f"Owned {idx}", mode="patterns")
        )

    login_guest = client_factory()
    login_sid = as_guest(login_guest, "g-signin-thread-quota")
    for idx in range(2):
        session.add(
            CoachThread(
                user_id=None,
                session_id=login_sid,
                title=f"Guest login {idx}",
                mode="patterns",
            )
        )
    session.commit()

    login_res = login_guest.post(
        "/api/auth/login",
        json={"identifier": user["username"], "password": user["password"]},
    )
    assert login_res.status_code == 200
    assert login_res.headers.get("X-Diffly-Claim-Status") == "quota_exceeded"
    assert login_guest.cookies.get(settings.GUEST_COOKIE_NAME) is not None

    remaining_login_guest = session.exec(
        select(CoachThread).where(CoachThread.session_id == login_sid)
    ).all()
    assert len(remaining_login_guest) == 2
    assert all(t.user_id is None for t in remaining_login_guest)

    reg_guest = client_factory()
    reg_sid = as_guest(reg_guest, "g-reg-thread-quota")
    for idx in range(COACH_THREAD_QUOTA + 1):
        session.add(
            CoachThread(
                user_id=None,
                session_id=reg_sid,
                title=f"Guest reg {idx}",
                mode="patterns",
            )
        )
    session.commit()

    reg_res = reg_guest.post(
        "/api/auth/register",
        json={
            "email": "over_thread_quota_reg@diffly.dev",
            "username": "over_thread_quota_reg",
            "password": "Password123!",
        },
    )
    assert reg_res.status_code == 200
    assert reg_res.headers.get("X-Diffly-Claim-Status") == "quota_exceeded"
    assert reg_guest.cookies.get(settings.GUEST_COOKIE_NAME) is not None


def test_cross_thread_same_message_id_and_non_uuid_ai_sdk_ids(
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    client_factory: Callable[[], TestClient],
    as_guest: Callable[[TestClient, str | None], str],
):
    """Distinct threads share message ID namespace and accept AI SDK opaque IDs."""
    register_user("same_id_user_a")
    register_user("same_id_user_b")
    client_a = login_as("same_id_user_a")
    client_b = login_as("same_id_user_b")
    guest_client = client_factory()
    as_guest(guest_client, "g-same-msg-id")

    thread_a = _create_thread(client_a, title="Thread A")["id"]
    thread_b = _create_thread(client_b, title="Thread B")["id"]
    thread_g = _create_thread(guest_client, title="Thread Guest")["id"]

    ai_sdk_id = "7Lab0b2TVnuK5wFX"
    punctuated_id = "msg_1.2:a-b"
    assert validate_message_id(ai_sdk_id) == ai_sdk_id
    assert validate_message_id(punctuated_id) == punctuated_id

    for actor_client, tid, text_val in (
        (client_a, thread_a, "User A message"),
        (client_b, thread_b, "User B message"),
        (guest_client, thread_g, "Guest message"),
    ):
        res = actor_client.post(
            f"/api/user/coach-threads/{tid}/messages",
            json={
                "messages": [
                    {
                        "id": ai_sdk_id,
                        "role": "user",
                        "parts": [_text_part(text_val)],
                    },
                    {
                        "id": punctuated_id,
                        "role": "assistant",
                        "parts": [_text_part(f"Reply to {text_val}")],
                    },
                ]
            },
        )
        assert res.status_code == 201, res.text
        assert res.json()["messages"][0]["id"] == ai_sdk_id
        assert res.json()["messages"][1]["id"] == punctuated_id

    assert (
        client_a.get(f"/api/user/coach-threads/{thread_a}").json()["messages"][0][
            "parts"
        ][0]["text"]
        == "User A message"
    )
    assert (
        client_b.get(f"/api/user/coach-threads/{thread_b}").json()["messages"][0][
            "parts"
        ][0]["text"]
        == "User B message"
    )
    assert (
        guest_client.get(f"/api/user/coach-threads/{thread_g}").json()["messages"][0][
            "parts"
        ][0]["text"]
        == "Guest message"
    )


def test_deeply_nested_parts_and_nul_keys_rejected_without_recursion_error(
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """50-level nested JSON and NUL bytes in dict keys return 422 without crashing."""
    register_user("deep_json_user")
    auth_client = login_as("deep_json_user")
    tid = _create_thread(auth_client)["id"]

    deep_dict: Any = "leaf"
    for _ in range(50):
        deep_dict = {"nested": deep_dict}

    deep_list: Any = "leaf"
    for _ in range(50):
        deep_list = [deep_list]

    for payload_input in (deep_dict, deep_list, {"bad\x00key": "value"}):
        res = auth_client.post(
            f"/api/user/coach-threads/{tid}/messages",
            json={
                "messages": [
                    {
                        "role": "assistant",
                        "parts": [
                            {
                                "type": "tool-configure_challenge",
                                "toolCallId": "call_deep",
                                "state": "input-available",
                                "input": payload_input,
                            }
                        ],
                    }
                ]
            },
        )
        assert res.status_code == 422


def test_delete_thread_204_preserves_refreshed_guest_cookie(
    client_factory: Callable[[], TestClient],
    as_guest: Callable[[TestClient, str | None], str],
):
    """DELETE 204 preserves Set-Cookie when an aging guest cookie needs refresh."""
    guest_client = client_factory()
    guest_sid = as_guest(guest_client, "g-refresh-delete")
    tid = _create_thread(guest_client, title="Refresh delete")["id"]

    stale_age = (settings.GUEST_SESSION_MAX_AGE_DAYS * 86400) // 2 + 60
    stale_cookie = _encode(
        GuestSession(id=guest_sid, issued_at=int(time.time()) - stale_age)
    )
    guest_client.cookies.set(
        settings.GUEST_COOKIE_NAME, stale_cookie, domain="testserver.local"
    )

    del_res = guest_client.delete(f"/api/user/coach-threads/{tid}")
    assert del_res.status_code == 204
    assert del_res.text == ""
    set_cookie = del_res.headers.get("set-cookie", "")
    assert f"{settings.GUEST_COOKIE_NAME}=" in set_cookie
    refreshed_cookie = del_res.cookies.get(settings.GUEST_COOKIE_NAME)
    assert refreshed_cookie is not None
    assert refreshed_cookie != stale_cookie


def test_append_duplicate_ids_reordered_keys_and_tool_state_regression(
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Reject duplicate batch IDs, allow reordered retry keys, block regression."""
    register_user("idempotent_tool_user")
    auth_client = login_as("idempotent_tool_user")
    tid = _create_thread(auth_client)["id"]

    dup_batch_res = auth_client.post(
        f"/api/user/coach-threads/{tid}/messages",
        json={
            "messages": [
                {"id": "dup-id-1", "role": "user", "parts": [_text_part("First")]},
                {"id": "dup-id-1", "role": "user", "parts": [_text_part("Second")]},
            ]
        },
    )
    assert dup_batch_res.status_code == 422
    assert auth_client.get(f"/api/user/coach-threads/{tid}").json()["messages"] == []

    first_raw = json.dumps(
        {
            "messages": [
                {
                    "id": "reordered-user-1",
                    "role": "user",
                    "parts": [{"type": "text", "text": "Canonical key check"}],
                }
            ]
        }
    )
    second_raw = (
        '{"messages":[{"id":"reordered-user-1","role":"user",'
        '"parts":[{"text":"Canonical key check","type":"text"}]}]}'
    )
    first_res = auth_client.post(
        f"/api/user/coach-threads/{tid}/messages",
        content=first_raw,
        headers={"Content-Type": "application/json"},
    )
    assert first_res.status_code == 201
    retry_res = auth_client.post(
        f"/api/user/coach-threads/{tid}/messages",
        content=second_raw,
        headers={"Content-Type": "application/json"},
    )
    assert retry_res.status_code == 201
    assert retry_res.json()["message_count"] == 1

    asst_id = "asst-tool-reg-1"
    for terminal_state, regression_state in (
        ("output-available", "input-available"),
        ("output-error", "approval-requested"),
        ("output-denied", "input-streaming"),
    ):
        msg_id = f"{asst_id}-{terminal_state}"
        init_res = auth_client.post(
            f"/api/user/coach-threads/{tid}/messages",
            json={
                "messages": [
                    {
                        "id": msg_id,
                        "role": "assistant",
                        "parts": [
                            {
                                "type": "tool-configure_challenge",
                                "toolCallId": "call_reg",
                                "state": terminal_state,
                                "input": {"b": 2, "a": 1},
                            }
                        ],
                    }
                ]
            },
        )
        assert init_res.status_code == 201

        reordered_tool_raw = json.dumps(
            {
                "messages": [
                    {
                        "id": msg_id,
                        "role": "assistant",
                        "parts": [
                            {
                                "input": {"a": 1, "b": 2},
                                "state": terminal_state,
                                "toolCallId": "call_reg",
                                "type": "tool-configure_challenge",
                            }
                        ],
                    }
                ]
            }
        )
        assert (
            auth_client.post(
                f"/api/user/coach-threads/{tid}/messages",
                content=reordered_tool_raw,
                headers={"Content-Type": "application/json"},
            ).status_code
            == 201
        )

        regress_res = auth_client.post(
            f"/api/user/coach-threads/{tid}/messages",
            json={
                "messages": [
                    {
                        "id": msg_id,
                        "role": "assistant",
                        "parts": [
                            {
                                "type": "tool-configure_challenge",
                                "toolCallId": "call_reg",
                                "state": regression_state,
                                "input": {"a": 1, "b": 2},
                            }
                        ],
                    }
                ]
            },
        )
        assert regress_res.status_code == 409

        persisted = auth_client.get(f"/api/user/coach-threads/{tid}").json()["messages"]
        matching = [m for m in persisted if m["id"] == msg_id]
        assert matching[0]["parts"][0]["state"] == terminal_state


def test_thread_id_nul_bytes_and_anonymous_filter_validation(
    session: Session,
    client: TestClient,
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Reject NUL bytes in thread_id (404), >64 (422), and invalid anon filters."""
    user = register_user("nul_tid_user")
    auth_client = login_as("nul_tid_user")
    actor = Actor(user_id=user["id"])

    assert client.get("/api/user/coach-threads?mode=invalid").status_code == 422
    assert (
        client.get("/api/user/coach-threads?challenge_slug=has%20space").status_code
        == 422
    )
    assert client.get("/api/user/coach-threads").json() == {"items": [], "total": 0}

    assert auth_client.get("/api/user/coach-threads/bad%00id").status_code == 404
    assert (
        auth_client.patch(
            "/api/user/coach-threads/bad%00id", json={"title": "Renamed"}
        ).status_code
        == 404
    )
    assert auth_client.delete("/api/user/coach-threads/bad%00id").status_code == 404
    assert (
        auth_client.post(
            "/api/user/coach-threads/bad%00id/messages",
            json={"messages": [{"role": "user", "parts": [_text_part("hi")]}]},
        ).status_code
        == 404
    )
    assert (
        auth_client.delete(
            "/api/user/coach-threads/bad%00id/messages?from_sequence=0"
        ).status_code
        == 404
    )

    long_tid = "t" * 65
    assert auth_client.get(f"/api/user/coach-threads/{long_tid}").status_code == 422

    for bad_tid in ("", "bad\x00id", long_tid):
        with pytest.raises(CoachThreadNotFoundError):
            get_coach_thread(session, actor, bad_tid)
        with pytest.raises(CoachThreadNotFoundError):
            rename_coach_thread(session, actor, bad_tid, "Title")
        with pytest.raises(CoachThreadNotFoundError):
            delete_coach_thread(session, actor, bad_tid)
        with pytest.raises(CoachThreadNotFoundError):
            append_coach_messages(
                session,
                actor,
                bad_tid,
                [{"role": "user", "parts": [_text_part("hi")]}],
            )
        with pytest.raises(CoachThreadNotFoundError):
            truncate_coach_messages(session, actor, bad_tid, 0)


def test_coach_thread_write_rate_limit(
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Write endpoints enforce 120 req/60s rate limit and emit Retry-After."""
    register_user("rate_limit_coach_user")
    auth_client = login_as("rate_limit_coach_user")
    tid = _create_thread(auth_client)["id"]

    for idx in range(120):
        res = auth_client.patch(
            f"/api/user/coach-threads/{tid}",
            json={"title": f"Title {idx}"},
        )
        assert res.status_code == 200

    throttled = auth_client.patch(
        f"/api/user/coach-threads/{tid}",
        json={"title": "Title 120"},
    )
    assert throttled.status_code == 429
    assert "Retry-After" in throttled.headers


def test_claim_guest_session_noop_returns_zero_counts(
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    as_guest: Callable[[TestClient, str | None], str],
):
    """Claiming an empty guest session returns 0 counts cleanly."""
    register_user("noop_claim_user")
    auth_client = login_as("noop_claim_user")
    as_guest(auth_client, "g-noop-claim")

    res = auth_client.post("/api/user/claim-session")
    assert res.status_code == 200
    assert res.json()["claimed_count"] == 0
    assert res.json()["claimed_challenges_count"] == 0
    assert res.json()["claimed_threads_count"] == 0
