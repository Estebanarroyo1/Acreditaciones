'use client'

import { useState } from 'react'
import type { VehicleDocumentCheck, VehicleDocumentType } from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from '../TrafficLightBadge'
import { DocForm } from './DocForm'
import { usePermissions } from '@/lib/permissions'

export function DocRow({ check, vehicleId, docTypes, onRefresh }: {
  check: VehicleDocumentCheck
  vehicleId: number
  docTypes: VehicleDocumentType[]
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const { canWrite } = usePermissions()

  const expiryCell = () => {
    if (check.check_status === 'missing' || !check.expiry_date)
      return <span className="text-slate-300">—</span>
    return <span>{new Date(check.expiry_date).toLocaleDateString('es-CL')}</span>
  }

  const daysCell = () => {
    if (check.check_status === 'missing' || !check.vehicle_document_id)
      return <span className="text-slate-300">—</span>
    if (!check.expiry_date) return <span className="text-slate-400">Sin fecha</span>
    const d = check.days_until_expiry ?? 0
    if (d < 0) return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
        Venció hace {Math.abs(d)}d
      </span>
    )
    if (d === 0) return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
        Vence hoy
      </span>
    )
    if (d <= 30) return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
        {d}d
      </span>
    )
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
        {d}d
      </span>
    )
  }

  return (
    <>
      <tr className="even:bg-[#f4f6f8]/60 border-b border-slate-200 hover:bg-[#e8f0fa] transition-colors">
        <td className="px-3 py-1 text-[11px] font-medium text-slate-800 whitespace-nowrap">
          {check.vehicle_document_type_name}
        </td>
        <td className="px-3 py-1 text-[11px] text-slate-600">{expiryCell()}</td>
        <td className="px-3 py-1 text-[11px]">{daysCell()}</td>
        <td className="px-3 py-1">
          <TrafficLightBadge status={check.check_status} variant="pill" />
        </td>
        <td className="px-3 py-1 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-2">
            {check.vehicle_document_id && (
              <a
                href={api.getVehicleDocumentViewUrl(check.vehicle_document_id)}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-[#003f7a] hover:underline font-medium"
              >
                Ver
              </a>
            )}
            {canWrite('vehiculos') && (
              <button
                onClick={() => setOpen((v) => !v)}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded-none transition-colors ${
                  open
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-[#003f7a] text-white hover:bg-[#005096]'
                }`}
              >
                {open ? 'Cancelar' : (check.vehicle_document_id ? 'Editar' : 'Subir')}
              </button>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="p-0 border-b border-slate-200">
            <DocForm
              vehicleId={vehicleId}
              docTypes={docTypes}
              defaultVdtId={check.vehicle_document_type_id}
              docId={check.vehicle_document_id ?? undefined}
              onSuccess={() => { setOpen(false); onRefresh() }}
              onCancel={() => setOpen(false)}
            />
          </td>
        </tr>
      )}
    </>
  )
}
