import type {
  AccreditationStatus,
  AdminPermissionItem,
  AdminUser,
  AdminUserCreate,
  AdminUserPatch,
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
  VehicleAlertSettings,
  VehicleDocumentType,
  VehicleFullProfile,
  VehicleGlobalStatus,
  Worker,
  WorkerFullProfile,
  WorkerGlobalStatus,
} from './types'
import { clearSession } from './session'
import { tokenStore } from './token-store'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = tokenStore.get()
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra }
}

function handle401(res: Response) {
  if (res.status === 401 && typeof window !== 'undefined') {
    // Token inválido/expirado: limpiamos la sesión (cookie httpOnly + memoria) y
    // volvemos al login. clearSession es best-effort; no bloquea el redirect.
    tokenStore.set(null)
    void clearSession()
    window.location.href = '/login'
  }
}

/**
 * Convierte el campo `detail` de un error de FastAPI en un mensaje legible.
 * FastAPI lo devuelve como string (HTTPException) o como lista de objetos de
 * validación (422: `[{loc, msg, type}, ...]`). Sin esto, una lista se renderiza
 * como "[object Object]" al pasarla a `new Error(...)`.
 */
export function detailToMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) =>
        d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : null,
      )
      .filter((m): m is string => Boolean(m))
    if (msgs.length) return msgs.join('; ')
  }
  return fallback
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store', headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

