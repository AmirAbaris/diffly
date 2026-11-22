"""Add nullable judge_outcome Text column to submissions.

Revision ID: 0009_submission_judge
Revises: 0008_submission_findings
Create Date: 2026-11-22 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0009_submission_judge"
down_revision: str | Sequence[str] | None = "0008_submission_findings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add nullable judge_outcome column to submissions table."""
    op.add_column(
        "submissions",
        sa.Column(
            "judge_outcome",
            sa.Text(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Drop judge_outcome column from submissions table."""
    with op.batch_alter_table("submissions") as batch_op:
        batch_op.drop_column("judge_outcome")
