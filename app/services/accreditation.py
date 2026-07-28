from datetime import date, timedelta, datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import ProjectDocumentType, WorkerDocument, DocumentStatus, WorkerProject
from app.models.document_type import DocumentType
from app.models.worker import Worker, WorkLocation
from app.schemas.accreditation import (
    AccreditationResponse,
    DocumentCheck,
    DocumentCheckStatus,
    ProjectTrafficLight,
    TrafficLight,
    WorkerGlobalStatus,
)
from app.models.document_type import ACHS_VALIDITY_DAYS
from app.services.alert_rules import load_global_pct, effective_pct, is_expiring_soon

_INVALID = (DocumentStatus.REJECTED,)
_PENDING_REVIEW = frozenset({DocumentStatus.PENDING, DocumentStatus.UPLOADED})


async def get_worker_base_requirements_gaps(worker_id: int, db: AsyncSession) -> list[str]:
    """
    Bloqueo duro: nombres de los Requisitos Base de la Empresa que el trabajador
    NO tiene al día. Lista vacía == cumple todos los requisitos base.
    """
    global_result = await db.execute(
        select(DocumentType)
        .where(DocumentType.is_global_base_requirement == True, DocumentType.is_active == True)
    )
    global_doc_types = global_result.scalars().all()
    if not global_doc_types:
        return []

    today = date.today()
    docs_result = await db.execute(
        select(WorkerDocument)
        .where(
            WorkerDocument.worker_id == worker_id,
            WorkerDocument.document_type_id.in_([dt.id for dt in global_doc_types]),
            WorkerDocument.status.notin_(_INVALID),
        )
        .order_by(WorkerDocument.upload_date.desc())
    )
    latest: dict[int, WorkerDocument] = {}
    for doc in docs_result.scalars().all():
        latest.setdefault(doc.document_type_id, doc)

    gaps: list[str] = []
    for dt in global_doc_types:
        doc = latest.get(dt.id)
        if doc is None or doc.status in _PENDING_REVIEW:
            gaps.append(dt.name)
        else:
            eff_exp = (doc.issue_date + timedelta(days=ACHS_VALIDITY_DAYS)) if (dt.is_achs and doc.issue_date) else doc.expiry_date
            if eff_exp and eff_exp < today:
                gaps.append(dt.name)
    return gaps


async def get_workers_base_requirements_map(db: AsyncSession) -> dict[int, bool]:
    """Versión a granel de get_worker_base_requirements_gaps para todos los workers activos."""
    workers_result = await db.execute(select(Worker.id).where(Worker.is_active == True))
    worker_ids = workers_result.scalars().all()

    global_result = await db.execute(
        select(DocumentType)
        .where(DocumentType.is_global_base_requirement == True, DocumentType.is_active == True)
    )
    global_dt_ids = [dt.id for dt in global_result.scalars().all()]
    if not global_dt_ids:
        return {wid: True for wid in worker_ids}

    today = date.today()
    docs_result = await db.execute(
        select(WorkerDocument)
        .where(
            WorkerDocument.worker_id.in_(worker_ids),
            WorkerDocument.document_type_id.in_(global_dt_ids),
            WorkerDocument.status.notin_(_INVALID),
        )
        .order_by(WorkerDocument.upload_date.desc())
    )
    latest: dict[tuple[int, int], WorkerDocument] = {}
    for doc in docs_result.scalars().all():
        latest.setdefault((doc.worker_id, doc.document_type_id), doc)

    result: dict[int, bool] = {}
    for wid in worker_ids:
        compliant = True
        for dt_id in global_dt_ids:
            doc = latest.get((wid, dt_id))
            if doc is None or doc.status in _PENDING_REVIEW:
                compliant = False
                break
            if doc.expiry_date and doc.expiry_date < today:
                compliant = False
                break
        result[wid] = compliant
    return result


