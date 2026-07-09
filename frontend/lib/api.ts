import type {
  AccreditationStatus,
  AlertSettings,
  BulkUploadResult,
  CreateDocumentCategoryPayload,
  CreateDocumentTypePayload,
  CreateProjectPayload,
  CreateVehicleDocumentTypePayload,
  CreateVehicleMaintenancePayload,
  CreateVehiclePayload,
  CreateWorkerPayload,
  DocumentCategory,
  DocumentType,
  ExpiringDocumentItem,
  Project,
  ProjectRequirement,
  Vehicle,
  VehicleAIScanResult,
  VehicleAlertSettings,
  VehicleDocumentType,
  VehicleFullProfile,
  VehicleGlobalStatus,
  Worker,
  WorkerFullProfile,
  WorkerGlobalStatus,
} from './types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail ?? `${res.status} ${res.statusText}`)
  }
}

export const api = {
  // Projects
  getProjects: () => get<Project[]>('/projects/'),
  getArchivedProjects: () => get<Project[]>('/projects/archived'),
  createProject: (payload: CreateProjectPayload) =>
    post<Project>('/projects/', payload),
  archiveProject: (id: number) => post<Project>(`/projects/${id}/archive`, {}),
  restoreProject: (id: number) => post<Project>(`/projects/${id}/restore`, {}),
  deleteProject: (id: number) => del(`/projects/${id}`),
  getProjectWorkers: (projectId: number) =>
    get<Worker[]>(`/projects/${projectId}/workers`),
  getProjectRequirements: (projectId: number) =>
    get<ProjectRequirement[]>(`/projects/${projectId}/document-types`),
  addProjectRequirement: (projectId: number, docTypeId: number, isMandatory = true) =>
    post<ProjectRequirement>(`/projects/${projectId}/document-types/${docTypeId}?is_mandatory=${isMandatory}`, {}),
  removeProjectRequirement: (projectId: number, docTypeId: number) =>
    del(`/projects/${projectId}/document-types/${docTypeId}`),

  // Workers
  getWorkers: (filters?: { status?: 'active' | 'archived'; location?: 'planta' | 'obra' }) => {
    const q = new URLSearchParams()
    if (filters?.status) q.set('status', filters.status)
    if (filters?.location) q.set('location', filters.location)
    return get<Worker[]>(`/workers/?${q}`)
  },
  createWorker: (payload: CreateWorkerPayload) =>
    post<Worker>('/workers/', payload),
  getWorkerFullProfile: (workerId: number) =>
    get<WorkerFullProfile>(`/workers/${workerId}/full-profile`),
  archiveWorker: (workerId: number) =>
    patch<Worker>(`/workers/${workerId}/archive`, {}),
  restoreWorker: (workerId: number) =>
    patch<Worker>(`/workers/${workerId}/restore`, {}),
  deleteWorker: (workerId: number) => del(`/workers/${workerId}`),
  assignWorkerToProject: (workerId: number, projectId: number) =>
    post<unknown>(`/workers/${workerId}/projects/${projectId}`, {}),
  unassignWorkerFromProject: (workerId: number, projectId: number) =>
    del(`/workers/${workerId}/projects/${projectId}`),

  // Document categories
  getDocumentCategories: () => get<DocumentCategory[]>('/document-categories/'),
  createDocumentCategory: (payload: CreateDocumentCategoryPayload) =>
    post<DocumentCategory>('/document-categories/', payload),
  updateDocumentCategory: (id: number, payload: Partial<CreateDocumentCategoryPayload>) =>
    patch<DocumentCategory>(`/document-categories/${id}`, payload),
  deleteDocumentCategory: (id: number) => del(`/document-categories/${id}`),

  // Document types
  getDocumentTypes: () => get<DocumentType[]>('/document-types/'),
  createDocumentType: (payload: CreateDocumentTypePayload) =>
    post<DocumentType>('/document-types/', payload),
  updateDocumentType: (id: number, payload: Partial<CreateDocumentTypePayload & { is_active: boolean }>) =>
    patch<DocumentType>(`/document-types/${id}`, payload),
  deleteDocumentType: async (id: number): Promise<void> => {
    const res = await fetch(`${BASE}/document-types/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw Object.assign(new Error(err?.detail ?? 'Error al eliminar'), { httpStatus: res.status })
    }
  },

  // Accreditation
  getAccreditation: (workerId: number, projectId: number) =>
    get<AccreditationStatus>(`/accreditation/${workerId}/${projectId}`),
  getWorkersGlobalStatus: (filters?: { status?: 'active' | 'archived'; location?: 'planta' | 'obra' }) => {
    const q = new URLSearchParams()
    if (filters?.status) q.set('status', filters.status)
    if (filters?.location) q.set('location', filters.location)
    return get<WorkerGlobalStatus[]>(`/accreditation/workers/global-status?${q}`)
  },

  // Document URLs (for use in <a href> / <iframe src> tags)
  getDocumentDownloadUrl: (docId: number) =>
    `${BASE}/worker-documents/${docId}/download`,
  getDocumentViewUrl: (docId: number) =>
    `${BASE}/worker-documents/${docId}/view`,

  // Bulk ZIP download of a worker's documents (global requirements or one project)
  downloadWorkerDocumentsZip: async (
    workerId: number,
    scope: { kind: 'global' } | { kind: 'project'; projectId: number }
  ): Promise<void> => {
    const params = new URLSearchParams({ scope: scope.kind })
    if (scope.kind === 'project') params.set('project_id', String(scope.projectId))
    const res = await fetch(`${BASE}/workers/${workerId}/documents/download-zip?${params}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail ?? 'Error al descargar el ZIP')
    }
    const blob = await res.blob()
    const match = res.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)
    const filename = match?.[1] ?? 'documentos.zip'
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },

  // Bulk upload
  getBulkTemplate: () => `${BASE}/workers/bulk-template`,
  bulkUploadWorkers: async (file: File): Promise<BulkUploadResult> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/workers/bulk-upload`, { method: 'POST', body: form })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail ?? `${res.status} ${res.statusText}`)
    }
    return res.json() as Promise<BulkUploadResult>
  },

  // Alert settings (workers)
  getAlertSettings: () => get<AlertSettings>('/settings/alerts'),
  updateAlertSettings: (payload: { global_alert_percentage: number }) =>
    patch<AlertSettings>('/settings/alerts', payload),

  // Alert settings (fleet/vehicles)
  getVehicleAlertSettings: () => get<VehicleAlertSettings>('/settings/vehicle-alerts'),
  updateVehicleAlertSettings: (payload: { vehicle_global_alert_days: number }) =>
    patch<VehicleAlertSettings>('/settings/vehicle-alerts', payload),

  // Reports
  getExpiringDocuments: (params: { days_threshold?: number; worker_id?: number; project_id?: number }): Promise<ExpiringDocumentItem[]> => {
    const q = new URLSearchParams()
    if (params.days_threshold != null) q.set('days_threshold', String(params.days_threshold))
    if (params.worker_id     != null) q.set('worker_id',      String(params.worker_id))
    if (params.project_id    != null) q.set('project_id',     String(params.project_id))
    return get<ExpiringDocumentItem[]>(`/reports/expiring-documents?${q}`)
  },

  reviewDocument: (docId: number, payload: {
    status: 'approved' | 'rejected'
    reviewer_notes?: string
  }): Promise<void> =>
    patch<void>(`/worker-documents/${docId}/review`, payload),

  // Document edit (replace file and/or update dates and/or custom alert %)
  editDocument: async (docId: number, payload: {
    expiry_date?: string
    issue_date?: string
    file?: File
    custom_alert_percentage?: number | null
  }): Promise<void> => {
    const form = new FormData()
    if (payload.expiry_date) form.append('expiry_date', payload.expiry_date)
    if (payload.issue_date)  form.append('issue_date',  payload.issue_date)
    if (payload.file)        form.append('file', payload.file)
    // Send 0 to clear the override, send the number to set it
    if (payload.custom_alert_percentage !== undefined) {
      form.append('custom_alert_percentage', String(payload.custom_alert_percentage ?? 0))
    }
    const res = await fetch(`${BASE}/worker-documents/${docId}`, { method: 'PATCH', body: form })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw Object.assign(new Error(err?.detail ?? 'Error al actualizar el documento'), { httpStatus: res.status })
    }
  },

  // ── Fleet ──────────────────────────────────────────────────────────────

  // Vehicles
  getVehicles: (activeOnly = true) =>
    get<Vehicle[]>(`/vehicles/?active_only=${activeOnly}`),
  createVehicle: (payload: CreateVehiclePayload) =>
    post<Vehicle>('/vehicles/', payload),
  updateVehicle: (id: number, payload: Partial<CreateVehiclePayload & { is_active: boolean }>) =>
    patch<Vehicle>(`/vehicles/${id}`, payload),
  archiveVehicle: (id: number) => patch<Vehicle>(`/vehicles/${id}/archive`, {}),
  restoreVehicle: (id: number) => patch<Vehicle>(`/vehicles/${id}/restore`, {}),
  deleteVehicle: (id: number) => del(`/vehicles/${id}`),

  // Vehicle document types
  getVehicleDocumentTypes: (activeOnly = true) =>
    get<VehicleDocumentType[]>(`/vehicle-document-types/?active_only=${activeOnly}`),
  createVehicleDocumentType: (payload: CreateVehicleDocumentTypePayload) =>
    post<VehicleDocumentType>('/vehicle-document-types/', payload),
  updateVehicleDocumentType: (id: number, payload: Partial<CreateVehicleDocumentTypePayload & { is_active: boolean }>) =>
    patch<VehicleDocumentType>(`/vehicle-document-types/${id}`, payload),
  deleteVehicleDocumentType: (id: number) => del(`/vehicle-document-types/${id}`),

  // Vehicle documents
  uploadVehicleDocument: async (payload: {
    vehicle_id: number
    vehicle_document_type_id: number
    issue_date?: string
    expiry_date?: string
    file: File
  }): Promise<void> => {
    const form = new FormData()
    form.append('vehicle_id', String(payload.vehicle_id))
    form.append('vehicle_document_type_id', String(payload.vehicle_document_type_id))
    if (payload.issue_date) form.append('issue_date', payload.issue_date)
    if (payload.expiry_date) form.append('expiry_date', payload.expiry_date)
    form.append('file', payload.file)
    const res = await fetch(`${BASE}/vehicle-documents/`, { method: 'POST', body: form })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail ?? 'Error al subir el archivo')
    }
  },
  editVehicleDocument: async (docId: number, payload: {
    issue_date?: string
    expiry_date?: string
    custom_alert_days?: number | null
    file?: File
  }): Promise<void> => {
    const form = new FormData()
    if (payload.issue_date) form.append('issue_date', payload.issue_date)
    if (payload.expiry_date) form.append('expiry_date', payload.expiry_date)
    if (payload.file) form.append('file', payload.file)
    if (payload.custom_alert_days !== undefined)
      form.append('custom_alert_days', String(payload.custom_alert_days ?? 0))
    const res = await fetch(`${BASE}/vehicle-documents/${docId}`, { method: 'PATCH', body: form })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail ?? 'Error al actualizar el documento')
    }
  },
  scanVehicleDocument: async (file: File): Promise<VehicleAIScanResult> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/vehicle-documents/ai-scan`, { method: 'POST', body: form })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail ?? 'Error al analizar el documento')
    }
    return res.json() as Promise<VehicleAIScanResult>
  },

  reviewVehicleDocument: (docId: number, payload: { status: 'approved' | 'rejected'; reviewer_notes?: string }): Promise<void> =>
    patch<void>(`/vehicle-documents/${docId}/review`, payload),
  getVehicleDocumentViewUrl: (docId: number) => `${BASE}/vehicle-documents/${docId}/view`,
  getVehicleDocumentDownloadUrl: (docId: number) => `${BASE}/vehicle-documents/${docId}/download`,

  // Vehicle maintenance
  getVehicleMaintenance: (vehicleId: number) =>
    get<CreateVehicleMaintenancePayload[]>(`/vehicle-maintenance/?vehicle_id=${vehicleId}`),
  createVehicleMaintenance: (payload: CreateVehicleMaintenancePayload) =>
    post<unknown>('/vehicle-maintenance/', payload),
  updateVehicleMaintenance: (id: number, payload: Partial<CreateVehicleMaintenancePayload & { is_active: boolean; last_service_date?: string; last_service_meter?: number }>) =>
    patch<unknown>(`/vehicle-maintenance/${id}`, payload),
  deleteVehicleMaintenance: (id: number) => del(`/vehicle-maintenance/${id}`),

  // Vehicle accreditation
  getVehiclesGlobalStatus: (activeOnly = true) =>
    get<VehicleGlobalStatus[]>(`/vehicle-accreditation/global-status?active_only=${activeOnly}`),
  getVehicleFullProfile: (vehicleId: number) =>
    get<VehicleFullProfile>(`/vehicle-accreditation/${vehicleId}`),

  // Documents
  uploadDocument: async (payload: {
    worker_id: number
    project_id?: number
    document_type_id: number
    issue_date?: string
    expiry_date?: string
    file: File
  }): Promise<void> => {
    const form = new FormData()
    form.append('worker_id', String(payload.worker_id))
    if (payload.project_id != null) form.append('project_id', String(payload.project_id))
    form.append('document_type_id', String(payload.document_type_id))
    if (payload.issue_date) form.append('issue_date', payload.issue_date)
    if (payload.expiry_date) form.append('expiry_date', payload.expiry_date)
    form.append('file', payload.file)
    const res = await fetch(`${BASE}/worker-documents/`, { method: 'POST', body: form })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw Object.assign(new Error(err?.detail ?? 'Error al subir el archivo'), { httpStatus: res.status })
    }
  },

  archiveWorkerDocument: async (docId: number): Promise<void> => {
    const res = await fetch(`${BASE}/worker-documents/${docId}/archive`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail ?? 'Error al archivar el documento')
    }
  },

  scanWorkerDocument: async (file: File, validityDays?: number | null): Promise<import('@/lib/types').WorkerAIScanResult> => {
    const form = new FormData()
    form.append('file', file)
    if (validityDays != null) form.append('validity_days', String(validityDays))
    const res = await fetch(`${BASE}/worker-documents/ai-scan`, { method: 'POST', body: form })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail ?? 'Error al analizar el documento')
    }
    return res.json()
  },
}
