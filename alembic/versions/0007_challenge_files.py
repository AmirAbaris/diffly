"""Add files JSON column to challenges for multi-file PR diff mode.

Revision ID: 0007_challenge_files
Revises: 0006_challenge_share_token
Create Date: 2026-11-20 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0007_challenge_files"
down_revision: str | Sequence[str] | None = "0006_challenge_share_token"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add files column to challenges table."""
    op.add_column(
        "challenges",
        sa.Column(
            "files",
            sa.String(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade() -> None:
    """Drop files column from challenges table."""
    with op.batch_alter_table("challenges") as batch_op:
        batch_op.drop_column("files")
