export type WorkLocation = 'Planta' | 'Obra'

export interface Worker {
  id: number
  first_name: string
  last_name: string
  dni: string
  email: string | null
  phone: string | null
  work_location: WorkLocation
  is_active: boolean
  meets_base_requirements?: boolean | null
}

export interface Project {
  id: number
  name: string
  description: string | null
  is_active: boolean
}

export type TrafficLight = 'green' | 'yellow' | 'red'
export type DocCheckStatus = 'ok' | 'expiring_soon' | 'expired' | 'missing' | 'pending_review'

export interface DocumentCategory {
  id: number
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface DocumentType {
  id: number
  name: string
  description: string | null
  category_id: number | null
  category: DocumentCategory | null
  validity_days: number | null
  is_global_base_requirement: boolean
  is_active: boolean
  ai_validation_enabled: boolean
  alert_percentage_override: number | null
  is_achs: boolean
  achs_category: 'EXAMEN' | 'CURSO' | null
  created_at: string
  updated_at: string
}

export interface ProjectRequirement {
  id: number
  project_id: number
  document_type_id: number
  is_mandatory: boolean
  document_type: DocumentType
}

export interface CreateDocumentCategoryPayload {
  name: string
  description?: string
}

export interface CreateDocumentTypePayload {
  name: string
  description?: string
  category_id?: number | null
  validity_days?: number
  is_global_base_requirement?: boolean
  ai_validation_enabled?: boolean
  alert_percentage_override?: number | null
  is_achs?: boolean
  achs_category?: 'EXAMEN' | 'CURSO' | null
}

export interface CreateProjectPayload {
  name: string
  description?: string
}

export interface DocumentCheck {
  document_type_id: number
  document_type_name: string
  category: string
  is_mandatory: boolean
  is_global: boolean
  check_status: DocCheckStatus
  worker_document_id: number | null
  expiry_date: string | null
  days_until_expiry: number | null
}

export interface AccreditationStatus {
  worker_id: number
  project_id: number
  traffic_light: TrafficLight
  summary: string
  documents: DocumentCheck[]
  evaluated_at: string
}

export interface WorkerEntry {
  worker: Worker
  accreditation: AccreditationStatus | null
  loading: boolean
  error: boolean
}

// ── Worker full profile ───────────────────────────────────────────────────

export interface GlobalRequirementCheck {
  document_type_id: number
  document_type_name: string
  category: string
  validity_days: number | null
  check_status: DocCheckStatus
  worker_document_id: number | null
  expiry_date: string | null
  days_until_expiry: number | null
  custom_alert_percentage: number | null
  is_achs: boolean
  achs_category: 'EXAMEN' | 'CURSO' | null
}

export interface ProjectSpecificCheck {
  document_type_id: number
  document_type_name: string
  category: string
  is_mandatory: boolean
  check_status: DocCheckStatus
  worker_document_id: number | null
  expiry_date: string | null
  days_until_expiry: number | null
  custom_alert_percentage: number | null
}

export interface AssignedProjectProfile {
  project_id: number
  project_name: string
  project_description: string | null
  traffic_light: TrafficLight
  project_specific_requirements: ProjectSpecificCheck[]
}

export interface ArchivedProjectDoc {
  document_type_id: number
  document_type_name: string
  category: string
  worker_document_id: number | null
  expiry_date: string | null
}

export interface ArchivedProjectProfile {
  project_id: number
  project_name: string
  project_description: string | null
  documents: ArchivedProjectDoc[]
}

export interface WorkerFullProfile {
  worker_id: number
  first_name: string
  last_name: string
  dni: string
  email: string | null
  phone: string | null
  is_active: boolean
  global_traffic_light: TrafficLight | null
  global_requirements: GlobalRequirementCheck[]
  assigned_projects: AssignedProjectProfile[]
  archived_projects: ArchivedProjectProfile[]
}

// ── Global status ─────────────────────────────────────────────────────────
export interface ProjectStatus {
  project_id: number
  project_name: string
  traffic_light: TrafficLight
}

export interface WorkerGlobalStatus {
  worker_id: number
  first_name: string
  last_name: string
  dni: string
  email: string | null
  phone: string | null
  work_location: WorkLocation
  is_active: boolean
  assigned_projects: number
  global_traffic_light: TrafficLight | null
  project_statuses: ProjectStatus[]
  global_status: TrafficLight
  achs_status: TrafficLight | null
  project_status: TrafficLight | null
}

// ── System settings ───────────────────────────────────────────────────────
export interface AlertSettings {
  global_alert_percentage: number
}

// ── Reports ───────────────────────────────────────────────────────────────
export interface ExpiringDocumentItem {
  worker_document_id: number
  worker_id: number
  worker_name: string
  worker_dni: string
  document_type_id: number
  document_type_name: string
  category: string
  project_id: number | null
  project_name: string | null
  expiry_date: string
  days_until_expiry: number
  status: 'pending' | 'approved'
}

// ── Fleet & Machinery ─────────────────────────────────────────────────────

export interface Vehicle {
  id: number
  type: string
  brand: string
  model: string
  year: number | null
  engine_number: string | null
  vin_chassis: string | null
  owners: string | null
  municipality: string | null
  license_plate: string
  insurance_company: string | null
  insurance_policy_number: string | null
  tag_id: string | null
  gps_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VehicleDocumentType {
  id: number
  name: string
  description: string | null
  validity_days: number | null
  is_active: boolean
  is_required_base: boolean
  ai_validation_enabled: boolean
  alert_days_override: number | null
  created_at: string
  updated_at: string
}


export interface VehicleDocumentCheck {
  vehicle_document_type_id: number
  vehicle_document_type_name: string
  check_status: DocCheckStatus
  vehicle_document_id: number | null
  expiry_date: string | null
  days_until_expiry: number | null
  custom_alert_days: number | null
}

export interface VehicleMaintenanceCheck {
  vehicle_maintenance_id: number
  maintenance_program: string
  measurement_unit: 'km' | 'horas'
  maintenance_status: TrafficLight
  usage_remaining: number | null
  next_service_meter: number
  current_meter: number
  last_service_meter: number | null
}

export interface VehicleFullProfile {
  vehicle_id: number
  type: string
  brand: string
  model: string
  year: number | null
  engine_number: string | null
  vin_chassis: string | null
  owners: string | null
  municipality: string | null
  license_plate: string
  insurance_company: string | null
  insurance_policy_number: string | null
  tag_id: string | null
  gps_id: string | null
  is_active: boolean
  required_doc_traffic_light: TrafficLight | null
  additional_doc_traffic_light: TrafficLight | null
  doc_traffic_light: TrafficLight | null
  maintenance_traffic_light: TrafficLight | null
  global_traffic_light: TrafficLight | null
  required_document_checks: VehicleDocumentCheck[]
  additional_document_checks: VehicleDocumentCheck[]
  maintenance_checks: VehicleMaintenanceCheck[]
}

export interface VehicleGlobalStatus {
  vehicle_id: number
  license_plate: string
  type: string
  brand: string
  model: string
  year: number | null
  is_active: boolean
  global_traffic_light: TrafficLight | null
}

export interface CreateVehiclePayload {
  type: string
  brand: string
  model: string
  year?: number
  engine_number?: string
  vin_chassis?: string
  owners?: string
  municipality?: string
  license_plate: string
  insurance_company?: string
  insurance_policy_number?: string
  tag_id?: string
  gps_id?: string
}

export interface VehicleAlertSettings {
  vehicle_global_alert_days: number
}

// ── Validación por IA (tipo + identidad): silencio / aviso / confirmación ──────
export type MatchVerdict = 'match' | 'likely_match' | 'mismatch' | 'not_found'

export interface ValidationWarning {
  dimension: 'type' | 'identity'
  level: 'info'
  reasoning: string
}

export interface ValidationConflictDetail {
  expected?: string | null
  detected?: string | null
  expected_name?: string | null
  detected_name?: string | null
  reasoning?: string | null
}

export interface ValidationConflict {
  message?: string
  type?: ValidationConflictDetail
  identity?: ValidationConflictDetail
  retryable: boolean
  override_field: string
}

export interface VehicleAIScanResult {
  issue_date: string | null
  expiry_date: string | null
  document_type_detected: string | null
  ai_validation_enabled?: boolean
  match_confidence?: MatchVerdict
  type_reasoning?: string | null
  detected_document_name?: string | null
  validation_action?: 'silent' | 'warn' | 'conflict'
  warnings?: ValidationWarning[]
  conflict?: ValidationConflict | null
}

export interface WorkerAIScanResult {
  issue_date: string | null
  expiry_date: string | null
  expiry_computed: boolean
  document_type_detected: string | null
  ai_validation_enabled?: boolean
  match_confidence?: MatchVerdict
  type_reasoning?: string | null
  person_match?: MatchVerdict
  person_name_detected?: string | null
  identity_reasoning?: string | null
  validation_action?: 'silent' | 'warn' | 'conflict'
  warnings?: ValidationWarning[]
  conflict?: ValidationConflict | null
}

export interface CreateVehicleDocumentTypePayload {
  name: string
  description?: string
  validity_days?: number
  alert_days_override?: number | null
  is_required_base?: boolean
  ai_validation_enabled?: boolean
}



export interface CreateVehicleMaintenancePayload {
  vehicle_id: number
  maintenance_program: string
  measurement_unit: 'km' | 'horas'
  last_service_date?: string
  last_service_meter?: number
  next_service_meter: number
  current_meter?: number
}

// ── Create worker form ────────────────────────────────────────────────────
export interface CreateWorkerPayload {
  first_name: string
  last_name: string
  dni: string
  work_location: WorkLocation
  email?: string
  phone?: string
}

// ── Bulk upload ───────────────────────────────────────────────────────────
export interface BulkUploadError {
  row: number
  dni: string | null
  error: string
}

export interface BulkUploadResult {
  total_processed: number
  created: number
  errors: BulkUploadError[]
}

// ── Admin users ───────────────────────────────────────────────────────────
export interface AdminPermission {
  module: string
  level: string
}

export interface AdminUser {
  id: number
  email: string
  full_name: string | null
  is_admin: boolean
  is_active: boolean
  last_login_at: string | null
  permissions: AdminPermission[]
}

export interface AdminUserPatch {
  full_name?: string
  is_active?: boolean
  is_admin?: boolean
}

export interface AdminPermissionItem {
  module: string
  level: string
}

export interface AdminUserCreate {
  email: string
  full_name?: string | null
  password: string
  is_admin: boolean
  permissions?: AdminPermissionItem[]
}
