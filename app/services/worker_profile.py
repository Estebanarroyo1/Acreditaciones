from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.associations import (
    DocumentStatus,
    ProjectDocumentType,
    WorkerDocument,
    WorkerProject,
)
from app.models.document_type import DocumentType
from app.models.worker import Worker
from app.schemas.accreditation import DocumentCheckStatus, TrafficLight
from app.schemas.worker_profile import (
    ArchivedProjectDoc,
    ArchivedProjectProfile,
    AssignedProjectProfile,
    GlobalRequirementCheck,
    ProjectSpecificCheck,
    WorkerFullProfile,
)
from app.services.alert_rules import effective_pct, is_expiring_soon, load_global_pct

_INVALID = (DocumentStatus.REJECTED,)
_PENDING_REVIEW = frozenset({DocumentStatus.PENDING, DocumentStatus.UPLOADED})


def _eval_doc(doc: "WorkerDocument | None", dt: DocumentType, today: date, global_pct: int):
    """Returns (check_status, expiry_date, days_until_expiry, doc_id)."""
    if doc is None:
        return DocumentCheckStatus.MISSING, None, None, None
    if doc.status in _PENDING_REVIEW:
        return DocumentCheckStatus.PENDING_REVIEW, None, None, doc.id
    # When effective_validity_days is set and issue_date is known, always recompute
    # expiry from those authoritative values instead of relying on the stored field.
    # This ensures ACHS types (always 365d) override any wrongly stored expiry_date.
    evd = dt.effective_validity_days
    if evd and doc.issue_date:
        expiry = doc.issue_date + timedelta(days=evd)
    else:
        expiry = doc.expiry_date
    doc_id = doc.id
    if expiry is None:
        return DocumentCheckStatus.OK, None, None, doc_id
    days = (expiry - today).days
    if days < 0:
        status = DocumentCheckStatus.EXPIRED
    elif is_expiring_soon(
        expiry,
        doc.issue_date,
        dt.effective_validity_days,
        effective_pct(doc, dt, global_pct),
        today,
    ):
        status = DocumentCheckStatus.EXPIRING_SOON
    else:
        status = DocumentCheckStatus.OK
    return status, expiry, days, doc_id


