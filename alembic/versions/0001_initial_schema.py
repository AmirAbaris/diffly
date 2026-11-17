"""Initial schema baseline.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-17 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create users, challenges, and submissions tables."""
    op.create_table(
        "users",
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("avatar_url", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    op.create_table(
        "challenges",
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column(
            "difficulty",
            sa.Enum("EASY", "MEDIUM", "HARD", name="difficulty"),
            nullable=False,
        ),
        sa.Column(
            "category",
            sa.Enum(
                "AGENT_ANTIPATHS",
                "SECURITY",
                "CONCURRENCY",
                "PERFORMANCE",
                "LOGIC_FLAWS",
                name="category",
            ),
            nullable=False,
        ),
        sa.Column(
            "language",
            sa.Enum("PYTHON", "TYPESCRIPT", "GO", "RUST", "JAVA", name="language"),
            nullable=False,
        ),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("threat_model", sa.String(), nullable=False),
        sa.Column("defect_target", sa.String(), nullable=False),
        sa.Column("code_snippet", sa.String(), nullable=False),
        sa.Column("expected_issues", sa.String(), nullable=False),
        sa.Column("hints", sa.String(), nullable=False),
        sa.Column("canonical_review", sa.String(), nullable=False),
        sa.Column("recommended_fix_diff", sa.String(), nullable=False),
        sa.Column("estimated_minutes", sa.Integer(), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "user_id IS NULL OR session_id IS NULL",
            name="ck_challenges_single_owner",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_challenges_category"), "challenges", ["category"], unique=False
    )
    op.create_index(
        op.f("ix_challenges_difficulty"), "challenges", ["difficulty"], unique=False
    )
    op.create_index(
        op.f("ix_challenges_is_public"), "challenges", ["is_public"], unique=False
    )
    op.create_index(
        op.f("ix_challenges_language"), "challenges", ["language"], unique=False
    )
    op.create_index(
        op.f("ix_challenges_session_id"), "challenges", ["session_id"], unique=False
    )
    op.create_index(op.f("ix_challenges_slug"), "challenges", ["slug"], unique=True)
    op.create_index(
        op.f("ix_challenges_user_id"), "challenges", ["user_id"], unique=False
    )

    op.create_table(
        "submissions",
        sa.Column("challenge_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("flagged_lines", sa.String(), nullable=False),
        sa.Column("comments", sa.String(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("feedback", sa.String(), nullable=False),
        sa.Column("detected_issues", sa.String(), nullable=False),
        sa.Column("missed_issues", sa.String(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "user_id IS NULL OR session_id IS NULL",
            name="ck_submissions_single_owner",
        ),
        sa.ForeignKeyConstraint(
            ["challenge_id"], ["challenges.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_submissions_challenge_id"),
        "submissions",
        ["challenge_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_submissions_session_id"),
        "submissions",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_submissions_user_id"), "submissions", ["user_id"], unique=False
    )


def downgrade() -> None:
    """Drop submissions, challenges, users tables and PostgreSQL enums."""
    op.drop_index(op.f("ix_submissions_user_id"), table_name="submissions")
    op.drop_index(op.f("ix_submissions_session_id"), table_name="submissions")
    op.drop_index(op.f("ix_submissions_challenge_id"), table_name="submissions")
    op.drop_table("submissions")

    op.drop_index(op.f("ix_challenges_user_id"), table_name="challenges")
    op.drop_index(op.f("ix_challenges_slug"), table_name="challenges")
    op.drop_index(op.f("ix_challenges_session_id"), table_name="challenges")
    op.drop_index(op.f("ix_challenges_language"), table_name="challenges")
    op.drop_index(op.f("ix_challenges_is_public"), table_name="challenges")
    op.drop_index(op.f("ix_challenges_difficulty"), table_name="challenges")
    op.drop_index(op.f("ix_challenges_category"), table_name="challenges")
    op.drop_table("challenges")

    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for enum_name in ("language", "category", "difficulty"):
            sa.Enum(name=enum_name).drop(bind, checkfirst=True)
