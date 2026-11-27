"""Add leaderboard_opt_out column to users table.

Revision ID: 0011_user_leaderboard_opt_out
Revises: 0010_coach_threads
Create Date: 2026-11-27 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0011_user_leaderboard_opt_out"
down_revision: str | Sequence[str] | None = "0010_coach_threads"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add non-nullable leaderboard_opt_out boolean column defaulting to false."""
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column(
                "leaderboard_opt_out",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    """Drop leaderboard_opt_out column from users table."""
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("leaderboard_opt_out")
