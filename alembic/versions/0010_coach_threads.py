"""Create coach_threads and coach_messages tables.

Revision ID: 0010_coach_threads
Revises: 0009_submission_judge
Create Date: 2026-11-25 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0010_coach_threads"
down_revision: str | Sequence[str] | None = "0009_submission_judge"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create coach_threads and coach_messages tables and indexes."""
    op.create_table(
        "coach_threads",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("challenge_slug", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "(user_id IS NOT NULL AND session_id IS NULL) "
            "OR (user_id IS NULL AND session_id IS NOT NULL)",
            name="ck_coach_threads_single_owner",
        ),
        sa.CheckConstraint(
            "mode IN ('patterns', 'debrief')",
            name="ck_coach_threads_mode",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_coach_threads_challenge_slug"),
        "coach_threads",
        ["challenge_slug"],
        unique=False,
    )
    op.create_index(
        op.f("ix_coach_threads_session_id"),
        "coach_threads",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        "ix_coach_threads_session_updated",
        "coach_threads",
        ["session_id", "updated_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_coach_threads_user_id"),
        "coach_threads",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_coach_threads_user_updated",
        "coach_threads",
        ["user_id", "updated_at"],
        unique=False,
    )

    op.create_table(
        "coach_messages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("thread_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("parts_json", sa.String(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "role IN ('user', 'assistant')",
            name="ck_coach_messages_role",
        ),
        sa.CheckConstraint(
            "sequence >= 0",
            name="ck_coach_messages_sequence_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["thread_id"], ["coach_threads.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("thread_id", "id"),
        sa.UniqueConstraint(
            "thread_id",
            "sequence",
            name="uq_coach_messages_thread_sequence",
        ),
    )


def downgrade() -> None:
    """Drop coach_messages and coach_threads tables and indexes."""
    op.drop_table("coach_messages")

    op.drop_index("ix_coach_threads_user_updated", table_name="coach_threads")
    op.drop_index(op.f("ix_coach_threads_user_id"), table_name="coach_threads")
    op.drop_index("ix_coach_threads_session_updated", table_name="coach_threads")
    op.drop_index(op.f("ix_coach_threads_session_id"), table_name="coach_threads")
    op.drop_index(op.f("ix_coach_threads_challenge_slug"), table_name="coach_threads")
    op.drop_table("coach_threads")
