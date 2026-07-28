'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { WorkerGlobalStatus } from '@/lib/types'
import { TrafficLightBadge } from '@/components/TrafficLightBadge'

export default function AprobacionesPage() {
  const [workers, setWorkers] = useState<WorkerGlobalStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getWorkersGlobalStatus({ limit: 500 })
      .then(({ items }) => setWorkers(items))
      .catch(() => setError('No se pudo cargar la bandeja de aprobaciones.'))
      .finally(() => setLoading(false))
  }, [])

  const pendingWorkers = workers.filter(
    w => w.global_traffic_light === 'red' || w.global_traffic_light === 'yellow' || w.global_traffic_light === null
  )

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Bandeja de Aprobaciones</h1>
          <p className="text-sm text-slate-500 mt-1">
            Trabajadores con documentos pendientes de revisión o con alertas activas.
          </p>
        </div>
        {!loading && (
          <span className="mt-1 px-3 py-1 rounded-full bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold shrink-0">
            {pendingWorkers.length} con atención requerida
          </span>
        )}
      </div>

      {loading && <div className="text-center py-20 text-slate-400 text-sm">Cargando…</div>}
      {error && <div className="text-center py-20 text-red-600 text-sm">{error}</div>}

      {!loading && !error && pendingWorkers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-12 h-12 rounded-full bg-green-100 border border-green-200 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-500 text-sm">Todos los trabajadores están al día.</p>
        </div>
      )}

      {!loading && !error && pendingWorkers.length > 0 && (
        <div className="bg-white border border-slate-300 rounded-sm overflow-hidden max-w-3xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">Trabajador</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">RUT</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">Estado</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">Proyectos</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingWorkers.map((w) => (
                <tr key={w.worker_id} className="bg-white even:bg-slate-50 hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3 text-slate-800 font-semibold text-sm">
                    {w.first_name} {w.last_name}
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{w.dni}</td>
                  <td className="px-4 py-3">
                    {w.global_traffic_light
                      ? <TrafficLightBadge status={w.global_traffic_light} />
                      : <span className="text-xs text-slate-400">Sin datos</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-sm">{w.assigned_projects}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/trabajadores/${w.worker_id}`}
                      className="text-xs font-medium text-[#0070f2] hover:text-[#005cc8] transition-colors"
                    >
                      Revisar →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
