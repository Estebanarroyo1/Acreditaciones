'use client'

import { useState } from 'react'
import type { VehicleMaintenanceCheck } from '@/lib/types'
import { TrafficLightBadge } from '../TrafficLightBadge'
import { MeterUpdateForm } from './MeterUpdateForm'

export function MaintRow({ check, onRefresh }: { check: VehicleMaintenanceCheck; onRefresh: () => void }) {
  const [showMeter, setShowMeter] = useState(false)

  const unitLabel = check.measurement_unit === 'km' ? 'KM' : 'h'
  const remaining = check.usage_remaining ?? 0

  const remainingCell = () => {
    if (remaining <= 0)
      return <span className="text-red-700 font-semibold">Vencido ({Math.abs(remaining).toFixed(0)} {unitLabel})</span>
    const warn = check.next_service_meter > 0 && remaining <= check.next_service_meter * 0.2
    return (
      <span className={warn ? 'text-amber-700 font-semibold' : 'text-slate-600'}>
        {remaining.toFixed(0)} {unitLabel}
      </span>
    )
  }

  const maintStatus = remaining <= 0 ? 'expired' : (
    check.next_service_meter > 0 && remaining <= check.next_service_meter * 0.2
      ? 'expiring_soon' : 'ok'
  ) as 'ok' | 'expiring_soon' | 'expired'

  return (
    <>
      <tr className="even:bg-[#f4f6f8]/60 border-b border-slate-200 hover:bg-[#e8f0fa] transition-colors">
        <td className="px-3 py-1 text-[11px] font-medium text-slate-800">{check.maintenance_program}</td>
        <td className="px-3 py-1 text-[11px] text-slate-500 uppercase font-bold">{check.measurement_unit === 'km' ? 'KM' : 'Horas'}</td>
        <td className="px-3 py-1 text-[11px] text-slate-700 font-mono">{check.current_meter.toLocaleString('es-CL')}</td>
        <td className="px-3 py-1 text-[11px] text-slate-700 font-mono">{check.next_service_meter.toLocaleString('es-CL')}</td>
        <td className="px-3 py-1 text-[11px]">{remainingCell()}</td>
        <td className="px-3 py-1">
          <TrafficLightBadge status={maintStatus} variant="pill" />
        </td>
        <td className="px-3 py-1 text-right">
          <button
            onClick={() => setShowMeter((v) => !v)}
            className={`px-2 py-0.5 text-[11px] font-semibold rounded-none transition-colors ${
              showMeter ? 'bg-slate-200 text-slate-600' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {showMeter ? 'Cancelar' : `Actualizar ${unitLabel}`}
          </button>
        </td>
      </tr>
      {showMeter && (
        <tr>
          <td colSpan={7} className="p-0 border-b border-slate-200">
            <MeterUpdateForm
              maintId={check.vehicle_maintenance_id}
              current={check.current_meter}
              unit={check.measurement_unit}
              onSuccess={() => { setShowMeter(false); onRefresh() }}
              onCancel={() => setShowMeter(false)}
            />
          </td>
        </tr>
      )}
    </>
  )
}