def _classify_doc(
    doc: "WorkerDocument | None",
    dt: DocumentType,
    is_mandatory: bool,
    is_global: bool,
    today: date,
    global_pct: int,
) -> DocumentCheck:
    cat_name = dt.category.name if dt.category else ""
    if doc is None:
        return DocumentCheck(
            document_type_id=dt.id, document_type_name=dt.name,
            category=cat_name, is_mandatory=is_mandatory, is_global=is_global,
            check_status=DocumentCheckStatus.MISSING,
            worker_document_id=None, expiry_date=None, days_until_expiry=None,
        )
    if doc.status in _PENDING_REVIEW:
        return DocumentCheck(
            document_type_id=dt.id, document_type_name=dt.name,
            category=cat_name, is_mandatory=is_mandatory, is_global=is_global,
            check_status=DocumentCheckStatus.PENDING_REVIEW,
            worker_document_id=doc.id, expiry_date=None, days_until_expiry=None,
        )

    evd = dt.effective_validity_days
    if evd and doc.issue_date:
        expiry_date = doc.issue_date + timedelta(days=evd)
    else:
        expiry_date = doc.expiry_date
    if expiry_date is None:
        check_status = DocumentCheckStatus.OK
        days_until_expiry = None
    else:
        days_until_expiry = (expiry_date - today).days
        if days_until_expiry < 0:
            check_status = DocumentCheckStatus.EXPIRED
        elif is_expiring_soon(
            expiry_date, doc.issue_date, dt.effective_validity_days,
            effective_pct(doc, dt, global_pct), today,
        ):
            check_status = DocumentCheckStatus.EXPIRING_SOON
        else:
            check_status = DocumentCheckStatus.OK

    return DocumentCheck(
        document_type_id=dt.id, document_type_name=dt.name,
        category=cat_name, is_mandatory=is_mandatory, is_global=is_global,
        check_status=check_status, worker_document_id=doc.id,
        expiry_date=expiry_date, days_until_expiry=days_until_expiry,
    )


async def evaluate_accreditation(
    worker_id: int,
    project_id: int,
    db: AsyncSession,
) -> AccreditationResponse:
    global_pct = await load_global_pct(db)
    today = date.today()

    proj_result = await db.execute(
        select(ProjectDocumentType)
        .where(ProjectDocumentType.project_id == project_id)
        .options(selectinload(ProjectDocumentType.document_type))
    )
    proj_requirements = proj_result.scalars().all()
    proj_dt_ids = {r.document_type_id for r in proj_requirements}

    global_result = await db.execute(
        select(DocumentType)
        .where(DocumentType.is_global_base_requirement == True, DocumentType.is_active == True)
    )
    global_doc_types = global_result.scalars().all()

    checks: list[DocumentCheck] = []
    global_dt_ids_seen: set[int] = set()

    for dt in global_doc_types:
        global_dt_ids_seen.add(dt.id)
        doc_result = await db.execute(
            select(WorkerDocument)
            .where(
                WorkerDocument.worker_id == worker_id,
                or_(
                    WorkerDocument.project_id == project_id,
                    WorkerDocument.project_id.is_(None),
                ),
                WorkerDocument.document_type_id == dt.id,
                WorkerDocument.status.notin_(_INVALID),
            )
            .order_by(WorkerDocument.upload_date.desc())
            .limit(1)
        )
        doc = doc_result.scalar_one_or_none()
        checks.append(_classify_doc(doc, dt, True, True, today, global_pct))

    for req in proj_requirements:
        if req.document_type_id in global_dt_ids_seen:
            continue
        dt = req.document_type
        doc_result = await db.execute(
            select(WorkerDocument)
            .where(
                WorkerDocument.worker_id == worker_id,
                WorkerDocument.project_id == project_id,
                WorkerDocument.document_type_id == dt.id,
                WorkerDocument.status.notin_(_INVALID),
            )
            .order_by(WorkerDocument.upload_date.desc())
            .limit(1)
        )
        doc = doc_result.scalar_one_or_none()
        checks.append(_classify_doc(doc, dt, req.is_mandatory, False, today, global_pct))

    mandatory = [c for c in checks if c.is_mandatory]
    bad  = [c for c in mandatory if c.check_status in (DocumentCheckStatus.MISSING, DocumentCheckStatus.EXPIRED)]
    warn = [c for c in mandatory if c.check_status in (DocumentCheckStatus.EXPIRING_SOON, DocumentCheckStatus.PENDING_REVIEW)]

    if bad:
        light = TrafficLight.RED
        summary = f"ROJO — Documentos faltantes o vencidos: {', '.join(c.document_type_name for c in bad)}."
    elif warn:
        light = TrafficLight.YELLOW
        summary = (
            f"AMARILLO — Próximos a vencer: "
            f"{', '.join(f'{c.document_type_name} ({c.days_until_expiry}d)' for c in warn)}."
        )
    else:
        light = TrafficLight.GREEN
        summary = "VERDE — Documentación completa y vigente."

    return AccreditationResponse(
        worker_id=worker_id,
        project_id=project_id,
        traffic_light=light,
        summary=summary,
        documents=checks,
        evaluated_at=datetime.now(timezone.utc),
    )


