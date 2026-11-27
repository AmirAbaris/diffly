"""Add CSHARP value to language enum.

Revision ID: 0011_add_csharp_language
Revises: 0010_coach_threads
Create Date: 2026-11-27 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0011_add_csharp_language"
down_revision: str | Sequence[str] | None = "0010_coach_threads"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add CSHARP member to PostgreSQL native language enum."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE language ADD VALUE IF NOT EXISTS 'CSHARP'")


def downgrade() -> None:
    """Block downgrade while CSHARP challenge rows exist."""
    if op.get_context().as_sql:
        return

    bind = op.get_bind()
    result = bind.execute(
        sa.text("SELECT COUNT(*) FROM challenges WHERE language = 'CSHARP'")
    )
    count = result.scalar() if result is not None else 0
    if count and count > 0:
        raise RuntimeError(
            f"Cannot downgrade 0011_add_csharp_language while {count} challenges "
            "still use language='CSHARP'. Remove those rows first."
        )
    # PostgreSQL cannot drop enum values in place without recreating the type.
