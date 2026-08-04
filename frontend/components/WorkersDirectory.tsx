'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Project, WorkerGlobalStatus, WorkLocation } from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from './TrafficLightBadge'
import { NewWorkerModal } from './NewWorkerModal'
import { BulkUploadModal } from './BulkUploadModal'
import { usePermissions } from '@/lib/permissions'

// ── Semáforo 3 luces compacto + etiqueta (SAP Fiori high-density) ──────────
function SemaforoCell({ light, label }: { light: string; label: string }) {
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <TrafficLightBadge status={light as import('@/lib/types').TrafficLight} size="sm" />
      <span className="text-[9px] text-slate-400 leading-none tracking-tight">{label}</span>
    </div>
  )
}

function StatusCell({ w }: { w: WorkerGlobalStatus }) {
  const parts: { light: string; label: string }[] = [
    { light: w.global_status, label: 'Global' },
    ...(w.achs_status !== null ? [{ light: w.achs_status!, label: 'ACHS' }] : []),
    ...(w.project_status !== null ? [{ light: w.project_status!, label: 'Proy.' }] : []),
  ]
  return (
    <div className="inline-flex items-center gap-3">
      {parts.map((p, i) => (
        <Fragment key={p.label}>
          {i > 0 && <div className="w-px h-5 bg-slate-200 shrink-0" />}
          <SemaforoCell light={p.light} label={p.label} />
        </Fragment>
      ))}
    </div>
  )
}

// ── Work location badge ─────────────────────────────────────────────────────
function LocationBadge({ location }: { location: WorkLocation }) {
  const cls =
    location === 'Planta'
      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : 'bg-orange-50 text-orange-700 border-orange-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${cls}`}>
      {location}
    </span>
  )
}

// ── Skeleton row ───────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(7)].map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-slate-200 rounded w-3/4" />
        </td>
      ))}
    </tr>
  )
}

// ── Delete confirmation dialog (used from the directory) ───────────────────
function DeleteDirectoryConfirmDialog({
  workerName,
  onConfirm,
  onCancel,
  deleting,
}: {
  workerName: string
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}) {
  const [typed, setTyped] = useState('')
  const confirmed = typed.trim().toLowerCase() === workerName.trim().toLowerCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-white shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <h3 className="text-base font-bold text-white">Eliminar trabajador permanentemente</h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-700">
            Esta acción <strong>no se puede deshacer</strong>. Se eliminarán todos los datos de{' '}
            <strong>{workerName}</strong>: documentos, asignaciones y registros.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Escribe el nombre completo para confirmar
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={workerName}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || deleting}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? 'Eliminando…' : 'Eliminar para siempre'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Tamaño de página para la carga incremental ("Cargar más").
const PAGE_SIZE = 100

