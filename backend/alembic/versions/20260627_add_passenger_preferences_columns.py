"""Add music, ac, communication, vehicle_type_preference columns to passenger_preferences

Revision ID: 20260627_add_passenger_preferences
Revises: 
Create Date: 2026-06-27 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260627_add_passenger_preferences'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Add columns if they do not already exist. Alembic/op doesn't have an IF NOT EXISTS
    # portable helper, so guard using a safe try/except so repeated runs don't fail.
    conn = op.get_bind()
    inspector = None
    try:
        inspector = sa.inspect(conn)
        cols = [c['name'] for c in inspector.get_columns('passenger_preferences')]
    except Exception:
        cols = []

    if 'music_preference' not in cols:
        op.add_column('passenger_preferences', sa.Column('music_preference', sa.String(length=20), nullable=True, server_default='neutral'))
        op.create_index('idx_passenger_music_pref', 'passenger_preferences', ['music_preference'])

    if 'ac_preference' not in cols:
        op.add_column('passenger_preferences', sa.Column('ac_preference', sa.String(length=20), nullable=True, server_default='cool'))

    if 'communication_level' not in cols:
        op.add_column('passenger_preferences', sa.Column('communication_level', sa.String(length=20), nullable=True, server_default='normal'))
        op.create_index('idx_passenger_comm_level', 'passenger_preferences', ['communication_level'])

    if 'vehicle_type_preference' not in cols:
        op.add_column('passenger_preferences', sa.Column('vehicle_type_preference', sa.String(length=500), nullable=True))


def downgrade():
    # Remove columns if present
    conn = op.get_bind()
    try:
        inspector = sa.inspect(conn)
        cols = [c['name'] for c in inspector.get_columns('passenger_preferences')]
    except Exception:
        cols = []

    if 'vehicle_type_preference' in cols:
        op.drop_column('passenger_preferences', 'vehicle_type_preference')

    if 'communication_level' in cols:
        try:
            op.drop_index('idx_passenger_comm_level', table_name='passenger_preferences')
        except Exception:
            pass
        op.drop_column('passenger_preferences', 'communication_level')

    if 'ac_preference' in cols:
        op.drop_column('passenger_preferences', 'ac_preference')

    if 'music_preference' in cols:
        try:
            op.drop_index('idx_passenger_music_pref', table_name='passenger_preferences')
        except Exception:
            pass
        op.drop_column('passenger_preferences', 'music_preference')
