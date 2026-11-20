"""Add GitHub OAuth columns and nullable password hash on users.

Revision ID: 0005_github_oauth_user_columns
Revises: 0004_composite_indexes_and_submission_scores
Create Date: 2026-11-20 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0005_github_oauth_user_columns"
down_revision: str | Sequence[str] | None = (
    "0004_composite_indexes_and_submission_scores"
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add github_id and github_login columns and allow nullable hashed_password."""
    op.add_column("users", sa.Column("github_id", sa.String(), nullable=True))
    op.add_column("users", sa.Column("github_login", sa.String(), nullable=True))
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "hashed_password",
            existing_type=sa.String(),
            nullable=True,
        )
    op.create_index(op.f("ix_users_github_id"), "users", ["github_id"], unique=True)


def downgrade() -> None:
    """Drop GitHub OAuth columns and restore non-null hashed_password."""
    op.drop_index(op.f("ix_users_github_id"), table_name="users")
    op.execute(
        sa.text("UPDATE users SET hashed_password = '' WHERE hashed_password IS NULL")
    )
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "hashed_password",
            existing_type=sa.String(),
            nullable=False,
        )
        batch_op.drop_column("github_login")
        batch_op.drop_column("github_id")
