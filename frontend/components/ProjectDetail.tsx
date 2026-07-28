'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type {
  AccreditationStatus,
  DocumentType,
  Project,
  ProjectRequirement,
  Worker,
} from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from './TrafficLightBadge'


// ── Assigned worker row ────────────────────────────────────────────────────
function AssignedWorkerRow({
  worker,
  projectId,
  onUnassign,
}: {
  worker: Worker
  projectId: number
  onUnassign: () => void
}) {
  const [accreditation, setAccreditation] = useState<AccreditationStatus | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    api.getAccreditation(worker.id, projectId)
      .then(setAccreditation)
      .catch(() => { /* silently ignore */ })
  }, [worker.id, projectId])

  const handleUnassign = async () => {
    setRemoving(true)
    try {
      await api.unassignWorkerFromProject(worker.id, projectId)
      onUnassign()
    } catch { /* silently ignore */ } finally {
      setRemoving(false)
    }
  }

  return (
    <tr className="hover:bg-slate-50 transition-colors group">
      <td className="px-5 py-3.5">
        <Link
          href={`/trabajadores/${worker.id}`}
          className="font-semibold text-slate-800 hover:text-blue-600 transition-colors"
        >
          {worker.first_name} {worker.last_name}
        </Link>
        {worker.email && (
          <p className="text-xs text-slate-400 mt-0.5">{worker.email}</p>
        )}
      </td>
      <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{worker.dni}</td>
      <td className="px-5 py-3.5 text-center">
        {accreditation ? (
          <TrafficLightBadge status={accreditation.traffic_light} showLabel />
        ) : (
          <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-blue-400 rounded-full animate-spin" />
        )}
      </td>
      <td className="px-5 py-3.5 text-right">
        <button
          onClick={handleUnassign}
          disabled={removing}
          className="text-xs font-semibold text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
        >
          {removing ? 'Quitando…' : 'Quitar'}
        </button>
      </td>
    </tr>
  )
}

