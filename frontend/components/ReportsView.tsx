'use client'

import { useEffect, useState } from 'react'
import type { ExpiringDocumentItem, Project, Worker, DocCheckStatus } from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from './TrafficLightBadge'

const CATEGORY_LABELS: Record<string, string> = {
  medical: 'Médico',
  background: 'Antecedentes',
  certification: 'Certificación',
  training: 'Capacitación',
  legal: 'Legal',
  other: 'Otro',
}

function docStatus(days: number): DocCheckStatus {
  if (days < 0)  return 'expired'
  if (days <= 14) return 'expired'
  if (days <= 60) return 'expiring_soon'
  return 'ok'
}

function ExpiryBadge({ days }: { days: number }) {
  if (days < 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
        Venció hace {Math.abs(days)}d
      </span>
    )
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
        ¡Vence hoy!
      </span>
    )
  }
  const color = days <= 14 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`}>
      {days}d restantes
    </span>
  )
}

export function ReportsView() {
  const [items, setItems]             = useState<ExpiringDocumentItem[]>([])
  const [workers, setWorkers]         = useState<Worker[]>([])
  const [projects, setProjects]       = useState<Project[]>([])
  const [loading, setLoading]         = useState(true)
  const [daysThreshold, setDaysThreshold] = useState(30)
  const [inputDays, setInputDays]     = useState('30')
  const [workerId, setWorkerId]       = useState<number | ''>('')
  const [projectId, setProjectId]     = useState<number | ''>('')

  const [prevDepsKey, setPrevDepsKey] = useState(`${daysThreshold}|${workerId}|${projectId}`)
  const depsKey = `${daysThreshold}|${workerId}|${projectId}`
  if (depsKey !== prevDepsKey) {
    setPrevDepsKey(depsKey)
    setLoading(true)
  }

  useEffect(() => {
    Promise.all([api.getWorkers(), api.getProjects()])
      .then(([w, p]) => { setWorkers(w); setProjects(p) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    api.getExpiringDocuments({
      days_threshold: daysThreshold,
      worker_id:  workerId  !== '' ? workerId  : undefined,
      project_id: projectId !== '' ? projectId : undefined,
    })
      .then(data => setItems(data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [daysThreshold, workerId, projectId])

  const fetchReport = async () => {
    setLoading(true)
    try {
      const data = await api.getExpiringDocuments({
        days_threshold: daysThreshold,
        worker_id:  workerId  !== '' ? workerId  : undefined,
        project_id: projectId !== '' ? projectId : undefined,
      })
      setItems(data)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const handleDaysBlur = () => {
    const parsed = parseInt(inputDays, 10)
    if (!isNaN(parsed) && parsed >= 0) setDaysThreshold(parsed)
    else setInputDays(String(daysThreshold))
  }

  const redCount    = items.filter((i) => i.days_until_expiry <  0).length
  const urgentCount = items.filter((i) => i.days_until_expiry >= 0 && i.days_until_expiry <= 14).length
  const warnCount   = items.filter((i) => i.days_until_expiry >  14).length

  return (
    <div className="p-5 space-y-5">

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-md px-4 py-3 flex items-center gap-3 shadow-sm">
          <span className="w-[3px] h-9 rounded-full shrink-0 bg-red-500" />
          <div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{redCount}</p>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">Ya vencidos</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md px-4 py-3 flex items-center gap-3 shadow-sm">
          <span className="w-[3px] h-9 rounded-full shrink-0 bg-red-400" />
          <div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{urgentCount}</p>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">Vencen en ≤14 días</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md px-4 py-3 flex items-center gap-3 shadow-sm">
          <span className="w-[3px] h-9 rounded-full shrink-0 bg-amber-400" />
          <div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{warnCount}</p>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">Próximos a vencer</p>
          </div>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-md shadow-sm px-4 py-3 flex items-center gap-4 flex-wrap">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Filtros</p>

        {/* Days threshold */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600 shrink-0">Vencen en</label>
          <input
            type="number"
            min={0}
            value={inputDays}
            onChange={(e) => setInputDays(e.target.value)}
            onBlur={handleDaysBlur}
            onKeyDown={(e) => e.key === 'Enter' && handleDaysBlur()}
            className="w-16 text-xs border border-slate-200 rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <label className="text-xs font-medium text-slate-600 shrink-0">días o menos</label>
        </div>

        <div className="w-px h-5 bg-slate-200 shrink-0" />

        {/* Worker filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600 shrink-0">Empleado</label>
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value === '' ? '' : Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white min-w-[160px]"
          >
            <option value="">Todos los empleados</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.first_name} {w.last_name}
              </option>
            ))}
          </select>
        </div>

        {/* Project filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600 shrink-0">Proyecto</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white min-w-[160px]"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {loading && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-3 h-3 border-[1.5px] border-slate-300 border-t-blue-500 rounded-full animate-spin" />
              Cargando…
            </span>
          )}
          <button
            onClick={fetchReport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Data grid ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
        {items.length === 0 && !loading ? (
          <div className="px-5 py-16 text-center">
            <svg className="mx-auto w-10 h-10 text-slate-200 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <p className="text-slate-400 text-sm">No hay documentos que vencen en los próximos {daysThreshold} días.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Estado', 'Empleado', 'Documento', 'Categoría', 'Proyecto', 'Vence', 'Días'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading
                  ? [...Array(5)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {[...Array(7)].map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-3 bg-slate-100 rounded w-3/4" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : items.map((item) => (
                      <tr
                        key={item.worker_document_id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <TrafficLightBadge status={docStatus(item.days_until_expiry)} showLabel />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{item.worker_name}</p>
                          <p className="text-xs text-slate-400 font-mono">{item.worker_dni}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-700">{item.document_type_name}</span>
                          {item.status === 'pending' && (
                            <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              En revisión
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {item.project_name ?? <span className="text-slate-300">Global</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                          {new Date(item.expiry_date + 'T12:00:00').toLocaleDateString('es-CL')}
                        </td>
                        <td className="px-4 py-3">
                          <ExpiryBadge days={item.days_until_expiry} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}

        {items.length > 0 && !loading && (
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400">
            {items.length} resultado{items.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
