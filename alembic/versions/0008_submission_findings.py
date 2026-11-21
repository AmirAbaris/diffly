"""Add findings and finding_verdicts JSON columns to submissions.

Revision ID: 0008_submission_findings
Revises: 0007_challenge_files
Create Date: 2026-11-21 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0008_submission_findings"
down_revision: str | Sequence[str] | None = "0007_challenge_files"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add findings and finding_verdicts columns to submissions table."""
    op.add_column(
        "submissions",
        sa.Column(
            "findings",
            sa.String(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.add_column(
        "submissions",
        sa.Column(
            "finding_verdicts",
            sa.String(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade() -> None:
    """Drop findings and finding_verdicts columns from submissions table."""
    with op.batch_alter_table("submissions") as batch_op:
        batch_op.drop_column("finding_verdicts")
        batch_op.drop_column("findings")