async def get_worker_full_profile(worker_id: int, db: AsyncSession) -> WorkerFullProfile | None:
    worker = await db.get(Worker, worker_id)
    if not worker:
        return None

    today = date.today()
    global_pct = await load_global_pct(db)

    # ── Global doc types ───────────────────────────────────────────────────
    global_result = await db.execute(
        select(DocumentType)
        .where(DocumentType.is_global_base_requirement == True, DocumentType.is_active == True)
        .order_by(DocumentType.name)
    )
    global_doc_types = global_result.scalars().all()
    global_dt_ids = {dt.id for dt in global_doc_types}

    # ── All valid documents for this worker ────────────────────────────────
    docs_result = await db.execute(
        select(WorkerDocument)
        .where(
            WorkerDocument.worker_id == worker_id,
            WorkerDocument.status.notin_(_INVALID),
            WorkerDocument.is_archived == False,
        )
        .order_by(WorkerDocument.upload_date.desc())
    )
    all_docs = docs_result.scalars().all()

    # (project_id, dt_id) → latest doc for that project
    latest_by_project: dict[tuple[int, int], WorkerDocument] = {}
    # dt_id → latest doc across all projects (for global section display)
    latest_global: dict[int, WorkerDocument] = {}
    for doc in all_docs:
        latest_by_project.setdefault((doc.project_id, doc.document_type_id), doc)
        latest_global.setdefault(doc.document_type_id, doc)

    # ── Global requirements (best doc across all projects) ─────────────────
    global_requirements: list[GlobalRequirementCheck] = []
    for dt in global_doc_types:
        status, expiry, days, doc_id = _eval_doc(latest_global.get(dt.id), dt, today, global_pct)
        doc_obj = latest_global.get(dt.id)
        global_requirements.append(
            GlobalRequirementCheck(
                document_type_id=dt.id,
                document_type_name=dt.name,
                category=dt.category.name if dt.category else "",
                validity_days=dt.effective_validity_days,
                check_status=status,
                worker_document_id=doc_id,
                expiry_date=expiry,
                days_until_expiry=days,
                custom_alert_percentage=doc_obj.custom_alert_percentage if doc_obj else None,
                is_achs=dt.is_achs,
                achs_category=dt.achs_category,
            )
        )

    # ── Project assignments (active worker assignments, split by project status) ─
    assignments_result = await db.execute(
        select(WorkerProject)
        .where(WorkerProject.worker_id == worker_id, WorkerProject.is_active == True)
        .options(selectinload(WorkerProject.project))
    )
    all_assignments = assignments_result.scalars().all()
    assignments = [a for a in all_assignments if a.project and a.project.is_active]
    archived_assignments = [a for a in all_assignments if a.project and not a.project.is_active]

    # ── Per-project profile ────────────────────────────────────────────────
    assigned_projects: list[AssignedProjectProfile] = []
    for assgn in assignments:
        project = assgn.project

        # Project-specific requirements (exclude global doc types)
        proj_reqs_result = await db.execute(
            select(ProjectDocumentType)
            .where(ProjectDocumentType.project_id == project.id)
            .options(selectinload(ProjectDocumentType.document_type))
        )
        specific_reqs = [
            r for r in proj_reqs_result.scalars().all() if r.document_type_id not in global_dt_ids
        ]

        project_checks: list[ProjectSpecificCheck] = []
        for req in specific_reqs:
            dt = req.document_type
            status, expiry, days, doc_id = _eval_doc(
                latest_by_project.get((project.id, dt.id)), dt, today, global_pct
            )
            proj_doc = latest_by_project.get((project.id, dt.id))
            project_checks.append(
                ProjectSpecificCheck(
                    document_type_id=dt.id,
                    document_type_name=dt.name,
                    category=dt.category.name if dt.category else "",
                    is_mandatory=req.is_mandatory,
                    check_status=status,
                    worker_document_id=doc_id,
                    expiry_date=expiry,
                    days_until_expiry=days,
                    custom_alert_percentage=proj_doc.custom_alert_percentage if proj_doc else None,
                )
            )

        # Project traffic light: global requirements (per this project) + specific mandatory
        # Falls back to any global upload (project_id=None) if no project-scoped doc exists.
        has_red = False
        has_yellow = False
        for dt in global_doc_types:
            doc = latest_by_project.get((project.id, dt.id)) or latest_global.get(dt.id)
            if doc is None:
                has_red = True
                break
            if doc.status in _PENDING_REVIEW:
                has_yellow = True
                continue
            _evd = dt.effective_validity_days
            eff_expiry = (
                (doc.issue_date + timedelta(days=_evd))
                if (_evd and doc.issue_date)
                else doc.expiry_date
            )
            if eff_expiry and eff_expiry < today:
                has_red = True
                break
            if eff_expiry and is_expiring_soon(
                eff_expiry,
                doc.issue_date,
                dt.effective_validity_days,
                effective_pct(doc, dt, global_pct),
                today,
            ):
                has_yellow = True
        if not has_red:
            for chk in project_checks:
                if not chk.is_mandatory:
                    continue
                if chk.check_status in (DocumentCheckStatus.MISSING, DocumentCheckStatus.EXPIRED):
                    has_red = True
                    break
                if chk.check_status in (
                    DocumentCheckStatus.EXPIRING_SOON,
                    DocumentCheckStatus.PENDING_REVIEW,
                ):
                    has_yellow = True

        p_light = (
            TrafficLight.RED
            if has_red
            else TrafficLight.YELLOW
            if has_yellow
            else TrafficLight.GREEN
        )

        assigned_projects.append(
            AssignedProjectProfile(
                project_id=project.id,
                project_name=project.name,
                project_description=project.description,
                traffic_light=p_light,
                project_specific_requirements=project_checks,
            )
        )

    # ── Global traffic light: worst across all projects ────────────────────
    lights = {ap.traffic_light for ap in assigned_projects}
    global_light: TrafficLight | None = (
        TrafficLight.RED
        if TrafficLight.RED in lights
        else TrafficLight.YELLOW
        if TrafficLight.YELLOW in lights
        else TrafficLight.GREEN
        if lights
        else None
    )

    # ── Archived project history ────────────────────────────────────────────
    archived_projects: list[ArchivedProjectProfile] = []
    for assgn in archived_assignments:
        project = assgn.project

        proj_reqs_result = await db.execute(
            select(ProjectDocumentType)
            .where(ProjectDocumentType.project_id == project.id)
            .options(selectinload(ProjectDocumentType.document_type))
        )
        proj_reqs = proj_reqs_result.scalars().all()

        docs: list[ArchivedProjectDoc] = []
        seen: set[int] = set()

        for dt in global_doc_types:
            seen.add(dt.id)
            doc = latest_by_project.get((project.id, dt.id))
            docs.append(
                ArchivedProjectDoc(
                    document_type_id=dt.id,
                    document_type_name=dt.name,
                    category=dt.category.name if dt.category else "",
                    worker_document_id=doc.id if doc else None,
                    expiry_date=doc.expiry_date if doc else None,
                )
            )

        for req in proj_reqs:
            if req.document_type_id in seen:
                continue
            dt = req.document_type
            doc = latest_by_project.get((project.id, dt.id))
            docs.append(
                ArchivedProjectDoc(
                    document_type_id=dt.id,
                    document_type_name=dt.name,
                    category=dt.category.name if dt.category else "",
                    worker_document_id=doc.id if doc else None,
                    expiry_date=doc.expiry_date if doc else None,
                )
            )

        archived_projects.append(
            ArchivedProjectProfile(
                project_id=project.id,
                project_name=project.name,
                project_description=project.description,
                documents=docs,
            )
        )

    return WorkerFullProfile(
        worker_id=worker.id,
        first_name=worker.first_name,
        last_name=worker.last_name,
        dni=worker.dni,
        email=worker.email,
        phone=worker.phone,
        is_active=worker.is_active,
        global_traffic_light=global_light,
        global_requirements=global_requirements,
        assigned_projects=assigned_projects,
        archived_projects=archived_projects,
    )
