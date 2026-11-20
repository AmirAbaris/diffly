"""Add share_token column and unique index on challenges.

Revision ID: 0005_challenge_share_token
Revises: 0004_composite_indexes_and_submission_scores
Create Date: 2026-11-20 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0005_challenge_share_token"
down_revision: str | Sequence[str] | None = (
    "0004_composite_indexes_and_submission_scores"
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add nullable unique share_token column and index to challenges."""
    op.add_column(
        "challenges",
        sa.Column("share_token", sa.String(), nullable=True),
    )
    op.create_index(
        op.f("ix_challenges_share_token"),
        "challenges",
        ["share_token"],
        unique=True,
    )


def downgrade() -> None:
    """Drop share_token index and column from challenges."""
    op.drop_index(op.f("ix_challenges_share_token"), table_name="challenges")
    with op.batch_alter_table("challenges") as batch_op:
        batch_op.drop_column("share_token")