/** GET paginado: devuelve la lista plana + el total (header X-Total-Count). */
export interface Paged<T> {
  items: T[]
  total: number
}
async function getPaged<T>(path: string): Promise<Paged<T>> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store', headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const items = (await res.json()) as T[]
  const header = res.headers.get('X-Total-Count')
  const total = header != null ? Number(header) : items.length
  return { items, total }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  handle401(res)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(detailToMessage(err?.detail, `${res.status} ${res.statusText}`))
  }
  return res.json() as Promise<T>
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  handle401(res)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(detailToMessage(err?.detail, `${res.status} ${res.statusText}`))
  }
  return res.json() as Promise<T>
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  handle401(res)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(detailToMessage((err as { detail?: unknown })?.detail, `${res.status} ${res.statusText}`))
  }
  return res.json() as Promise<T>
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() })
  handle401(res)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(detailToMessage(err?.detail, `${res.status} ${res.statusText}`))
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
    // Selector/dropdown: pedir hasta el tope permitido para no truncar.
    q.set('limit', '500')
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
    const res = await fetch(`${BASE}/document-types/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw Object.assign(new Error(detailToMessage(err?.detail, 'Error al eliminar')), { httpStatus: res.status })
    }
  },

  // Accreditation
  getAccreditation: (workerId: number, projectId: number) =>
    get<AccreditationStatus>(`/accreditation/${workerId}/${projectId}`),
  getWorkersGlobalStatus: (filters?: {
    status?: 'active' | 'archived'
    location?: 'planta' | 'obra'
    limit?: number
    offset?: number
  }): Promise<Paged<WorkerGlobalStatus>> => {
    const q = new URLSearchParams()
    if (filters?.status) q.set('status', filters.status)
    if (filters?.location) q.set('location', filters.location)
    if (filters?.limit != null) q.set('limit', String(filters.limit))
    if (filters?.offset != null) q.set('offset', String(filters.offset))
    return getPaged<WorkerGlobalStatus>(`/accreditation/workers/global-status?${q}`)
  },

  // Document URLs (rutas de los endpoints de archivo protegidos)
  getDocumentDownloadUrl: (docId: number) =>
    `${BASE}/worker-documents/${docId}/download`,
  getDocumentViewUrl: (docId: number) =>
    `${BASE}/worker-documents/${docId}/view`,

  // Los endpoints /view y /download exigen `Authorization: Bearer`, que una
  // navegación directa (iframe src / <a href> / nueva pestaña) NO adjunta. Por eso
  // se descarga el archivo con fetch autenticado y se entrega como object URL (blob).
  fetchFileBlobUrl: async (url: string): Promise<string> => {
    const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' })
    handle401(res)
    if (!res.ok) throw new Error(`No se pudo cargar el archivo (${res.status}).`)
    return URL.createObjectURL(await res.blob())
  },

  // Descarga autenticada: fetch + blob + click en un <a download> temporal.
  // Prefiere el nombre original del header Content-Disposition (expuesto por CORS).
  downloadFile: async (url: string, fallbackName: string): Promise<void> => {
    const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' })
    handle401(res)
    if (!res.ok) throw new Error(`No se pudo descargar el archivo (${res.status}).`)
    let filename = fallbackName
    const cd = res.headers.get('Content-Disposition')
    const match = cd && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
    if (match) filename = decodeURIComponent(match[1])
    const objectUrl = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
  },

  // Bulk ZIP download of a worker's documents (global requirements or one project)
  downloadWorkerDocumentsZip: async (
    workerId: number,
    scope: { kind: 'global' } | { kind: 'project'; projectId: number }
  ): Promise<void> => {
    const params = new URLSearchParams({ scope: scope.kind })
    if (scope.kind === 'project') params.set('project_id', String(scope.projectId))
    const res = await fetch(`${BASE}/workers/${workerId}/documents/download-zip?${params}`, { headers: authHeaders() })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(detailToMessage(err?.detail, 'Error al descargar el ZIP'))
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
    const res = await fetch(`${BASE}/workers/bulk-upload`, { method: 'POST', body: form, headers: authHeaders() })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(detailToMessage(err?.detail, `${res.status} ${res.statusText}`))
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
    // DocumentStatus del backend usa valores en MAYÚSCULAS (APPROVED/REJECTED);
    // el estado del formulario es minúscula, se normaliza aquí para evitar el 422.
    patch<void>(`/worker-documents/${docId}/review`, {
      status: payload.status.toUpperCase(),
      reviewer_notes: payload.reviewer_notes,
    }),

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
    const res = await fetch(`${BASE}/worker-documents/${docId}`, { method: 'PATCH', body: form, headers: authHeaders() })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw Object.assign(new Error(detailToMessage(err?.detail, 'Error al actualizar el documento')), { httpStatus: res.status })
    }
  },

  // ── Fleet ──────────────────────────────────────────────────────────────

  // Vehicles
  getVehicles: (activeOnly = true) =>
    get<Vehicle[]>(`/vehicles/?active_only=${activeOnly}&limit=500`),
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
    const res = await fetch(`${BASE}/vehicle-documents/`, { method: 'POST', body: form, headers: authHeaders() })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw Object.assign(
        new Error(detailToMessage(err?.detail, 'Error al subir el archivo')),
        { httpStatus: res.status, detail: err?.detail },
      )
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
    const res = await fetch(`${BASE}/vehicle-documents/${docId}`, { method: 'PATCH', body: form, headers: authHeaders() })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw Object.assign(
        new Error(detailToMessage(err?.detail, 'Error al actualizar el documento')),
        { httpStatus: res.status, detail: err?.detail },
      )
    }
  },
  reviewVehicleDocument: (docId: number, payload: { status: 'approved' | 'rejected'; reviewer_notes?: string }): Promise<void> =>
    // Igual que reviewDocument: DocumentStatus del backend es MAYÚSCULAS.
    patch<void>(`/vehicle-documents/${docId}/review`, {
      status: payload.status.toUpperCase(),
      reviewer_notes: payload.reviewer_notes,
    }),
  getVehicleDocumentViewUrl: (docId: number) => `${BASE}/vehicle-documents/${docId}/view`,
  getVehicleDocumentDownloadUrl: (docId: number) => `${BASE}/vehicle-documents/${docId}/download`,

  // Vehicle maintenance
  getVehicleMaintenance: (vehicleId: number) =>
    get<CreateVehicleMaintenancePayload[]>(`/vehicle-maintenance/?vehicle_id=${vehicleId}&limit=500`),
  createVehicleMaintenance: (payload: CreateVehicleMaintenancePayload) =>
    post<unknown>('/vehicle-maintenance/', payload),
  updateVehicleMaintenance: (id: number, payload: Partial<CreateVehicleMaintenancePayload & { is_active: boolean; last_service_date?: string; last_service_meter?: number }>) =>
    patch<unknown>(`/vehicle-maintenance/${id}`, payload),
  deleteVehicleMaintenance: (id: number) => del(`/vehicle-maintenance/${id}`),

  // Vehicle accreditation
  getVehiclesGlobalStatus: (
    activeOnly = true,
    opts?: { limit?: number; offset?: number },
  ): Promise<Paged<VehicleGlobalStatus>> => {
    const q = new URLSearchParams()
    q.set('active_only', String(activeOnly))
    if (opts?.limit != null) q.set('limit', String(opts.limit))
    if (opts?.offset != null) q.set('offset', String(opts.offset))
    return getPaged<VehicleGlobalStatus>(`/vehicle-accreditation/global-status?${q}`)
  },
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
    const res = await fetch(`${BASE}/worker-documents/`, { method: 'POST', body: form, headers: authHeaders() })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      // Adjunta el detail crudo (objeto en el 409 de validación) para que el form
      // abra el diálogo de confirmación con los mensajes específicos.
      throw Object.assign(
        new Error(detailToMessage(err?.detail, 'Error al subir el archivo')),
        { httpStatus: res.status, detail: err?.detail },
      )
    }
  },

  archiveWorkerDocument: async (docId: number): Promise<void> => {
    const res = await fetch(`${BASE}/worker-documents/${docId}/archive`, { method: 'POST', headers: authHeaders() })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(detailToMessage(err?.detail, 'Error al archivar el documento'))
    }
  },

  // Admin — user management
  getAdminUsers: () => get<AdminUser[]>('/admin/users'),
  createAdminUser: (body: AdminUserCreate) => post<AdminUser>('/admin/users', body),
  patchAdminUser: (id: number, body: AdminUserPatch) =>
    patch<AdminUser>(`/admin/users/${id}`, body),
  resetAdminUserPassword: (id: number, newPassword: string) =>
    post<AdminUser>(`/admin/users/${id}/reset-password`, { new_password: newPassword }),
  deleteAdminUser: (id: number) => del(`/admin/users/${id}`),
  replaceUserPermissions: (id: number, permissions: AdminPermissionItem[]) =>
    put<AdminUser>(`/admin/users/${id}/permissions`, { permissions }),
}
