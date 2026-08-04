'use client'

import { useState } from 'react'
import type { VehicleDocumentType } from '@/lib/types'
import { api } from '@/lib/api'
import { INPUT, BTN_PRIMARY, BTN_GHOST } from './utils'

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function formatDMY(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

export function DocForm({
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
  const [error, setError] = useState<string | null>(null)

  const selectedType = docTypes.find((d) => d.id === vdtId) ?? null
  const validityDays = selectedType?.validity_days ?? null
  const hasValidity = !!validityDays && validityDays > 0
  const computedExpiry = hasValidity && issueDate ? addDays(issueDate, validityDays as number) : null

  const canSubmit = isEdit
    ? !saving
    : !!file && !!issueDate && (hasValidity || !!expiryDate) && !saving

  const doSubmit = async () => {
    if (!isEdit && !file) { setError('Selecciona un archivo.'); return }
    setSaving(true); setError(null)
    try {
      // Con vigencia el backend calcula/recalcula el vencimiento; sin vigencia es manual.
      const expiry = hasValidity ? undefined : expiryDate || undefined
      if (isEdit) {
        await api.editVehicleDocument(docId as number, {
          issue_date: issueDate || undefined,
          expiry_date: expiry,
          file: file ?? undefined,
        })
      } else {
        await api.uploadVehicleDocument({
          vehicle_id: vehicleId,
          vehicle_document_type_id: vdtId,
          issue_date: issueDate || undefined,
          expiry_date: expiry,
          file: file as File,
        })
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    doSubmit()
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
            <p className="text-xs font-bold text-red-700 mb-0.5">No se pudo guardar</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Emisión</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Vencimiento</label>
          {hasValidity ? (
            <p className="text-xs font-semibold text-slate-700 py-1.5">
              {computedExpiry ? (
                <>
                  {formatDMY(computedExpiry)}{' '}
                  <span className="text-slate-400 font-normal">(vigencia {validityDays}d)</span>
                </>
              ) : (
                <span className="text-slate-400 font-normal">— (ingresa la emisión)</span>
              )}
            </p>
          ) : (
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={INPUT} />
          )}
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">
            {isEdit ? 'Reemplazar archivo (opcional)' : 'Archivo'}
          </label>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={fileClass} />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancelar</button>
        <button type="submit" disabled={!canSubmit} className={submitClass}>
          {saving ? (isEdit ? 'Guardando…' : 'Subiendo…') : (isEdit ? 'Guardar cambios' : 'Subir documento')}
        </button>
      </div>
    </form>
  )
}
