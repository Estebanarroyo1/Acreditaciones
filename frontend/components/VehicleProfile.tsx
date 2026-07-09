'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type {
  VehicleAIScanResult,
  VehicleDocumentCheck,
  VehicleDocumentType,
  VehicleFullProfile,
  VehicleMaintenanceCheck,
} from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from './TrafficLightBadge'

// ── Style tokens ───────────────────────────────────────────────────────────
const INPUT = 'w-full px-2 py-1.5 text-xs border border-slate-300 rounded-none bg-white focus:outline-none focus:border-[#003f7a] focus:ring-1 focus:ring-[#003f7a]/20'
const BTN_PRIMARY = 'px-3 py-1.5 text-xs font-semibold rounded-none bg-[#003f7a] text-white hover:bg-[#005096] disabled:opacity-50 transition-colors'
const BTN_GHOST = 'px-3 py-1.5 text-xs font-semibold rounded-none border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors'

// ── Traffic light helpers ──────────────────────────────────────────────────
type TL = 'green' | 'yellow' | 'red' | null | undefined

function stepColor(light: TL): 'green' | 'yellow' | 'red' | 'gray' {
  if (light === 'green') return 'green'
  if (light === 'yellow') return 'yellow'
  if (light === 'red') return 'red'
  return 'gray'
}

function stepLabel(light: TL): string {
  if (light === 'green') return 'VERDE'
  if (light === 'yellow') return 'AMARILLO'
  if (light === 'red') return 'ROJO'
  return 'N/A'
}

// ── Status Arrow (breadcrumb-style stepper step) ───────────────────────────
function StatusArrow({
  label,
  subLabel,
  color,
  position,
}: {
  label: string
  subLabel: string
  color: 'green' | 'yellow' | 'red' | 'blue' | 'gray'
  position: 'first' | 'middle' | 'last'
}) {
  const bg: Record<string, string> = {
    green: '#15803d',
    yellow: '#b45309',
    red: '#b91c1c',
    blue: '#003f7a',
    gray: '#64748b',
  }
  const clipPath: Record<string, string> = {
    first: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)',
    middle: 'polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)',
    last: 'polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%)',
  }
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-white shrink-0 px-5"
      style={{ backgroundColor: bg[color], clipPath: clipPath[position], minWidth: '130px' }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-widest opacity-75 leading-none">{label}</span>
      <span className="text-[11px] font-black leading-none mt-0.5">{subLabel}</span>
    </div>
  )
}

// ── Compact header field ───────────────────────────────────────────────────
function HField({ label, value, mono = false }: {
  label: string
  value?: string | number | null
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-[10px] font-bold uppercase tracking-wide text-slate-500 shrink-0 text-right"
        style={{ minWidth: '68px' }}
      >
        {label}
      </span>
      <div className={`flex-1 h-7 text-xs border border-slate-300 bg-white px-2 flex items-center text-slate-800 overflow-hidden ${mono ? 'font-mono' : ''}`}>
        {value != null && value !== '' ? (
          <span className="truncate">{value}</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>
    </div>
  )
}

// ── Tab button ─────────────────────────────────────────────────────────────
function Tab({ label, active, onClick, count }: {
  label: string; active: boolean; onClick: () => void; count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`h-9 px-5 text-xs font-semibold border-b-2 whitespace-nowrap transition-none ${
        active
          ? 'border-[#003f7a] text-[#003f7a]'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-1.5 text-[10px] ${active ? 'text-[#003f7a]/60' : 'text-slate-400'}`}>
          ({count})
        </span>
      )}
    </button>
  )
}

// ── Right-panel action button ──────────────────────────────────────────────
function ActionBtn({
  label, icon, color = 'blue', onClick, href,
}: {
  label: string
  icon: React.ReactNode
  color?: 'blue' | 'slate'
  onClick?: () => void
  href?: string
}) {
  const cls = `w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white rounded-none transition-colors ${
    color === 'blue' ? 'bg-[#003f7a] hover:bg-[#005096]' : 'bg-slate-600 hover:bg-slate-700'
  }`
  if (href) return <Link href={href} className={cls}>{icon}{label}</Link>
  return <button onClick={onClick} className={cls}>{icon}{label}</button>
}

