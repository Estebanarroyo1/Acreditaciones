'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { VehicleGlobalStatus } from '@/lib/types'
import { TrafficLightBadge } from '@/components/TrafficLightBadge'

export default function MantencionPage() {
  const [vehicles, setVehicles] = useState<VehicleGlobalStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getVehiclesGlobalStatus()
      .then(data => setVehicles(data))
      .catch(() => setError('No se pudo cargar el estado de mantención.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Control de Mantenciones</h1>
        <p className="text-sm text-slate-500 mt-1">
          Estado general de la flota. Accede a cada vehículo para ver el detalle de mantención.
        </p>
      </div>

      {loading && <div className="text-center py-20 text-slate-400 text-sm">Cargando…</div>}
      {error && <div className="text-center py-20 text-red-600 text-sm">{error}</div>}

      {!loading && !error && vehicles.length === 0 && (
        <div className="text-center py-20 text-slate-400 text-sm">No hay vehículos registrados.</div>
      )}

      {!loading && !error && vehicles.length > 0 && (
        <div className="bg-white border border-slate-300 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">Vehículo</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">Patente</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">Estado global</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vehicles.map((v) => (
                <tr key={v.vehicle_id} className="bg-white even:bg-slate-50 hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3 text-slate-800 font-semibold text-sm">
                    {v.brand} {v.model}{v.year ? ` (${v.year})` : ''}
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{v.license_plate}</td>
                  <td className="px-4 py-3">
                    {v.global_traffic_light
                      ? <TrafficLightBadge status={v.global_traffic_light} />
                      : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/vehiculos/${v.vehicle_id}`}
                      className="text-xs font-medium text-[#0070f2] hover:text-[#005cc8] transition-colors"
                    >
                      Ver perfil →
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