// ── Main component ─────────────────────────────────────────────────────────
export function WorkersDirectory({ projects }: { projects: Project[] }) {
  const [workers, setWorkers] = useState<WorkerGlobalStatus[]>([])
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLight, setFilterLight] = useState<'all' | 'green' | 'yellow' | 'red'>('all')
  const [viewStatus, setViewStatus] = useState<'active' | 'archived'>('active')
  const [locationFilter, setLocationFilter] = useState<'all' | 'planta' | 'obra'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [workerToDelete, setWorkerToDelete] = useState<WorkerGlobalStatus | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const { canWrite } = usePermissions()

  const [prevViewStatus, setPrevViewStatus] = useState(viewStatus)
  const [prevLocationFilter, setPrevLocationFilter] = useState(locationFilter)
  if (viewStatus !== prevViewStatus || locationFilter !== prevLocationFilter) {
    setPrevViewStatus(viewStatus)
    setPrevLocationFilter(locationFilter)
    setLoading(true)
  }

  // Carga la primera página (reinicia la lista). Se usa al montar, al cambiar
  // filtros y tras crear/eliminar trabajadores.
  const loadWorkers = useCallback(async () => {
    // loading=true se maneja en el bloque de estado derivado (cambio de filtros)
    // y en el estado inicial; no aquí, para no hacer setState síncrono en el effect.
    try {
      const { items, total } = await api.getWorkersGlobalStatus({
        status: viewStatus,
        ...(locationFilter !== 'all' && { location: locationFilter }),
        limit: PAGE_SIZE,
        offset: 0,
      })
      setWorkers(items)
      setTotal(total)
    } catch {
      setWorkers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [viewStatus, locationFilter])

  useEffect(() => {
    let cancelled = false
    api.getWorkersGlobalStatus({
      status: viewStatus,
      ...(locationFilter !== 'all' && { location: locationFilter }),
      limit: PAGE_SIZE,
      offset: 0,
    })
      .then(({ items, total }) => { if (!cancelled) { setWorkers(items); setTotal(total) } })
      .catch(() => { if (!cancelled) { setWorkers([]); setTotal(0) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [viewStatus, locationFilter])

  // Carga incremental: agrega la siguiente página al final de la lista.
  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const { items, total } = await api.getWorkersGlobalStatus({
        status: viewStatus,
        ...(locationFilter !== 'all' && { location: locationFilter }),
        limit: PAGE_SIZE,
        offset: workers.length,
      })
      setWorkers((prev) => [...prev, ...items])
      setTotal(total)
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false)
    }
  }, [viewStatus, locationFilter, workers.length])

  const handleRestore = async (workerId: number) => {
    try {
      await api.restoreWorker(workerId)
      setWorkers((prev) => prev.filter((w) => w.worker_id !== workerId))
      setTotal((t) => Math.max(0, t - 1))
    } catch { /* ignore */ }
  }

  const handleDelete = async () => {
    if (!workerToDelete) return
    setDeleting(true)
    try {
      await api.deleteWorker(workerToDelete.worker_id)
      setWorkers((prev) => prev.filter((w) => w.worker_id !== workerToDelete.worker_id))
      setTotal((t) => Math.max(0, t - 1))
      setWorkerToDelete(null)
    } catch { /* ignore */ } finally {
      setDeleting(false)
    }
  }

  // Filtering
  const filtered = workers.filter((w) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      `${w.first_name} ${w.last_name}`.toLowerCase().includes(q) ||
      w.dni.toLowerCase().includes(q) ||
      (w.email ?? '').toLowerCase().includes(q)
    const matchLight =
      filterLight === 'all' || w.global_traffic_light === filterLight
    return matchSearch && matchLight
  })

  // Counts
  const greenCount = workers.filter((w) => w.global_traffic_light === 'green').length
  const yellowCount = workers.filter((w) => w.global_traffic_light === 'yellow').length
  const redCount = workers.filter((w) => w.global_traffic_light === 'red').length
  const noProjectCount = workers.filter((w) => !w.global_traffic_light).length

  const FILTER_TABS = [
    { key: 'all', label: `Todos (${workers.length})` },
    { key: 'green', label: `Acreditados (${greenCount})` },
    { key: 'yellow', label: `Por vencer (${yellowCount})` },
    { key: 'red', label: `Irregulares (${redCount})` },
  ] as const

  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Directorio de Empleados</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {workers.length} empleados {viewStatus === 'archived' ? 'archivados' : 'registrados'}
            {viewStatus === 'active' && noProjectCount > 0 && ` · ${noProjectCount} sin proyectos asignados`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Active / Archived toggle */}
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewStatus('active')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewStatus === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Personal Activo
            </button>
            <button
              onClick={() => setViewStatus('archived')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewStatus === 'archived' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Historial (Archivados)
            </button>
          </div>
          {canWrite('trabajadores') && (
            <button
              onClick={() => setBulkModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Carga Masiva
            </button>
          )}
          {canWrite('trabajadores') && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nuevo Trabajador
            </button>
          )}
        </div>
      </div>

      {/* ── Filter tabs + search ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          {/* Status filter tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilterLight(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    filterLight === tab.key
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Location filter */}
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value as 'all' | 'planta' | 'obra')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Ver Todos</option>
              <option value="planta">Solo Planta</option>
              <option value="obra">Solo Obra</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre, DNI o email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 font-semibold uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-3 text-left">Nombre</th>
                <th className="px-6 py-3 text-left">DNI</th>
                <th className="px-6 py-3 text-left">Email</th>
                <th className="px-6 py-3 text-center">Ubicación</th>
                <th className="px-6 py-3 text-center">Proyectos</th>
                <th className="px-6 py-3 text-center">Estado</th>
                <th className="px-6 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400 text-sm">
                    {search || filterLight !== 'all' || locationFilter !== 'all'
                      ? 'No hay trabajadores que coincidan con el filtro.'
                      : viewStatus === 'archived'
                      ? 'No hay trabajadores archivados.'
                      : 'Aún no hay trabajadores registrados. ¡Crea el primero!'}
                  </td>
                </tr>
              ) : (
                filtered.map((w) => (
                  <tr
                    key={w.worker_id}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                    onClick={() => router.push(`/trabajadores/${w.worker_id}`)}
                  >
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900">
                        {w.first_name} {w.last_name}
                      </p>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{w.dni}</td>
                    <td className="px-6 py-4 text-slate-500 truncate max-w-[200px]">
                      {w.email ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <LocationBadge location={w.work_location} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      {w.assigned_projects === 0 ? (
                        <span className="text-xs text-slate-400">Sin asignar</span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                          {w.assigned_projects}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusCell w={w} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {viewStatus === 'archived' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRestore(w.worker_id)
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-700 border border-slate-700 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                            </svg>
                            Restaurar
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setWorkerToDelete(w)
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            Eliminar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          Ver perfil →
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Cargar más (carga incremental) ─────────────────────────────── */}
        {!loading && workers.length < total && (
          <div className="flex justify-center py-4 border-t border-slate-100">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-2 text-[11px] font-semibold rounded-none transition-colors bg-[#003f7a] text-white hover:bg-[#005096] disabled:opacity-50"
            >
              {loadingMore ? 'Cargando…' : `Cargar más (${workers.length} de ${total})`}
            </button>
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <NewWorkerModal
        isOpen={modalOpen}
        projects={projects}
        onClose={() => setModalOpen(false)}
        onSuccess={() => loadWorkers()}
      />
      <BulkUploadModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={() => loadWorkers()}
      />

      {workerToDelete && (
        <DeleteDirectoryConfirmDialog
          workerName={`${workerToDelete.first_name} ${workerToDelete.last_name}`}
          onConfirm={handleDelete}
          onCancel={() => setWorkerToDelete(null)}
          deleting={deleting}
        />
      )}
    </>
  )
}
