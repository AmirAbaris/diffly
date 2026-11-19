"""Add content_hash column to challenges for curated seed tracking.

Revision ID: 0003_challenge_content_hash
Revises: 0002_case_insensitive_user_indexes
Create Date: 2026-11-19 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0003_challenge_content_hash"
down_revision: str | Sequence[str] | None = "0002_case_insensitive_user_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add nullable content_hash column to challenges."""
    op.add_column("challenges", sa.Column("content_hash", sa.String(), nullable=True))


def downgrade() -> None:
    """Drop content_hash column from challenges."""
    with op.batch_alter_table("challenges") as batch_op:
        batch_op.drop_column("content_hash")