// ── Worker search + assignment panel ──────────────────────────────────────
function AssignWorkerPanel({
  projectId,
  assignedWorkerIds,
  onAssigned,
}: {
  projectId: number
  assignedWorkerIds: Set<number>
  onAssigned: () => void
}) {
  const [allWorkers, setAllWorkers] = useState<Worker[]>([])
  const [search, setSearch] = useState('')
  const [assigning, setAssigning] = useState<number | null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [toastError, setToastError] = useState<string | null>(null)

  useEffect(() => {
    if (showPanel && allWorkers.length === 0) {
      api.getWorkers().then(setAllWorkers).catch(() => { })
    }
  }, [showPanel, allWorkers.length])

  useEffect(() => {
    if (!toastError) return
    const t = setTimeout(() => setToastError(null), 6000)
    return () => clearTimeout(t)
  }, [toastError])

  const available = allWorkers.filter((w) => {
    if (assignedWorkerIds.has(w.id)) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      `${w.first_name} ${w.last_name}`.toLowerCase().includes(q) ||
      w.dni.toLowerCase().includes(q)
    )
  })

  const handleAssign = async (worker: Worker) => {
    if (worker.meets_base_requirements === false) {
      setToastError(
        `No se puede asignar a ${worker.first_name} ${worker.last_name}. Mantiene documentos obligatorios pendientes o vencidos.`
      )
      return
    }
    setAssigning(worker.id)
    try {
      await api.assignWorkerToProject(worker.id, projectId)
      onAssigned()
    } catch (e) {
      setToastError(e instanceof Error ? e.message : 'No se pudo asignar al trabajador.')
    } finally {
      setAssigning(null)
    }
  }

  if (!showPanel) {
    return (
      <button
        onClick={() => setShowPanel(true)}
        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Asignar Empleado
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
      {toastError && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl bg-red-600 text-white transition-opacity">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm font-medium flex-1">{toastError}</p>
          <button onClick={() => setToastError(null)} className="shrink-0 text-white/80 hover:text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 text-sm">Asignar Empleado</h3>
        <button onClick={() => setShowPanel(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-5 pt-4 pb-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre o DNI…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Worker list */}
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
        {available.length === 0 ? (
          <p className="px-5 py-8 text-sm text-center text-slate-400">
            {search ? 'No se encontraron empleados.' : 'Todos los empleados ya están asignados.'}
          </p>
        ) : (
          available.map((w) => {
            const blocked = w.meets_base_requirements === false
            return (
              <div
                key={w.id}
                className={`flex items-center justify-between px-5 py-3 hover:bg-slate-50 ${blocked ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {blocked && (
                    <span title="No cumple los requisitos base obligatorios" className="shrink-0 text-amber-500">
                      ⚠️
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${blocked ? 'text-slate-400' : 'text-slate-800'}`}>
                      {w.first_name} {w.last_name}
                    </p>
                    <p className={`text-xs font-mono ${blocked ? 'text-slate-400' : 'text-slate-500'}`}>{w.dni}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleAssign(w)}
                  disabled={assigning === w.id || blocked}
                  title={blocked ? 'No cumple los requisitos base obligatorios' : undefined}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-900 transition-colors"
                >
                  {assigning === w.id ? 'Asignando…' : blocked ? 'Bloqueado' : 'Asignar'}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Manage requirements panel ─────────────────────────────────────────────
function ManageRequirementsPanel({
  projectId,
  requirements,
  onChanged,
}: {
  projectId: number
  requirements: ProjectRequirement[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [allDocTypes, setAllDocTypes] = useState<DocumentType[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && allDocTypes.length === 0) {
      api.getDocumentTypes()
        .then((dts) => setAllDocTypes(dts.filter((d) => !d.is_global_base_requirement && d.is_active)))
        .catch(() => {})
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open, allDocTypes.length])

  const assignedIds = new Set(requirements.map((r) => r.document_type_id))
  const reqByDtId = Object.fromEntries(requirements.map((r) => [r.document_type_id, r]))

  const filtered = allDocTypes.filter((dt) => {
    if (!search) return true
    return dt.name.toLowerCase().includes(search.toLowerCase()) ||
      (dt.category?.name ?? '').toLowerCase().includes(search.toLowerCase())
  })

  const handleToggle = async (dt: DocumentType, currentlyAssigned: boolean) => {
    setBusy(dt.id)
    try {
      if (currentlyAssigned) {
        await api.removeProjectRequirement(projectId, dt.id)
      } else {
        await api.addProjectRequirement(projectId, dt.id, true)
      }
      onChanged()
    } catch { /* ignore */ } finally {
      setBusy(null)
    }
  }

  const handleToggleMandatory = async (dt: DocumentType, currentlyMandatory: boolean) => {
    setBusy(dt.id)
    try {
      await api.removeProjectRequirement(projectId, dt.id)
      await api.addProjectRequirement(projectId, dt.id, !currentlyMandatory)
      onChanged()
    } catch { /* ignore */ } finally {
      setBusy(null)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Gestionar requisitos
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 text-sm">Requisitos específicos del proyecto</h3>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-5 pt-3 pb-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar tipo de documento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">
          Los requisitos globales se aplican automáticamente a todos los proyectos y no aparecen aquí.
        </p>
      </div>

      <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-xs text-center text-slate-400">
            {search ? 'Sin resultados.' : 'No hay tipos de documento específicos creados.'}
          </p>
        ) : (
          filtered.map((dt) => {
            const assigned = assignedIds.has(dt.id)
            const req = reqByDtId[dt.id]
            const isBusy = busy === dt.id
            return (
              <div key={dt.id} className={`flex items-center gap-3 px-5 py-3 transition-colors ${assigned ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}>
                <button
                  onClick={() => handleToggle(dt, assigned)}
                  disabled={isBusy}
                  className={`w-4.5 h-4.5 shrink-0 flex items-center justify-center rounded border-2 transition-colors ${
                    assigned
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-300 hover:border-blue-400'
                  } disabled:opacity-40`}
                  style={{ width: 18, height: 18 }}
                >
                  {assigned && (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${assigned ? 'text-slate-800' : 'text-slate-600'}`}>
                    {dt.name}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {dt.category?.name ?? 'Sin categoría'}
                    {dt.validity_days && ` · ${dt.validity_days}d vigencia`}
                  </p>
                </div>
                {assigned && req && (
                  <button
                    onClick={() => handleToggleMandatory(dt, req.is_mandatory)}
                    disabled={isBusy}
                    className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors disabled:opacity-40 ${
                      req.is_mandatory
                        ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-700'
                        : 'bg-white text-slate-500 border-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {req.is_mandatory ? 'Obligatorio' : 'Opcional'}
                  </button>
                )}
                {isBusy && (
                  <span className="w-3.5 h-3.5 border-[1.5px] border-slate-300 border-t-blue-500 rounded-full animate-spin shrink-0" />
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Archive confirmation dialog ────────────────────────────────────────────
function ArchiveConfirmDialog({
  projectName,
  onConfirm,
  onCancel,
  archiving,
}: {
  projectName: string
  onConfirm: () => void
  onCancel: () => void
  archiving: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="text-base font-bold text-slate-900 mb-2">¿Archivar proyecto?</h3>
          <p className="text-sm text-slate-600 mb-1">
            El proyecto <strong>{projectName}</strong> quedará archivado y no aparecerá en el semáforo global de los empleados.
          </p>
          <p className="text-sm text-slate-500">
            Podrás restaurarlo en cualquier momento desde el panel de proyectos.
          </p>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={archiving}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {archiving ? 'Archivando…' : 'Archivar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete confirmation dialog ─────────────────────────────────────────────
function DeleteProjectConfirmDialog({
  projectName,
  onConfirm,
  onCancel,
  deleting,
}: {
  projectName: string
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}) {
  const [typed, setTyped] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-red-600 px-6 py-4">
          <h3 className="text-base font-bold text-white">Eliminar proyecto permanentemente</h3>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-slate-700">
            Esta acción <strong>no se puede deshacer</strong>. Se eliminará el proyecto junto con todas sus asignaciones y requisitos específicos.
          </p>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Escribe <span className="text-red-600 font-bold">{projectName}</span> para confirmar
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting || typed !== projectName}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ProjectDetail ─────────────────────────────────────────────────────
export function ProjectDetail({ projectId }: { projectId: number }) {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [requirements, setRequirements] = useState<ProjectRequirement[]>([])
  const [assignedWorkers, setAssignedWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    Promise.all([
      api.getProjects().then((ps) => ps.find((p) => p.id === projectId) ?? null),
      api.getProjectRequirements(projectId),
      api.getProjectWorkers(projectId),
    ])
      .then(([proj, reqs, workers]) => {
        setProject(proj)
        setRequirements(reqs)
        setAssignedWorkers(workers)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar el proyecto'))
      .finally(() => setLoading(false))
  }, [projectId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [proj, reqs, workers] = await Promise.all([
        api.getProjects().then((ps) => ps.find((p) => p.id === projectId) ?? null),
        api.getProjectRequirements(projectId),
        api.getProjectWorkers(projectId),
      ])
      setProject(proj)
      setRequirements(reqs)
      setAssignedWorkers(workers)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el proyecto')
    } finally {
      setLoading(false)
    }
  }

  const refreshWorkers = useCallback(async () => {
    try {
      const workers = await api.getProjectWorkers(projectId)
      setAssignedWorkers(workers)
    } catch { /* silently ignore */ }
  }, [projectId])

  const handleArchive = async () => {
    setArchiving(true)
    try {
      await api.archiveProject(projectId)
      router.push('/')
    } catch { /* silently ignore */ } finally {
      setArchiving(false)
      setShowArchiveDialog(false)
    }
  }

  const handleRestore = async () => {
    try {
      const updated = await api.restoreProject(projectId)
      setProject(updated)
    } catch { /* silently ignore */ }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.deleteProject(projectId)
      router.push('/')
    } catch { /* silently ignore */ } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="w-10 h-10 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Cargando proyecto…</p>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-sm mb-4">{error || 'Proyecto no encontrado'}</p>
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Volver</Link>
        </div>
      </div>
    )
  }

  const nonGlobalReqs = requirements.filter((r) => !r.document_type.is_global_base_requirement)
  const assignedWorkerIds = new Set(assignedWorkers.map((w) => w.id))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Volver al panel
        </Link>

        {/* ── Project header ─────────────────────────────────────────────── */}
        <div className="bg-slate-900 rounded-2xl px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <p className="text-slate-400 text-xs uppercase tracking-wider">Proyecto</p>
                {!project.is_active && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Archivado
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-white">{project.name}</h1>
              {project.description && (
                <p className="text-slate-400 text-sm mt-1">{project.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {project.is_active ? (
                <button
                  onClick={() => setShowArchiveDialog(true)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white/10 text-slate-300 hover:bg-amber-500/20 hover:text-amber-300 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  Archivar
                </button>
              ) : (
                <button
                  onClick={handleRestore}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white/10 text-slate-300 hover:bg-green-500/20 hover:text-green-300 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                  </svg>
                  Restaurar
                </button>
              )}
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white/10 text-slate-300 hover:bg-red-500/20 hover:text-red-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Eliminar
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <div className="bg-white/10 rounded-lg px-4 py-2 text-center">
              <p className="text-2xl font-bold text-white">{assignedWorkers.length}</p>
              <p className="text-xs text-slate-400">Empleados</p>
            </div>
            <div className="bg-white/10 rounded-lg px-4 py-2 text-center">
              <p className="text-2xl font-bold text-white">{nonGlobalReqs.length}</p>
              <p className="text-xs text-slate-400">Requisitos específicos</p>
            </div>
          </div>
        </div>

        {/* Archive confirmation dialog */}
        {showArchiveDialog && project && (
          <ArchiveConfirmDialog
            projectName={project.name}
            onConfirm={handleArchive}
            onCancel={() => setShowArchiveDialog(false)}
            archiving={archiving}
          />
        )}

        {/* Delete confirmation dialog */}
        {showDeleteDialog && project && (
          <DeleteProjectConfirmDialog
            projectName={project.name}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteDialog(false)}
            deleting={deleting}
          />
        )}

        {/* Archived banner */}
        {!project.is_active && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            <p className="text-sm text-amber-800">
              Este proyecto está archivado y no afecta el semáforo de los empleados.
            </p>
          </div>
        )}

        {/* ── Specific requirements ──────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
              Requisitos Específicos del Proyecto
            </h2>
            {project.is_active && (
              <ManageRequirementsPanel
                projectId={projectId}
                requirements={requirements}
                onChanged={loadData}
              />
            )}
          </div>

          {nonGlobalReqs.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-400 text-sm">
              Sin requisitos específicos. Los requisitos globales de la empresa se aplican automáticamente.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nonGlobalReqs.map((req) => (
                <span
                  key={req.id}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                    req.is_mandatory
                      ? 'bg-white border-slate-200 text-slate-700'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <span className="font-medium">{req.document_type.name}</span>
                  <span className="text-xs text-slate-400">
                    {req.document_type.category?.name ?? 'Sin categoría'}
                  </span>
                  {!req.is_mandatory && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                      Opcional
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ── Assigned workers ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
              Empleados Asignados ({assignedWorkers.length})
            </h2>
            {project.is_active && (
              <AssignWorkerPanel
                projectId={projectId}
                assignedWorkerIds={assignedWorkerIds}
                onAssigned={refreshWorkers}
              />
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {assignedWorkers.length === 0 ? (
              <div className="px-5 py-12 text-center text-slate-400 text-sm">
                Sin empleados asignados aún. Usa el botón para asignar el primero.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 font-semibold uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                    <th className="px-5 py-3 text-left">Empleado</th>
                    <th className="px-5 py-3 text-left">DNI</th>
                    <th className="px-5 py-3 text-center">Estado en este Proyecto</th>
                    <th className="px-5 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignedWorkers.map((w) => (
                    <AssignedWorkerRow
                      key={w.id}
                      worker={w}
                      projectId={projectId}
                      onUnassign={refreshWorkers}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {assignedWorkers.length > 0 && (
            <p className="text-xs text-slate-400 mt-2 text-center">
              El semáforo de cada empleado incluye los requisitos globales de la empresa y los específicos de este proyecto.
            </p>
          )}
        </section>

      </div>
    </div>
  )
}
