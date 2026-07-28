from fastapi import APIRouter

from app.api.v1.endpoints import (
    accreditation,
    admin,
    auth,
    document_categories,
    document_types,
    projects,
    reports,
    settings,
    vehicle_accreditation,
    vehicle_document_types,
    vehicle_documents,
    vehicle_maintenance,
    vehicle_services,
    vehicles,
    worker_documents,
    workers,
)

api_router = APIRouter()
api_router.include_router(projects.router)
api_router.include_router(workers.router)
api_router.include_router(document_types.router)
api_router.include_router(document_categories.router)
api_router.include_router(worker_documents.router)
api_router.include_router(accreditation.router)
api_router.include_router(admin.router)
api_router.include_router(settings.router)
api_router.include_router(reports.router)
api_router.include_router(vehicles.router)
api_router.include_router(vehicle_document_types.router)
api_router.include_router(vehicle_documents.router)
api_router.include_router(vehicle_maintenance.router)
api_router.include_router(vehicle_services.router)
api_router.include_router(vehicle_accreditation.router)
api_router.include_router(auth.router)
