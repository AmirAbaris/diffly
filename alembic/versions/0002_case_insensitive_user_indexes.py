"""Add case-insensitive unique lowercased columns and indexes on users.

Revision ID: 0002_case_insensitive_user_indexes
Revises: 0001_initial_schema
Create Date: 2026-11-18 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import context, op


# revision identifiers, used by Alembic.
revision: str = "0002_case_insensitive_user_indexes"
down_revision: str | Sequence[str] | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add email_lower and username_lower columns, backfill, and index uniquely."""
    op.add_column("users", sa.Column("email_lower", sa.String(), nullable=True))
    op.add_column("users", sa.Column("username_lower", sa.String(), nullable=True))

    if context.is_offline_mode():
        op.execute(
            sa.text(
                "UPDATE users SET email_lower = lower(trim(email)), "
                "username_lower = lower(trim(username))"
            )
        )
    else:
        bind = op.get_bind()
        rows = bind.execute(sa.text("SELECT id, email, username FROM users")).all()
        if rows:
            bind.execute(
                sa.text(
                    "UPDATE users SET email_lower = :email_lower, "
                    "username_lower = :username_lower WHERE id = :user_id"
                ),
                [
                    {
                        "user_id": user_id,
                        "email_lower": (email or "").strip().lower(),
                        "username_lower": (username or "").strip().lower(),
                    }
                    for user_id, email, username in rows
                ],
            )

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "email_lower",
            existing_type=sa.String(),
            nullable=False,
        )
        batch_op.alter_column(
            "username_lower",
            existing_type=sa.String(),
            nullable=False,
        )

    op.create_index(
        "ix_users_email_lower",
        "users",
        ["email_lower"],
        unique=True,
    )
    op.create_index(
        "ix_users_username_lower",
        "users",
        ["username_lower"],
        unique=True,
    )


def downgrade() -> None:
    """Drop lowercased unique indexes and columns from users."""
    op.drop_index("ix_users_username_lower", table_name="users")
    op.drop_index("ix_users_email_lower", table_name="users")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("username_lower")
        batch_op.drop_column("email_lower")
