'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { WorkerFullProfile } from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from './TrafficLightBadge'
import { DocumentPreviewModal } from './DocumentPreviewModal'
import { ArchiveWorkerConfirmDialog } from './worker-profile/ArchiveWorkerConfirmDialog'
import { DeleteWorkerConfirmDialog } from './worker-profile/DeleteWorkerConfirmDialog'
import { DownloadZipButton } from './worker-profile/DownloadZipButton'
import { ReqRow } from './worker-profile/ReqRow'
import { ProjectCard } from './worker-profile/ProjectCard'
import { ArchivedProjectCard } from './worker-profile/ArchivedProjectCard'
import { usePermissions } from '@/lib/permissions'

export function WorkerProfile({ workerId }: { workerId: number }) {
  const router = useRouter()
  const [profile, setProfile] = useState<WorkerFullProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewDocId, setPreviewDocId] = useState<number | null>(null)
  const [previewLabel, setPreviewLabel] = useState('')
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<'docs' | 'achs'>('docs')
  const { canWrite } = usePermissions()

  const handleArchive = async () => {
    setArchiving(true)
    try {
      await api.archiveWorker(workerId)
      router.push('/')
    } catch { /* silently ignore */ } finally {
      setArchiving(false)
      setShowArchiveDialog(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.deleteWorker(workerId)
      router.push('/')
    } catch { /* silently ignore */ } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const handleRestore = async () => {
    try {
      const updated = await api.restoreWorker(workerId)
      setProfile((prev) => (prev ? { ...prev, is_active: updated.is_active } : prev))
    } catch { /* silently ignore */ }
  }

  const handlePreview = (docId: number, label: string) => {
    setPreviewLabel(label)
    setPreviewDocId(docId)
  }

  useEffect(() => {
    api.getWorkerFullProfile(workerId)
      .then(data => setProfile(data))
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar el perfil'))
      .finally(() => setLoading(false))
  }, [workerId])

  const loadProfile = async () => {
    try {
      const data = await api.getWorkerFullProfile(workerId)
      setProfile(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el perfil')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="w-10 h-10 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Cargando perfil…</p>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-sm mb-4">{error || 'Trabajador no encontrado'}</p>
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Volver</Link>
        </div>
      </div>
    )
  }

  const allProjectIds = profile.assigned_projects.map((p) => p.project_id)
  const initials = `${profile.first_name[0] ?? ''}${profile.last_name[0] ?? ''}`.toUpperCase()

  const globalBad = profile.global_requirements.filter(
    (r) => r.check_status === 'missing' || r.check_status === 'expired'
  ).length
  const globalWarn = profile.global_requirements.filter(
    (r) => r.check_status === 'expiring_soon'
  ).length

  const regularDocs = profile.global_requirements.filter((r) => !r.is_achs)
  const achsExams = profile.global_requirements.filter((r) => r.is_achs && r.achs_category === 'EXAMEN')
  const achsCourses = profile.global_requirements.filter((r) => r.is_achs && r.achs_category === 'CURSO')

  return (
    <div className="min-h-screen bg-slate-50">
      <DocumentPreviewModal
        docId={previewDocId}
        label={previewLabel}
        onClose={() => setPreviewDocId(null)}
      />
      {showArchiveDialog && (
        <ArchiveWorkerConfirmDialog
          workerName={`${profile.first_name} ${profile.last_name}`}
          onConfirm={handleArchive}
          onCancel={() => setShowArchiveDialog(false)}
          archiving={archiving}
        />
      )}
      {showDeleteDialog && (
        <DeleteWorkerConfirmDialog
          workerName={`${profile.first_name} ${profile.last_name}`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
          deleting={deleting}
        />
      )}
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Volver al directorio
        </Link>

        {/* ── Worker header ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-sm border border-slate-300 overflow-hidden">
          <div className="bg-white border-b border-slate-200 px-6 py-5 flex items-center gap-5">
            <div className="w-14 h-14 rounded-sm bg-[#003f7a] flex items-center justify-center shrink-0">
              <span className="text-white text-xl font-bold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-800 truncate">
                  {profile.first_name} {profile.last_name}
                </h1>
                {!profile.is_active && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-sm bg-amber-100 text-amber-700 border border-amber-200">
                    Archivado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 flex-wrap">
                <span className="text-slate-500 text-sm font-mono">DNI: {profile.dni}</span>
                {profile.email && <span className="text-slate-500 text-sm">{profile.email}</span>}
                {profile.phone && <span className="text-slate-500 text-sm">{profile.phone}</span>}
              </div>
            </div>
            {profile.global_traffic_light && (
              <TrafficLightBadge status={profile.global_traffic_light} size="lg" showLabel />
            )}
            {canWrite('trabajadores') && (
              <div className="flex items-center gap-2 shrink-0">
                {profile.is_active ? (
                  <button
                    onClick={() => setShowArchiveDialog(true)}
                    title="Archivar trabajador"
                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                    Archivar
                  </button>
                ) : (
                  <button
                    onClick={handleRestore}
                    title="Restaurar trabajador"
                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                    </svg>
                    Restaurar
                  </button>
                )}
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  title="Eliminar trabajador permanentemente"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-sm bg-white border border-slate-300 text-slate-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Eliminar
                </button>
              </div>
            )}
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
            <div className="px-5 py-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{profile.assigned_projects.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Proyectos</p>
            </div>
            <div className="px-5 py-4 text-center">
              <p className={`text-2xl font-bold ${globalBad > 0 ? 'text-red-600' : 'text-slate-800'}`}>{globalBad}</p>
              <p className="text-xs text-slate-500 mt-0.5">Doc. vencidos / faltantes</p>
            </div>
            <div className="px-5 py-4 text-center">
              <p className={`text-2xl font-bold ${globalWarn > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{globalWarn}</p>
              <p className="text-xs text-slate-500 mt-0.5">Por vencer</p>
            </div>
          </div>
        </div>

        {/* ── Tab strip ─────────────────────────────────────────────────── */}
        <div className="flex items-center border-b border-slate-200 bg-white">
          <button
            onClick={() => setActiveTab('docs')}
            className={`h-10 px-5 text-sm font-semibold border-b-2 transition-none whitespace-nowrap ${
              activeTab === 'docs'
                ? 'border-[#003f7a] text-[#003f7a] -mb-[1px]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            Documentos
          </button>
          <button
            onClick={() => setActiveTab('achs')}
            className={`h-10 px-5 text-sm font-semibold border-b-2 transition-none whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'achs'
                ? 'border-[#003f7a] text-[#003f7a] -mb-[1px]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-red-100 text-red-600">
              ACHS
            </span>
            Mutual
          </button>
        </div>

        {/* ── Documentos tab ─────────────────────────────────────────────── */}
        {activeTab === 'docs' && (
          <>
            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                <h2 className="text-base font-bold text-slate-800">Exámenes Obligatorios — Empresa</h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {regularDocs.length} requisitos
                </span>
                <div className="ml-auto">
                  <DownloadZipButton workerId={profile.worker_id} scope={{ kind: 'global' }} />
                </div>
              </div>
              {regularDocs.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
                  No hay requisitos globales configurados aún.
                </div>
              ) : (
                <div className="space-y-2">
                  {regularDocs.map((req) => (
                    <ReqRow
                      key={req.document_type_id}
                      dtId={req.document_type_id}
                      dtName={req.document_type_name}
                      category={req.category}
                      checkStatus={req.check_status}
                      validityDays={req.validity_days}
                      expiryDate={req.expiry_date}
                      daysUntilExpiry={req.days_until_expiry}
                      workerDocumentId={req.worker_document_id}
                      workerId={profile.worker_id}
                      projectIds={allProjectIds}
                      isGlobal
                      onRefresh={loadProfile}
                      onPreview={handlePreview}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-3 h-3 rounded-full bg-slate-400 shrink-0" />
                <h2 className="text-base font-bold text-slate-800">Proyectos Asignados</h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {profile.assigned_projects.length}
                </span>
              </div>
              {profile.assigned_projects.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
                  El trabajador no está asignado a ningún proyecto aún.
                </div>
              ) : (
                <div className="space-y-3">
                  {profile.assigned_projects.map((project) => (
                    <ProjectCard
                      key={project.project_id}
                      project={project}
                      workerId={profile.worker_id}
                      onRefresh={loadProfile}
                      onPreview={handlePreview}
                    />
                  ))}
                </div>
              )}
            </section>

            {profile.archived_projects.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0" />
                  <h2 className="text-base font-bold text-slate-500">Historial de Proyectos Archivados</h2>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {profile.archived_projects.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {profile.archived_projects.map((project) => (
                    <ArchivedProjectCard
                      key={project.project_id}
                      project={project}
                      onPreview={handlePreview}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── ACHS tab ───────────────────────────────────────────────────── */}
        {activeTab === 'achs' && (
          <div className="space-y-6">
            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                <h2 className="text-base font-bold text-slate-800">Exámenes Ocupacionales</h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {achsExams.length}
                </span>
                <div className="ml-auto">
                  <DownloadZipButton workerId={profile.worker_id} scope={{ kind: 'global' }} />
                </div>
              </div>
              {achsExams.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
                  No hay exámenes ocupacionales ACHS configurados. Crea un tipo de documento ACHS en{' '}
                  <strong>Configuración → Requisitos Globales</strong>.
                </div>
              ) : (
                <div className="space-y-2">
                  {achsExams.map((req) => (
                    <ReqRow
                      key={req.document_type_id}
                      dtId={req.document_type_id}
                      dtName={req.document_type_name}
                      category={req.category}
                      checkStatus={req.check_status}
                      validityDays={req.validity_days}
                      expiryDate={req.expiry_date}
                      daysUntilExpiry={req.days_until_expiry}
                      workerDocumentId={req.worker_document_id}
                      workerId={profile.worker_id}
                      projectIds={allProjectIds}
                      isGlobal
                      onRefresh={loadProfile}
                      onPreview={handlePreview}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                <h2 className="text-base font-bold text-slate-800">Cursos Realizados</h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {achsCourses.length}
                </span>
              </div>
              {achsCourses.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
                  No hay cursos ACHS configurados. Crea un tipo de documento ACHS en{' '}
                  <strong>Configuración → Requisitos Globales</strong>.
                </div>
              ) : (
                <div className="space-y-2">
                  {achsCourses.map((req) => (
                    <ReqRow
                      key={req.document_type_id}
                      dtId={req.document_type_id}
                      dtName={req.document_type_name}
                      category={req.category}
                      checkStatus={req.check_status}
                      validityDays={req.validity_days}
                      expiryDate={req.expiry_date}
                      daysUntilExpiry={req.days_until_expiry}
                      workerDocumentId={req.worker_document_id}
                      workerId={profile.worker_id}
                      projectIds={allProjectIds}
                      isGlobal
                      onRefresh={loadProfile}
                      onPreview={handlePreview}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

      </div>
    </div>
  )
}
