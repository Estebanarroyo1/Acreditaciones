'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { AccreditationStatus, Project, Worker, WorkerEntry } from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from './TrafficLightBadge'
import { WorkerDetailPanel } from './WorkerDetailPanel'
import { WorkersDirectory } from './WorkersDirectory'
import { BaseConfigView } from './BaseConfigView'
import { ReportsView } from './ReportsView'
import { FleetDirectory } from './FleetDirectory'
import { useNavContext } from './AppShell'

// ── Skeleton ───────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-slate-100">
      {[...Array(5)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3.5 bg-slate-100 rounded w-3/4" />
        </td>
      ))}
    </tr>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({
  label,
  count,
  accent,
}: {
  label: string
  count: number
  accent: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-md px-4 py-3 flex items-center gap-3 shadow-sm">
      <span className={`w-[3px] h-9 rounded-full shrink-0 ${accent}`} />
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-none">{count}</p>
        <p className="text-[11px] text-slate-500 mt-1 font-medium">{label}</p>
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────
function EmptyRow({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={5} className="px-4 py-12 text-center">
        <svg className="mx-auto w-8 h-8 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
        <p className="text-slate-400 text-sm">{message}</p>
      </td>
    </tr>
  )
}

// ── Assign worker panel ────────────────────────────────────────────────────
function AssignWorkerPanel({
  projectId,
  assignedIds,
  onAssigned,
  onClose,
}: {
  projectId: number
  assignedIds: Set<number>
  onAssigned: (worker: Worker) => void
  onClose: () => void
}) {
  const [allWorkers, setAllWorkers] = useState<Worker[]>([])
  const [search, setSearch] = useState('')
  const [assigning, setAssigning] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.getWorkers().then(setAllWorkers).catch(() => {})
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const available = allWorkers.filter((w) => {
    if (assignedIds.has(w.id)) return false
    if (!search) return true
    const q = search.toLowerCase()
    return `${w.first_name} ${w.last_name}`.toLowerCase().includes(q) || w.dni.toLowerCase().includes(q)
  })

  const handleAssign = async (worker: Worker) => {
    setAssigning(worker.id)
    try {
      await api.assignWorkerToProject(worker.id, projectId)
      onAssigned(worker)
    } catch { /* ignore */ } finally {
      setAssigning(null)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Asignar empleado</p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-3">
        <div className="relative mb-2">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar por nombre o DNI…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 rounded-md border border-slate-100">
          {available.length === 0 ? (
            <p className="px-3 py-6 text-xs text-center text-slate-400">
              {search ? 'Sin resultados.' : 'Todos los empleados ya están asignados.'}
            </p>
          ) : (
            available.map((w) => (
              <div key={w.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                <div>
                  <p className="text-xs font-semibold text-slate-800">{w.first_name} {w.last_name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{w.dni}</p>
                </div>
                <button
                  onClick={() => handleAssign(w)}
                  disabled={assigning === w.id}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {assigning === w.id ? (
                    <span className="w-3 h-3 border-[1.5px] border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  )}
                  Agregar
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export function Dashboard({ initialProjects }: { initialProjects: Project[] }) {
  const { view } = useNavContext()

  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [projectsTab, setProjectsTab] = useState<'active' | 'archived'>('active')
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(initialProjects[0] ?? null)
  const [entries, setEntries] = useState<WorkerEntry[]>([])
  const [loadingWorkers, setLoadingWorkers] = useState(!!initialProjects[0])

  const [panelOpen, setPanelOpen] = useState(false)
  const [panelWorker, setPanelWorker] = useState<Worker | null>(null)
  const [panelAccreditation, setPanelAccreditation] = useState<AccreditationStatus | null>(null)
  const [showAssignPanel, setShowAssignPanel] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)

  const reloadProjects = useCallback(async () => {
    try { setProjects(await api.getProjects()) } catch { /* ignore */ }
  }, [])

  const loadArchivedProjects = useCallback(async () => {
    setLoadingArchived(true)
    try { setArchivedProjects(await api.getArchivedProjects()) } catch { /* ignore */ }
    finally { setLoadingArchived(false) }
  }, [])

  const handleRestoreProject = async (projectId: number) => {
    try {
      await api.restoreProject(projectId)
      setArchivedProjects((prev) => prev.filter((p) => p.id !== projectId))
      await reloadProjects()
    } catch { /* ignore */ }
  }

  const [prevProjectId, setPrevProjectId] = useState<number | null>(selectedProject?.id ?? null)
  if ((selectedProject?.id ?? null) !== prevProjectId) {
    setPrevProjectId(selectedProject?.id ?? null)
    setLoadingWorkers(!!selectedProject)
    setEntries([])
  }

  useEffect(() => {
    if (!selectedProject) return
    api.getProjectWorkers(selectedProject.id)
      .then(async (workers) => {
        setEntries(workers.map((w) => ({ worker: w, accreditation: null, loading: true, error: false })))
        const results = await Promise.allSettled(workers.map((w) => api.getAccreditation(w.id, selectedProject.id)))
        setEntries(workers.map((w, i) => ({
          worker: w,
          accreditation: results[i].status === 'fulfilled' ? results[i].value : null,
          loading: false,
          error: results[i].status === 'rejected',
        })))
      })
      .catch(() => setEntries([]))
      .finally(() => setLoadingWorkers(false))
  }, [selectedProject])

  const refreshWorker = useCallback(async (workerId: number, projectId: number) => {
    try {
      const fresh = await api.getAccreditation(workerId, projectId)
      setEntries((prev) => prev.map((e) => e.worker.id === workerId ? { ...e, accreditation: fresh } : e))
      setPanelAccreditation(fresh)
    } catch { /* ignore */ }
  }, [])

  const openPanel = (entry: WorkerEntry) => {
    setPanelWorker(entry.worker)
    setPanelAccreditation(entry.accreditation)
    setPanelOpen(true)
  }

  const handleArchiveProject = useCallback(async () => {
    if (!selectedProject || !window.confirm(`¿Archivar el proyecto "${selectedProject.name}"? Dejará de afectar el semáforo de los empleados.`)) return
    setArchiving(true)
    try {
      await api.archiveProject(selectedProject.id)
      const updated = projects.filter((p) => p.id !== selectedProject.id)
      setProjects(updated)
      setSelectedProject(updated[0] ?? null)
      setEntries([])
      setShowAssignPanel(false)
    } catch { /* ignore */ } finally {
      setArchiving(false)
    }
  }, [selectedProject, projects])

  const handleDeleteProject = useCallback(async () => {
    if (!selectedProject || !window.confirm(`¿Eliminar permanentemente el proyecto "${selectedProject.name}"?\n\nEsta acción NO se puede deshacer.`)) return
    setDeletingProject(true)
    try {
      await api.deleteProject(selectedProject.id)
      const updated = projects.filter((p) => p.id !== selectedProject.id)
      setProjects(updated)
      setSelectedProject(updated[0] ?? null)
      setEntries([])
      setShowAssignPanel(false)
    } catch { /* ignore */ } finally {
      setDeletingProject(false)
    }
  }, [selectedProject, projects])

  const handleDeleteArchivedProject = async (projectId: number, projectName: string) => {
    if (!window.confirm(`¿Eliminar permanentemente el proyecto "${projectName}"?\n\nEsta acción NO se puede deshacer.`)) return
    try {
      await api.deleteProject(projectId)
      setArchivedProjects((prev) => prev.filter((p) => p.id !== projectId))
    } catch { /* ignore */ }
  }

  const handleWorkerAssigned = useCallback(async (worker: Worker) => {
    if (!selectedProject) return
    setShowAssignPanel(false)
    // Reload entries then open the document panel for the newly added worker
    setEntries((prev) => [
      ...prev,
      { worker, accreditation: null, loading: true, error: false },
    ])
    setPanelWorker(worker)
    setPanelAccreditation(null)
    setPanelOpen(true)
    try {
      const accreditation = await api.getAccreditation(worker.id, selectedProject.id)
      setEntries((prev) =>
        prev.map((e) => e.worker.id === worker.id ? { ...e, accreditation, loading: false } : e)
      )
      setPanelAccreditation(accreditation)
    } catch {
      setEntries((prev) =>
        prev.map((e) => e.worker.id === worker.id ? { ...e, loading: false, error: true } : e)
      )
    }
  }, [selectedProject])

  const greenCount  = entries.filter((e) => e.accreditation?.traffic_light === 'green').length
  const yellowCount = entries.filter((e) => e.accreditation?.traffic_light === 'yellow').length
  const redCount    = entries.filter((e) => e.accreditation?.traffic_light === 'red').length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Empleados ─────────────────────────────────────────────────── */}
      {view === 'workers' && (
        <div className="p-5">
          <WorkersDirectory projects={projects} />
        </div>
      )}

      {/* ── Configuración ─────────────────────────────────────────────── */}
      {view === 'config' && (
        <div className="p-5">
          <BaseConfigView onProjectsChanged={reloadProjects} />
        </div>
      )}

      {/* ── Flota ─────────────────────────────────────────────────────── */}
      {view === 'fleet' && (
        <div className="p-5">
          <FleetDirectory />
        </div>
      )}

      {/* ── Reportes ──────────────────────────────────────────────────── */}
      {view === 'reports' && <ReportsView />}

      {/* ── Proyectos ─────────────────────────────────────────────────── */}
      {view === 'projects' && (
        <div className="p-5 space-y-4">

          {/* Sub-tabs: Activos / Archivados */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md p-1 w-fit shadow-sm">
            {(['active', 'archived'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setProjectsTab(tab)
                  if (tab === 'archived') loadArchivedProjects()
                }}
                className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors ${
                  projectsTab === tab
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'active' ? `Activos (${projects.length})` : 'Archivados'}
              </button>
            ))}
          </div>

          {/* ── Archived list ───────────────────────────────────────────── */}
          {projectsTab === 'archived' && (
            <div className="space-y-2">
              {loadingArchived ? (
                <div className="bg-white border border-slate-200 rounded-md p-6 text-center text-sm text-slate-400 animate-pulse shadow-sm">
                  Cargando proyectos archivados…
                </div>
              ) : archivedProjects.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-300 rounded-md p-10 text-center text-slate-400 text-sm">
                  No hay proyectos archivados.
                </div>
              ) : (
                archivedProjects.map((p) => (
                  <div key={p.id} className="bg-white border border-slate-200 rounded-md px-4 py-3 flex items-center gap-4 shadow-sm">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                      ARCHIVADO
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                      {p.description && <p className="text-xs text-slate-500 truncate">{p.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/trabajadores/proyectos/${p.id}`} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
                        Ver detalle →
                      </Link>
                      <button
                        onClick={() => handleRestoreProject(p.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-700 border border-slate-700 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                        </svg>
                        Restaurar
                      </button>
                      <button
                        onClick={() => handleDeleteArchivedProject(p.id, p.name)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 border border-red-700 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Active projects ─────────────────────────────────────────── */}
          {projectsTab === 'active' && projects.length === 0 && (
            <div className="bg-white border border-dashed border-slate-300 rounded-md p-10 text-center text-sm text-slate-500">
              No hay proyectos activos. Crea uno desde Configuración.
            </div>
          )}

          {projectsTab === 'active' && projects.length > 0 && (
            <>
              {/* Project tab strip */}
              <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
                <div className="flex items-end gap-0 px-4 pt-3 border-b border-slate-200 overflow-x-auto">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedProject(p); setShowAssignPanel(false) }}
                      className={`px-4 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px ${
                        selectedProject?.id === p.id
                          ? 'border-blue-600 text-blue-700 bg-blue-50/60'
                          : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                  {/* Archive + Delete buttons aligned right in tab bar */}
                  {selectedProject && (
                    <div className="ml-auto mb-1 flex items-center gap-1 shrink-0">
                      <button
                        onClick={handleArchiveProject}
                        disabled={archiving}
                        title={`Archivar "${selectedProject.name}"`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-200 disabled:opacity-40 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        {archiving ? 'Archivando…' : 'Archivar'}
                      </button>
                      <button
                        onClick={handleDeleteProject}
                        disabled={deletingProject}
                        title={`Eliminar "${selectedProject.name}"`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 disabled:opacity-40 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        {deletingProject ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    </div>
                  )}
                </div>

                {selectedProject && (
                  <>
                    {/* Stats strip */}
                    <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                      <StatCard label="Total trabajadores" count={entries.length}  accent="bg-slate-400" />
                      <StatCard label="Acreditados"        count={greenCount}      accent="bg-green-500" />
                      <StatCard label="Por vencer"         count={yellowCount}     accent="bg-amber-400" />
                      <StatCard label="Irregulares"        count={redCount}        accent="bg-red-500"   />
                    </div>

                    {/* Table toolbar */}
                    <div className="px-4 py-2.5 border-b border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          Personal asignado
                        </span>
                        <div className="flex items-center gap-2">
                          {loadingWorkers && (
                            <span className="flex items-center gap-1.5 text-xs text-slate-400">
                              <span className="w-3 h-3 border-[1.5px] border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                              Cargando…
                            </span>
                          )}
                          <button
                            onClick={() => setShowAssignPanel((v) => !v)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                              showAssignPanel
                                ? 'bg-slate-100 text-slate-700 border-slate-300'
                                : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Agregar empleado
                          </button>
                        </div>
                      </div>
                      {showAssignPanel && selectedProject && (
                        <AssignWorkerPanel
                          projectId={selectedProject.id}
                          assignedIds={new Set(entries.map((e) => e.worker.id))}
                          onAssigned={handleWorkerAssigned}
                          onClose={() => setShowAssignPanel(false)}
                        />
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            {['Trabajador', 'DNI', 'Correo', 'Estado', ''].map((h) => (
                              <th
                                key={h}
                                className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {loadingWorkers ? (
                            [...Array(4)].map((_, i) => <SkeletonRow key={i} />)
                          ) : entries.length === 0 ? (
                            <EmptyRow message="No hay trabajadores asignados a este proyecto." />
                          ) : (
                            entries.map((entry) => (
                              <tr
                                key={entry.worker.id}
                                onClick={() => openPanel(entry)}
                                className="border-b border-slate-100 hover:bg-blue-50/50 cursor-pointer transition-colors group"
                              >
                                <td className="px-4 py-2.5">
                                  <span className="text-sm font-semibold text-slate-800">
                                    {entry.worker.first_name} {entry.worker.last_name}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                                  {entry.worker.dni}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[180px] truncate">
                                  {entry.worker.email ?? '—'}
                                </td>
                                <td className="px-4 py-2.5">
                                  {entry.loading ? (
                                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                                      <span className="w-3 h-3 border-[1.5px] border-slate-200 border-t-blue-400 rounded-full animate-spin" />
                                      Evaluando…
                                    </span>
                                  ) : entry.accreditation ? (
                                    <TrafficLightBadge status={entry.accreditation.traffic_light} showLabel />
                                  ) : (
                                    <span className="text-xs text-slate-400">Sin datos</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <span className="text-xs font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                    Ver documentos →
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Slide-over */}
      <WorkerDetailPanel
        worker={panelWorker}
        projectId={selectedProject?.id ?? null}
        projectName={selectedProject?.name ?? ''}
        accreditation={panelAccreditation}
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        onRefresh={refreshWorker}
      />
    </>
  )
}
