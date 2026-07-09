"""enforce 365-day validity for ACHS document types and correct existing documents

Revision ID: a2b3c4d5e6f7
Revises: f6a7b8c9d0e1
Create Date: 2026-07-08

"""
from alembic import op

revision = 'a2b3c4d5e6f7'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Set validity_days = 365 for every ACHS document type
    op.execute("""
        UPDATE document_types
        SET validity_days = 365
        WHERE is_achs = TRUE
    """)

    # 2. Correct expiry_date on active worker documents whose type is ACHS
    #    and whose issue_date is known.  Documents without issue_date cannot be
    #    corrected deterministically and are left untouched.
    op.execute("""
        UPDATE worker_documents wd
        SET expiry_date = wd.issue_date + INTERVAL '365 days'
        FROM document_types dt
        WHERE wd.document_type_id = dt.id
          AND dt.is_achs = TRUE
          AND wd.issue_date IS NOT NULL
          AND wd.is_archived = FALSE
    """)


def downgrade() -> None:
    # Data corrections cannot be deterministically reversed.
    pass
