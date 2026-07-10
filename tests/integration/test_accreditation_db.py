"""
Integration tests for accreditation service functions that require a database.

Uses the SQLite-in-memory db_session fixture from conftest.py.
Each test starts with a clean empty database.
"""
from datetime import date, datetime, timedelta, timezone

from app.models.associations import DocumentStatus, WorkerDocument
from app.models.document_type import ACHS_VALIDITY_DAYS, DocumentType
from app.models.worker import Worker, WorkLocation
from app.services.accreditation import get_worker_base_requirements_gaps


async def _commit_all(db, *objs):
    for obj in objs:
        db.add(obj)
    await db.commit()
    for obj in objs:
        await db.refresh(obj)


class TestGetWorkerBaseRequirementsGaps:
    async def test_no_global_types_means_no_gaps(self, db_session):
        worker = Worker(first_name="Ana", last_name="Paz", dni="11111111",
                        work_location=WorkLocation.OBRA)
        await _commit_all(db_session, worker)
        gaps = await get_worker_base_requirements_gaps(worker.id, db_session)
        assert gaps == []

    async def test_missing_document_appears_in_gaps(self, db_session):
        worker = Worker(first_name="Luis", last_name="Mora", dni="22222222",
                        work_location=WorkLocation.PLANTA)
        dt = DocumentType(name="Contrato", is_global_base_requirement=True,
                          is_active=True, is_achs=False)
        await _commit_all(db_session, worker, dt)

        gaps = await get_worker_base_requirements_gaps(worker.id, db_session)
        assert "Contrato" in gaps

    async def test_approved_valid_document_closes_gap(self, db_session):
        worker = Worker(first_name="Sara", last_name="Ríos", dni="33333333",
                        work_location=WorkLocation.OBRA)
        dt = DocumentType(name="Licencia", is_global_base_requirement=True,
                          is_active=True, is_achs=False)
        await _commit_all(db_session, worker, dt)

        doc = WorkerDocument(
            worker_id=worker.id, document_type_id=dt.id,
            file_path="f.pdf", original_filename="f.pdf",
            upload_date=datetime.now(timezone.utc),
            status=DocumentStatus.APPROVED,
            expiry_date=date.today() + timedelta(days=365),
        )
        await _commit_all(db_session, doc)

        gaps = await get_worker_base_requirements_gaps(worker.id, db_session)
        assert "Licencia" not in gaps

    async def test_uploaded_pending_document_still_creates_gap(self, db_session):
        worker = Worker(first_name="Pedro", last_name="Cruz", dni="44444444",
                        work_location=WorkLocation.PLANTA)
        dt = DocumentType(name="ARL", is_global_base_requirement=True,
                          is_active=True, is_achs=False)
        await _commit_all(db_session, worker, dt)

        doc = WorkerDocument(
            worker_id=worker.id, document_type_id=dt.id,
            file_path="f.pdf", original_filename="f.pdf",
            upload_date=datetime.now(timezone.utc),
            status=DocumentStatus.UPLOADED,  # awaiting review
            expiry_date=date.today() + timedelta(days=365),
        )
        await _commit_all(db_session, doc)

        gaps = await get_worker_base_requirements_gaps(worker.id, db_session)
        assert "ARL" in gaps

    async def test_expired_document_creates_gap(self, db_session):
        worker = Worker(first_name="Rosa", last_name="Vera", dni="55555555",
                        work_location=WorkLocation.OBRA)
        dt = DocumentType(name="Seguro", is_global_base_requirement=True,
                          is_active=True, is_achs=False)
        await _commit_all(db_session, worker, dt)

        doc = WorkerDocument(
            worker_id=worker.id, document_type_id=dt.id,
            file_path="f.pdf", original_filename="f.pdf",
            upload_date=datetime.now(timezone.utc),
            status=DocumentStatus.APPROVED,
            expiry_date=date.today() - timedelta(days=1),  # expired yesterday
        )
        await _commit_all(db_session, doc)

        gaps = await get_worker_base_requirements_gaps(worker.id, db_session)
        assert "Seguro" in gaps

    async def test_achs_doc_with_issue_date_uses_365_day_validity(self, db_session):
        """
        ACHS documents: effective expiry = issue_date + ACHS_VALIDITY_DAYS (365).
        A document issued 200 days ago has 165 days left → still valid → no gap.
        """
        worker = Worker(first_name="Tomas", last_name="Gil", dni="66666666",
                        work_location=WorkLocation.PLANTA)
        dt = DocumentType(name="Examen ACHS", is_global_base_requirement=True,
                          is_active=True, is_achs=True)
        await _commit_all(db_session, worker, dt)

        issue = date.today() - timedelta(days=200)
        doc = WorkerDocument(
            worker_id=worker.id, document_type_id=dt.id,
            file_path="f.pdf", original_filename="f.pdf",
            upload_date=datetime.now(timezone.utc),
            status=DocumentStatus.APPROVED,
            issue_date=issue,
            expiry_date=None,  # no explicit expiry — service uses issue+365
        )
        await _commit_all(db_session, doc)

        gaps = await get_worker_base_requirements_gaps(worker.id, db_session)
        assert "Examen ACHS" not in gaps

    async def test_achs_doc_expired_via_365_rule_creates_gap(self, db_session):
        """
        ACHS doc issued 400 days ago → effective expiry was 35 days ago → expired → gap.
        """
        worker = Worker(first_name="Marta", last_name="Soto", dni="77777777",
                        work_location=WorkLocation.OBRA)
        dt = DocumentType(name="Examen Médico", is_global_base_requirement=True,
                          is_active=True, is_achs=True)
        await _commit_all(db_session, worker, dt)

        issue = date.today() - timedelta(days=ACHS_VALIDITY_DAYS + 35)  # 400 days ago
        doc = WorkerDocument(
            worker_id=worker.id, document_type_id=dt.id,
            file_path="f.pdf", original_filename="f.pdf",
            upload_date=datetime.now(timezone.utc),
            status=DocumentStatus.APPROVED,
            issue_date=issue,
            expiry_date=None,
        )
        await _commit_all(db_session, doc)

        gaps = await get_worker_base_requirements_gaps(worker.id, db_session)
        assert "Examen Médico" in gaps

    async def test_rejected_document_ignored_creating_gap(self, db_session):
        worker = Worker(first_name="Hugo", last_name="Bello", dni="88888888",
                        work_location=WorkLocation.PLANTA)
        dt = DocumentType(name="Cédula", is_global_base_requirement=True,
                          is_active=True, is_achs=False)
        await _commit_all(db_session, worker, dt)

        doc = WorkerDocument(
            worker_id=worker.id, document_type_id=dt.id,
            file_path="f.pdf", original_filename="f.pdf",
            upload_date=datetime.now(timezone.utc),
            status=DocumentStatus.REJECTED,
            expiry_date=date.today() + timedelta(days=365),
        )
        await _commit_all(db_session, doc)

        gaps = await get_worker_base_requirements_gaps(worker.id, db_session)
        assert "Cédula" in gaps
