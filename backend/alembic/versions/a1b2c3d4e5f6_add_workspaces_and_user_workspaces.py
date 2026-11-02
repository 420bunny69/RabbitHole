"""add workspaces and user_workspaces with backfill

Revision ID: a1b2c3d4e5f6
Revises: 92b3fafb427b
Create Date: 2026-11-02 23:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '92b3fafb427b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema and backfill existing workspace UUIDs."""
    op.create_table(
        'workspaces',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'user_workspaces',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('workspace_id', sa.Uuid(), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id')
    )
    with op.batch_alter_table('user_workspaces', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_user_workspaces_workspace_id'), ['workspace_id'], unique=True)

    # Backfill workspaces table from distinct existing owner_id values in items and concepts.
    # Uses CURRENT_TIMESTAMP for created_at and 'Personal Workspace' for name.
    # SQLite / Postgres compatible UNION query guarantees distinct IDs.
    op.execute(
        """
        INSERT INTO workspaces (id, name, created_at)
        SELECT DISTINCT owner_id, 'Personal Workspace', CURRENT_TIMESTAMP
        FROM items
        WHERE owner_id IS NOT NULL
        UNION
        SELECT DISTINCT owner_id, 'Personal Workspace', CURRENT_TIMESTAMP
        FROM concepts
        WHERE owner_id IS NOT NULL
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_user_workspaces_workspace_id', table_name='user_workspaces')
    op.drop_table('user_workspaces')
    op.drop_table('workspaces')

