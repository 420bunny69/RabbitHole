"""add workspace claim token fields

Revision ID: d4e5f6a7b8c9
Revises: a1b2c3d4e5f6
Create Date: 2026-11-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("workspaces") as batch_op:
        batch_op.add_column(sa.Column("claim_token_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("claim_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("workspaces") as batch_op:
        batch_op.drop_column("claim_expires_at")
        batch_op.drop_column("claim_token_hash")