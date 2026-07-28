"""
Daily notification job — percentage-based alert window.

Flow:
  1. Load global_alert_percentage from system_settings.
  2. Load all WorkerDocuments with expiry_date in (today, today+365].
  3. For each doc, compute alert_days = total_life * pct / 100.
     If days_remaining <= alert_days → document is in alert window.
  4. Skip docs already notified today (notification_log.notification_date == today).
  5. Group alerts by (worker_email, worker_id, project_id) and send one email per group.
  6. Insert NotificationLog rows for each sent alert.
"""

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.associations import DocumentStatus, WorkerDocument
from app.models.notification_log import NotificationLog
from app.services.alert_rules import effective_pct, is_expiring_soon, load_global_pct
from app.services.email_service import DocumentAlert, send_alert_email

logger = logging.getLogger(__name__)

_VALID_STATUSES = (DocumentStatus.PENDING, DocumentStatus.UPLOADED, DocumentStatus.APPROVED)
_LOOKAHEAD_DAYS = 365


async def run_daily_notifications() -> None:
    today = date.today()
    logger.info("Notification job started — %s", today)

    async with AsyncSessionLocal() as db:
        global_pct = await load_global_pct(db)

        # ── 1. Load candidate documents ───────────────────────────────────── #
        horizon = today + timedelta(days=_LOOKAHEAD_DAYS)
        docs_result = await db.execute(
            select(WorkerDocument)
            .where(
                WorkerDocument.expiry_date > today,
                WorkerDocument.expiry_date <= horizon,
                WorkerDocument.status.in_(_VALID_STATUSES),
            )
            .options(
                selectinload(WorkerDocument.worker),
                selectinload(WorkerDocument.document_type),
                selectinload(WorkerDocument.project),
            )
        )
        all_docs = docs_result.scalars().all()

        if not all_docs:
            logger.info("No documents with upcoming expiry dates.")
            return

        # ── 2. Filter to those within their alert window ──────────────────── #
        in_window: list[WorkerDocument] = [
            doc
            for doc in all_docs
            if is_expiring_soon(
                doc.expiry_date,
                doc.issue_date,
                doc.document_type.effective_validity_days,
                effective_pct(doc, doc.document_type, global_pct),
                today,
            )
        ]

        if not in_window:
            logger.info("No documents within alert window today.")
            return

        logger.info("%d documents in alert window.", len(in_window))

        # ── 3. Skip already-notified today ───────────────────────────────── #
        already_logged_result = await db.execute(
            select(NotificationLog.worker_document_id).where(
                NotificationLog.worker_document_id.in_([d.id for d in in_window]),
                NotificationLog.notification_date == today,
            )
        )
        already_logged_ids = {row[0] for row in already_logged_result}
        pending = [d for d in in_window if d.id not in already_logged_ids]

        if not pending:
            logger.info("All documents already notified today.")
            return

        logger.info("%d document alerts pending dispatch.", len(pending))

        # ── 4. Group by (email, worker_id, project_id) ───────────────────── #
        groups: dict[tuple[str, int, int | None], list[WorkerDocument]] = defaultdict(list)
        for doc in pending:
            email = doc.worker.email
            if not email:
                logger.warning(
                    "Worker %d has no email — skipping document %d", doc.worker_id, doc.id
                )
                continue
            groups[(email, doc.worker_id, doc.project_id)].append(doc)

        # ── 5. Send + log ─────────────────────────────────────────────────── #
        sent_count = 0
        now_utc = datetime.now(timezone.utc)

        for (email, worker_id, project_id), docs in groups.items():
            days_list = [(doc.expiry_date - today).days for doc in docs]
            alerts = [
                DocumentAlert(
                    doc_name=doc.document_type.name,
                    category=doc.document_type.category.name if doc.document_type.category else "",
                    expiry_date=doc.expiry_date,
                    threshold_days=(doc.expiry_date - today).days,
                )
                for doc in docs
            ]
            worker_name = f"{docs[0].worker.first_name} {docs[0].worker.last_name}"
            project_name = docs[0].project.name if docs[0].project else "Global"

            try:
                await send_alert_email(email, worker_name, project_name, alerts)
            except Exception as exc:
                logger.error(
                    "SMTP error for worker %d / project %s: %s",
                    worker_id,
                    project_id,
                    exc,
                    exc_info=True,
                )
                continue

            # docs y days_list se construyen en paralelo y tienen el mismo largo
            # por construcción; el zip por defecto (trunca al más corto) es correcto.
            for doc, days_remaining in zip(docs, days_list):  # noqa: B905
                db.add(
                    NotificationLog(
                        worker_id=doc.worker_id,
                        project_id=doc.project_id,
                        document_type_id=doc.document_type_id,
                        worker_document_id=doc.id,
                        threshold_days=days_remaining,  # días restantes al momento del envío
                        notification_date=today,
                        recipient_email=email,
                        sent_at=now_utc,
                    )
                )

            await db.commit()
            sent_count += 1
            logger.info("Email sent → %s (%d alerts, project=%s)", email, len(alerts), project_id)

    logger.info("Notification job finished — %d email(s) sent.", sent_count)