async def get_workers_global_status(
    db: AsyncSession,
    status: str = "active",
    location: WorkLocation | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> list[WorkerGlobalStatus]:
    today = date.today()
    global_pct = await load_global_pct(db)

    # Query 1: workers + assignments (orden estable con Worker.id de desempate)
    query = select(Worker).where(Worker.is_active == (status == "active"))
    if location is not None:
        query = query.where(Worker.work_location == location)
    query = (
        query
        .options(
            selectinload(Worker.project_assignments)
            .selectinload(WorkerProject.project)
        )
        .order_by(Worker.last_name, Worker.first_name, Worker.id)
    )
    if limit is not None:
        query = query.limit(limit).offset(offset or 0)
    workers_result = await db.execute(query)
    workers = workers_result.scalars().all()
    if not workers:
        return []

    # Query 2: mandatory project requirements
    reqs_result = await db.execute(
        select(ProjectDocumentType).where(ProjectDocumentType.is_mandatory == True)
    )
    required: dict[int, set[int]] = {}
    for req in reqs_result.scalars().all():
        required.setdefault(req.project_id, set()).add(req.document_type_id)

    # Query 3: global base doc types (full objects for override lookup)
    global_result = await db.execute(
        select(DocumentType)
        .where(DocumentType.is_global_base_requirement == True, DocumentType.is_active == True)
    )
    global_doc_types = global_result.scalars().all()
    global_dt_map: dict[int, DocumentType] = {dt.id: dt for dt in global_doc_types}
    global_dt_ids: frozenset[int] = frozenset(global_dt_map)

    # Query 4: ACHS doc types (is_achs=True, activos)
    achs_result = await db.execute(
        select(DocumentType).where(DocumentType.is_achs == True, DocumentType.is_active == True)
    )
    achs_doc_types = achs_result.scalars().all()
    achs_dt_ids: frozenset[int] = frozenset(dt.id for dt in achs_doc_types)
    achs_dt_map: dict[int, DocumentType] = {dt.id: dt for dt in achs_doc_types}

    # Tipos base globales NO-ACHS: los tres semáforos son independientes.
    # global_dt_ids puede incluir tipos ACHS (is_global_base_requirement=True AND is_achs=True),
    # por eso los excluimos aquí para que "Global" evalúe solo docs de empresa (antecedentes,
    # licencia, etc.) y "ACHS" evalúe los exámenes médicos de forma separada.
    global_non_achs_dt_ids: frozenset[int] = global_dt_ids - achs_dt_ids
    global_non_achs_dt_map: dict[int, DocumentType] = {
        k: v for k, v in global_dt_map.items() if k in global_non_achs_dt_ids
    }

    # Query 5: all relevant doc types (globals + project-specific + ACHS) para lookups
    all_req_dt_ids = global_dt_ids | achs_dt_ids | {dt_id for s in required.values() for dt_id in s}
    dt_map: dict[int, DocumentType] = dict(global_dt_map)
    for dt in achs_doc_types:
        dt_map.setdefault(dt.id, dt)
    extra_ids = all_req_dt_ids - global_dt_ids - achs_dt_ids
    if extra_ids:
        extra_result = await db.execute(
            select(DocumentType).where(DocumentType.id.in_(extra_ids))
        )
        for dt in extra_result.scalars().all():
            dt_map[dt.id] = dt

    # Query 6: latest valid docs per (worker, project_id_or_none, doc_type)
    worker_ids = [w.id for w in workers]
    docs_result = await db.execute(
        select(WorkerDocument)
        .where(
            WorkerDocument.worker_id.in_(worker_ids),
            WorkerDocument.status.notin_(_INVALID),
        )
        .order_by(WorkerDocument.upload_date.desc())
    )
    latest: dict[tuple[int, int | None, int], WorkerDocument] = {}
    for doc in docs_result.scalars().all():
        latest.setdefault((doc.worker_id, doc.project_id, doc.document_type_id), doc)

    # Mejor doc por (worker, dt_id) para cada semáforo, buscando en TODOS los proyectos
    # (incluyendo archivados) para no perder docs subidos en contextos anteriores.
    def _best_across_projects(
        store: dict, d_id: int, w_id: int, doc: WorkerDocument
    ) -> None:
        key = (w_id, d_id)
        ex = store.get(key)
        if ex is None or (
            doc.upload_date and ex.upload_date and doc.upload_date > ex.upload_date
        ):
            store[key] = doc

    global_best_doc: dict[tuple[int, int], WorkerDocument] = {}
    achs_best_doc: dict[tuple[int, int], WorkerDocument] = {}
    for (w_id, _p_id, d_id), doc in latest.items():
        if d_id in global_non_achs_dt_ids:
            _best_across_projects(global_best_doc, d_id, w_id, doc)
        if d_id in achs_dt_ids:
            _best_across_projects(achs_best_doc, d_id, w_id, doc)

    def _doc_light(doc: WorkerDocument | None, dt: DocumentType) -> TrafficLight:
        if doc is None:
            return TrafficLight.RED
        if doc.status in _PENDING_REVIEW:
            return TrafficLight.YELLOW
        _evd2 = dt.effective_validity_days
        eff_exp = (doc.issue_date + timedelta(days=_evd2)) if (_evd2 and doc.issue_date) else doc.expiry_date
        if eff_exp and eff_exp < today:
            return TrafficLight.RED
        if eff_exp and is_expiring_soon(
            eff_exp, doc.issue_date, dt.effective_validity_days,
            effective_pct(doc, dt, global_pct), today,
        ):
            return TrafficLight.YELLOW
        return TrafficLight.GREEN

    def _worst(lights: set[TrafficLight]) -> TrafficLight:
        if TrafficLight.RED in lights:
            return TrafficLight.RED
        if TrafficLight.YELLOW in lights:
            return TrafficLight.YELLOW
        return TrafficLight.GREEN

    def _base_status(worker_id: int) -> TrafficLight:
        """Peor semáforo de requisitos base NO-ACHS (antecedentes, licencia, etc.).
        ACHS se evalúa por separado en _achs_status para que los semáforos sean independientes."""
        if not global_non_achs_dt_ids:
            return TrafficLight.GREEN
        lights: set[TrafficLight] = set()
        for dt_id in global_non_achs_dt_ids:
            dt = global_non_achs_dt_map.get(dt_id)
            if dt is None:
                lights.add(TrafficLight.RED)
                continue
            doc = global_best_doc.get((worker_id, dt_id))
            lights.add(_doc_light(doc, dt))
        return _worst(lights)

    def _achs_status(worker_id: int) -> TrafficLight | None:
        """Peor semáforo de los exámenes ACHS del trabajador. None si no hay tipos ACHS."""
        if not achs_dt_ids:
            return None
        lights: set[TrafficLight] = set()
        for dt_id in achs_dt_ids:
            dt = achs_dt_map.get(dt_id)
            if dt is None:
                lights.add(TrafficLight.RED)
                continue
            doc = achs_best_doc.get((worker_id, dt_id))
            lights.add(_doc_light(doc, dt))
        return _worst(lights)

    output: list[WorkerGlobalStatus] = []
    for worker in workers:
        active = [a for a in worker.project_assignments if a.is_active and a.project and a.project.is_active]

        g_status = _base_status(worker.id)
        a_status = _achs_status(worker.id)

        if not active:
            output.append(WorkerGlobalStatus(
                worker_id=worker.id, first_name=worker.first_name,
                last_name=worker.last_name, dni=worker.dni,
                email=worker.email, phone=worker.phone,
                work_location=worker.work_location,
                is_active=worker.is_active, assigned_projects=0,
                global_traffic_light=None, project_statuses=[],
                global_status=g_status, project_status=None,
                achs_status=a_status,
            ))
            continue

        project_lights: list[ProjectTrafficLight] = []
        proj_spec_lights: set[TrafficLight] = set()
        has_specific_reqs = False

        for assgn in active:
            p_id = assgn.project_id
            p_reqs = required.get(p_id, set()) | global_dt_ids

            if not p_reqs:
                p_light = TrafficLight.GREEN
            else:
                lights_seen: set[TrafficLight] = set()
                for dt_id in p_reqs:
                    doc = latest.get((worker.id, p_id, dt_id)) or (
                        latest.get((worker.id, None, dt_id)) if dt_id in global_dt_ids else None
                    )
                    dt = dt_map.get(dt_id)
                    if dt is None:
                        lights_seen.add(TrafficLight.RED)
                        break
                    lgt = _doc_light(doc, dt)
                    lights_seen.add(lgt)
                    if lgt == TrafficLight.RED:
                        break

                p_light = _worst(lights_seen)

            project_lights.append(ProjectTrafficLight(
                project_id=p_id,
                project_name=assgn.project.name if assgn.project else f"Proyecto {p_id}",
                traffic_light=p_light,
            ))

            # Collect project-specific reqs (exclude global base)
            p_specific = required.get(p_id, set()) - global_dt_ids
            for dt_id in p_specific:
                has_specific_reqs = True
                dt = dt_map.get(dt_id)
                if dt is None:
                    proj_spec_lights.add(TrafficLight.RED)
                    continue
                doc = latest.get((worker.id, p_id, dt_id)) or latest.get((worker.id, None, dt_id))
                proj_spec_lights.add(_doc_light(doc, dt))

        global_light = _worst({pl.traffic_light for pl in project_lights})
        p_status = _worst(proj_spec_lights) if has_specific_reqs else TrafficLight.GREEN

        output.append(WorkerGlobalStatus(
            worker_id=worker.id, first_name=worker.first_name,
            last_name=worker.last_name, dni=worker.dni,
            email=worker.email, phone=worker.phone,
            work_location=worker.work_location,
            is_active=worker.is_active, assigned_projects=len(active),
            global_traffic_light=global_light,
            project_statuses=project_lights,
            global_status=g_status,
            project_status=p_status,
            achs_status=a_status,
        ))

    return output
