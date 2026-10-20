"""Create the Phase 1 migration boundary.

The domain tables are intentionally introduced in a later phase. Keeping an
initial revision makes the migration workflow explicit from the start.
"""

from collections.abc import Sequence

revision: str = "0001_phase1_foundation"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
