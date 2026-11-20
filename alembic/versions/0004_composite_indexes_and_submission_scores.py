"""Add composite indexes and structured submission evaluation score columns.

Revision ID: 0004_composite_indexes_and_submission_scores
Revises: 0003_challenge_content_hash
Create Date: 2026-11-20 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0004_composite_indexes_and_submission_scores"
down_revision: str | Sequence[str] | None = "0003_challenge_content_hash"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add structured evaluation columns to submissions and composite indexes."""
    op.add_column(
        "submissions",
        sa.Column(
            "line_precision_score",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0.0"),
        ),
    )
    op.add_column(
        "submissions",
        sa.Column(
            "concept_score",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0.0"),
        ),
    )
    op.add_column(
        "submissions",
        sa.Column(
            "false_positive_penalty",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0.0"),
        ),
    )
    op.add_column(
        "submissions",
        sa.Column(
            "false_positive_lines",
            sa.String(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.add_column(
        "submissions",
        sa.Column(
            "summary",
            sa.String(),
            nullable=False,
            server_default=sa.text("''"),
        ),
    )

    op.create_index(
        "ix_challenges_public_user",
        "challenges",
        ["is_public", "user_id"],
    )
    op.create_index(
        "ix_submissions_user_challenge",
        "submissions",
        ["user_id", "challenge_id"],
    )
    op.create_index(
        "ix_submissions_session_challenge",
        "submissions",
        ["session_id", "challenge_id"],
    )


def downgrade() -> None:
    """Drop composite indexes and structured evaluation columns."""
    op.drop_index("ix_submissions_session_challenge", table_name="submissions")
    op.drop_index("ix_submissions_user_challenge", table_name="submissions")
    op.drop_index("ix_challenges_public_user", table_name="challenges")

    with op.batch_alter_table("submissions") as batch_op:
        batch_op.drop_column("summary")
        batch_op.drop_column("false_positive_lines")
        batch_op.drop_column("false_positive_penalty")
        batch_op.drop_column("concept_score")
        batch_op.drop_column("line_precision_score")