// ── DocForm (upload or edit) ───────────────────────────────────────────────
function DocForm({
  vehicleId, docTypes, defaultVdtId, docId, onSuccess, onCancel,
}: {
  vehicleId: number
  docTypes: VehicleDocumentType[]
  defaultVdtId?: number
  docId?: number
  onSuccess: () => void
  onCancel: () => void
}) {
  const isEdit = docId !== undefined
  const [vdtId, setVdtId] = useState(defaultVdtId ?? docTypes[0]?.id ?? 0)
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [aiResult, setAiResult] = useState<VehicleAIScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    setAiResult(null)
    setError(null)
  }

  const handleAiScan = async () => {
    if (!file) return
    setScanning(true); setError(null)
    try {
      const result = await api.scanVehicleDocument(file)
      setAiResult(result)
      if (result.issue_date) setIssueDate(result.issue_date)
      if (result.expiry_date) setExpiryDate(result.expiry_date)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar con IA')
    } finally { setScanning(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isEdit && !file) { setError('Selecciona un archivo.'); return }
    setSaving(true); setError(null)
    try {
      if (isEdit) {
        await api.editVehicleDocument(docId!, {
          issue_date: issueDate || undefined,
          expiry_date: expiryDate || undefined,
          file: file ?? undefined,
        })
      } else {
        await api.uploadVehicleDocument({
          vehicle_id: vehicleId,
          vehicle_document_type_id: vdtId,
          issue_date: issueDate || undefined,
          expiry_date: expiryDate || undefined,
          file: file!,
        })
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const accentBorder = isEdit ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
  const fileClass = isEdit
    ? 'flex-1 text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded-none file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-700'
    : 'flex-1 text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded-none file:border-0 file:text-xs file:font-semibold file:bg-[#003f7a] file:text-white hover:file:bg-[#005096]'
  const submitClass = isEdit
    ? 'px-3 py-1.5 text-xs font-semibold rounded-none bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors'
    : BTN_PRIMARY

  return (
    <form onSubmit={handleSubmit} className={`p-3 border space-y-3 ${accentBorder}`}>

      {error && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-red-50 border border-red-300">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-xs font-bold text-red-700 mb-0.5">Documento rechazado</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {aiResult && !error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-violet-50 border border-violet-200 text-xs text-violet-700">
          <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span>
            <span className="font-semibold">Datos sugeridos por IA</span>
            {aiResult.document_type_detected && <span className="ml-1">— {aiResult.document_type_detected}</span>}
            . Revisa y confirma antes de guardar.
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {!isEdit && (
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Tipo de documento</label>
            <select value={vdtId} onChange={(e) => setVdtId(Number(e.target.value))} className={INPUT}>
              {docTypes.map((dt) => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">
            Emisión {aiResult?.issue_date && <span className="text-violet-500 normal-case font-normal ml-0.5">(IA)</span>}
          </label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">
            Vencimiento {aiResult?.expiry_date && <span className="text-violet-500 normal-case font-normal ml-0.5">(IA)</span>}
          </label>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">
            {isEdit ? 'Reemplazar archivo' : 'Archivo'}
          </label>
          <div className="flex items-center gap-2">
            <input type="file" onChange={handleFileChange} className={fileClass} />
            {file && (
              <button
                type="button"
                onClick={handleAiScan}
                disabled={scanning}
                className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-none bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {scanning ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                )}
                <span>{scanning ? 'Analizando…' : 'IA'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancelar</button>
        <button type="submit" disabled={saving} className={submitClass}>
          {saving ? (isEdit ? 'Guardando…' : 'Subiendo…') : (isEdit ? 'Guardar cambios' : 'Subir documento')}
        </button>
      </div>
    </form>
  )
}

// ── Meter update form ──────────────────────────────────────────────────────
function MeterUpdateForm({ maintId, current, unit, onSuccess, onCancel }: {
  maintId: number; current: number; unit: 'km' | 'horas'
  onSuccess: () => void; onCancel: () => void
}) {
  const [value, setValue] = useState(String(current))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(value)
    if (isNaN(n) || n < 0) { setError('Ingresa un número válido.'); return }
    setSaving(true); setError(null)
    try {
      await api.updateVehicleMaintenance(maintId, { current_meter: n })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-blue-50 border border-blue-200 space-y-3">
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-xs">
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">
            Lectura actual ({unit === 'km' ? 'KM' : 'Horas'})
          </label>
          <input type="number" step="0.1" min="0" value={value} onChange={(e) => setValue(e.target.value)} className={INPUT} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancelar</button>
          <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? 'Guardando…' : 'Actualizar'}</button>
        </div>
      </div>
    </form>
  )
}

// ── New maintenance form ───────────────────────────────────────────────────
function NewMaintenanceForm({ vehicleId, onSuccess, onCancel }: {
  vehicleId: number; onSuccess: () => void; onCancel: () => void
}) {
  const [program, setProgram] = useState('')
  const [unit, setUnit] = useState<'km' | 'horas'>('km')
  const [lastMeter, setLastMeter] = useState('')
  const [nextMeter, setNextMeter] = useState('')
  const [currentMeter, setCurrentMeter] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!program || !nextMeter) { setError('Nombre del programa y próximo servicio son obligatorios.'); return }
    setSaving(true); setError(null)
    try {
      await api.createVehicleMaintenance({
        vehicle_id: vehicleId,
        maintenance_program: program,
        measurement_unit: unit,
        last_service_meter: lastMeter ? parseFloat(lastMeter) : undefined,
        next_service_meter: parseFloat(nextMeter),
        current_meter: currentMeter ? parseFloat(currentMeter) : 0,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-blue-50 border border-blue-200 space-y-3">
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Programa de mantención *</label>
          <input type="text" placeholder="Ej: Cambio de aceite" value={program} onChange={(e) => setProgram(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Unidad</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as 'km' | 'horas')} className={INPUT}>
            <option value="km">Kilómetros</option>
            <option value="horas">Horas</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Lectura actual</label>
          <input type="number" step="0.1" min="0" value={currentMeter} onChange={(e) => setCurrentMeter(e.target.value)} placeholder="0" className={INPUT} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Último servicio en</label>
          <input type="number" step="0.1" min="0" value={lastMeter} onChange={(e) => setLastMeter(e.target.value)} placeholder="Opcional" className={INPUT} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Próximo servicio en *</label>
          <input type="number" step="0.1" min="0" value={nextMeter} onChange={(e) => setNextMeter(e.target.value)} placeholder="Ej: 10000" className={INPUT} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancelar</button>
        <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? 'Guardando…' : 'Crear programa'}</button>
      </div>
    </form>
  )
}

// ── Document row ───────────────────────────────────────────────────────────
function DocRow({ check, vehicleId, docTypes, onRefresh }: {
  check: VehicleDocumentCheck
  vehicleId: number
  docTypes: VehicleDocumentType[]
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)

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

// ── Maintenance row ────────────────────────────────────────────────────────
function MaintRow({ check, onRefresh }: { check: VehicleMaintenanceCheck; onRefresh: () => void }) {
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

// ── Table header cell ──────────────────────────────────────────────────────
function TH({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#003f7a] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

// ── VehicleProfile ─────────────────────────────────────────────────────────
export function VehicleProfile({ vehicleId }: { vehicleId: number }) {
  const [profile, setProfile] = useState<VehicleFullProfile | null>(null)
  const [docTypes, setDocTypes] = useState<VehicleDocumentType[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewMaint, setShowNewMaint] = useState(false)
  const [showAddAdditional, setShowAddAdditional] = useState(false)
  const [activeTab, setActiveTab] = useState<'docs' | 'maint'>('docs')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, dts] = await Promise.all([
        api.getVehicleFullProfile(vehicleId),
        api.getVehicleDocumentTypes(true),
      ])
      setProfile(p)
      setDocTypes(dts)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [vehicleId])

  useEffect(() => { load() }, [load])

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-full animate-pulse">
        <div className="flex-1 space-y-0">
          <div className="h-9 bg-slate-300" />
          <div className="h-[72px] bg-[#f4f6f8] border-b border-slate-300" />
          <div className="h-9 bg-[#f4f6f8] border-b border-slate-300" />
          <div className="h-8 bg-[#e6f0f9] border-b border-[#c5d8ed]" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 border-b border-slate-200 bg-white" />
          ))}
        </div>
        <div className="w-64 bg-white border-l border-slate-300" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-500 text-sm">
        Vehículo no encontrado.{' '}
        <Link href="/vehiculos" className="text-[#003f7a] hover:underline ml-1">Volver a Flota</Link>
      </div>
    )
  }

  const kmChecks = profile.maintenance_checks.filter(c => c.measurement_unit === 'km')

  // ── Right panel icon helpers ──────────────────────────────────────────────
  const IcoSettings = (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
  const IcoBell = (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
  const IcoPlus = (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
  const IcoX = (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )

  return (
    <div className="flex min-h-full">

      {/* ══ MAIN CONTENT ══════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Status stepper */}
        <div className="h-9 flex border-b border-slate-300 bg-[#f4f6f8] overflow-hidden shrink-0">
          <StatusArrow
            position="first"
            label="Estado"
            subLabel={profile.is_active ? 'ACTIVO' : 'INACTIVO'}
            color={profile.is_active ? 'blue' : 'gray'}
          />
          <StatusArrow
            position="middle"
            label="Documentación"
            subLabel={stepLabel(profile.doc_traffic_light)}
            color={stepColor(profile.doc_traffic_light)}
          />
          <StatusArrow
            position="last"
            label="Mantención"
            subLabel={stepLabel(profile.maintenance_traffic_light)}
            color={stepColor(profile.maintenance_traffic_light)}
          />
          <div className="flex-1" />
          <Link
            href="/vehiculos"
            className="flex items-center gap-1 px-4 text-[11px] text-slate-500 hover:text-[#003f7a] shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Directorio
          </Link>
        </div>

        {/* Data header */}
        <div className="bg-[#f4f6f8] border-b border-slate-300 px-4 py-2 shrink-0">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
            <HField label="Patente" value={profile.license_plate} mono />
            <HField label="Tipo" value={profile.type} />
            <HField label="Marca" value={profile.brand} />
            <HField label="Modelo" value={profile.model} />
            <HField label="Año" value={profile.year} />
            <HField label="Propietario" value={profile.owners} />
            <HField label="Municipio" value={profile.municipality} />
            <HField label="Seguro" value={profile.insurance_company} />
            <HField label="N° Póliza" value={profile.insurance_policy_number} />
          </div>
          {(profile.vin_chassis || profile.engine_number || profile.tag_id || profile.gps_id) && (
            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mt-1.5 pt-1.5 border-t border-slate-200">
              {profile.vin_chassis && <HField label="VIN / Chasis" value={profile.vin_chassis} mono />}
              {profile.engine_number && <HField label="N° Motor" value={profile.engine_number} mono />}
              {profile.tag_id && <HField label="TAG" value={profile.tag_id} mono />}
              {profile.gps_id && <HField label="GPS ID" value={profile.gps_id} mono />}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-300 bg-[#f4f6f8] px-4 shrink-0">
          <Tab
            label="Documentación Legal"
            active={activeTab === 'docs'}
            onClick={() => setActiveTab('docs')}
            count={profile.required_document_checks.length + profile.additional_document_checks.length}
          />
          <Tab
            label="Control de Mantención"
            active={activeTab === 'maint'}
            onClick={() => setActiveTab('maint')}
            count={profile.maintenance_checks.length}
          />
        </div>

        {/* Tab content */}
        <div className="flex-1">

          {/* ── Documentación ── */}
          {activeTab === 'docs' && (
            <>
              {/* Tabla 1: Documentación Obligatoria Base */}
              <div className="border-b border-slate-300">
                <div className="bg-[#f0f4f8] border-b border-slate-200 px-4 py-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Documentación Obligatoria Base
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({profile.required_document_checks.length})
                  </span>
                  {profile.required_doc_traffic_light && (
                    <div className="ml-auto">
                      <TrafficLightBadge status={profile.required_doc_traffic_light} variant="pill" />
                    </div>
                  )}
                </div>
                {profile.required_document_checks.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No hay tipos de documento obligatorio configurados.{' '}
                    <Link href="/vehiculos/documentacion" className="text-[#003f7a] hover:underline">Configurar</Link>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#e6f0f9] border-b border-[#c5d8ed]">
                        <TH>Documento</TH>
                        <TH>Vencimiento</TH>
                        <TH>Días por vencer</TH>
                        <TH>Estado</TH>
                        <TH right>Acciones</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.required_document_checks.map((check) => (
                        <DocRow
                          key={check.vehicle_document_type_id}
                          check={check}
                          vehicleId={vehicleId}
                          docTypes={docTypes.filter(d => d.is_required_base)}
                          onRefresh={load}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Tabla 2: Documentación Adicional */}
              <div>
                <div className="bg-[#f0f4f8] border-b border-slate-200 px-4 py-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Documentación Adicional
                  </span>
                  {profile.additional_document_checks.length > 0 && (
                    <span className="text-[10px] text-slate-400">
                      ({profile.additional_document_checks.length})
                    </span>
                  )}
                  {profile.additional_doc_traffic_light && (
                    <div className="ml-1">
                      <TrafficLightBadge status={profile.additional_doc_traffic_light} variant="pill" />
                    </div>
                  )}
                  <button
                    onClick={() => setShowAddAdditional(v => !v)}
                    className={`ml-auto px-2 py-0.5 text-[10px] font-semibold rounded-none transition-colors ${
                      showAddAdditional
                        ? 'bg-slate-200 text-slate-600'
                        : 'bg-[#003f7a] text-white hover:bg-[#005096]'
                    }`}
                  >
                    {showAddAdditional ? 'Cancelar' : '+ Añadir Documento Adicional'}
                  </button>
                </div>

                {showAddAdditional && (
                  <div className="border-b border-slate-200">
                    <DocForm
                      vehicleId={vehicleId}
                      docTypes={docTypes.filter(d => !d.is_required_base)}
                      onSuccess={() => { setShowAddAdditional(false); load() }}
                      onCancel={() => setShowAddAdditional(false)}
                    />
                  </div>
                )}

                {profile.additional_document_checks.length === 0 && !showAddAdditional ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Sin documentos adicionales cargados para este vehículo.
                  </div>
                ) : profile.additional_document_checks.length > 0 && (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#e6f0f9] border-b border-[#c5d8ed]">
                        <TH>Documento</TH>
                        <TH>Vencimiento</TH>
                        <TH>Días por vencer</TH>
                        <TH>Estado</TH>
                        <TH right>Acciones</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.additional_document_checks.map((check) => (
                        <DocRow
                          key={check.vehicle_document_type_id}
                          check={check}
                          vehicleId={vehicleId}
                          docTypes={docTypes.filter(d => !d.is_required_base)}
                          onRefresh={load}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ── Mantención ── */}
          {activeTab === 'maint' && (
            <>
              {showNewMaint && (
                <div className="border-b border-slate-300">
                  <NewMaintenanceForm
                    vehicleId={vehicleId}
                    onSuccess={() => { setShowNewMaint(false); load() }}
                    onCancel={() => setShowNewMaint(false)}
                  />
                </div>
              )}

              {profile.maintenance_checks.length === 0 && !showNewMaint ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No hay programas de mantención registrados.
                </div>
              ) : profile.maintenance_checks.length > 0 && (
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#e6f0f9] border-b border-[#c5d8ed] sticky top-0">
                      <TH>Programa</TH>
                      <TH>Unidad</TH>
                      <TH>Lectura actual</TH>
                      <TH>Próx. servicio</TH>
                      <TH>Restante</TH>
                      <TH>Estado</TH>
                      <TH right>Acciones</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.maintenance_checks.map((check) => (
                      <MaintRow key={check.vehicle_maintenance_id} check={check} onRefresh={load} />
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

        </div>
      </div>

      {/* ══ RIGHT ACTION PANEL ════════════════════════════════════════════ */}
      <aside
        className="w-64 shrink-0 bg-white border-l border-slate-300 sticky top-0 self-start overflow-y-auto flex flex-col"
        style={{ height: 'calc(100vh - 48px)' }}
      >
        {/* Panel header */}
        <div className="h-8 bg-[#f4f6f8] border-b border-slate-300 flex items-center px-3 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Acciones</span>
        </div>

        {/* Tab-specific actions */}
        <div className="p-2 space-y-1 border-b border-slate-200">
          {activeTab === 'docs' && (
            <>
              <ActionBtn label="Tipos de Documento" icon={IcoSettings} color="slate" href="/vehiculos/documentacion" />
              <ActionBtn label="Config. de Alertas" icon={IcoBell} color="slate" href="/vehiculos/alertas" />
            </>
          )}
          {activeTab === 'maint' && (
            <ActionBtn
              label={showNewMaint ? 'Cancelar nuevo' : 'Nuevo programa'}
              icon={showNewMaint ? IcoX : IcoPlus}
              color={showNewMaint ? 'slate' : 'blue'}
              onClick={() => setShowNewMaint((v) => !v)}
            />
          )}
        </div>

        {/* Estado section */}
        <div className="p-3 space-y-2 border-b border-slate-200">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Estado del vehículo</p>

          <div className="space-y-1.5">
            <div className="border border-slate-200 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Global</p>
              {profile.global_traffic_light
                ? <TrafficLightBadge status={profile.global_traffic_light} size="lg" showLabel />
                : <span className="text-xs text-slate-300">N/A</span>}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div className="border border-slate-200 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Docs</p>
                {profile.doc_traffic_light
                  ? <TrafficLightBadge status={profile.doc_traffic_light} size="sm" showLabel />
                  : <span className="text-[10px] text-slate-300">N/A</span>}
              </div>
              <div className="border border-slate-200 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Mant.</p>
                {profile.maintenance_traffic_light
                  ? <TrafficLightBadge status={profile.maintenance_traffic_light} size="sm" showLabel />
                  : <span className="text-[10px] text-slate-300">N/A</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Odometer info */}
        {kmChecks.length > 0 && (
          <div className="p-3 space-y-2 border-b border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Odómetro</p>
            {kmChecks.map((c) => (
              <div key={c.vehicle_maintenance_id}>
                <p className="text-[10px] text-slate-400 truncate">{c.maintenance_program}</p>
                <p className="text-base font-black text-slate-800 font-mono leading-tight">
                  {c.current_meter.toLocaleString('es-CL')}
                  <span className="text-xs font-normal text-slate-400 ml-1">km</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Próx: {c.next_service_meter.toLocaleString('es-CL')} km
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Vehicle identity (mini card) */}
        <div className="p-3 mt-auto border-t border-slate-200">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Identificación</p>
          <p className="text-lg font-black text-slate-800 font-mono tracking-widest leading-none">
            {profile.license_plate}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {[profile.brand, profile.model, profile.year].filter(Boolean).join(' ')}
          </p>
          {!profile.is_active && (
            <span className="inline-block mt-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200">
              INACTIVO
            </span>
          )}
        </div>
      </aside>

    </div>
  )
}
