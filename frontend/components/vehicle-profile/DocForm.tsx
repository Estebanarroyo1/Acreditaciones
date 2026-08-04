'use client'

import { useState } from 'react'
import type { ValidationConflict, VehicleAIScanResult, VehicleDocumentType } from '@/lib/types'
import { api } from '@/lib/api'
import { ValidationNotice, deriveConflict } from '@/components/validation/ValidationNotice'
import { INPUT, BTN_PRIMARY, BTN_GHOST } from './utils'

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
  const [scanning, setScanning] = useState(false)
  const [aiResult, setAiResult] = useState<VehicleAIScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [overrideConfirm, setOverrideConfirm] = useState(false)
  const [submitConflict, setSubmitConflict] = useState<ValidationConflict | null>(null)

  const scanConflict =
    aiResult?.validation_action === 'conflict' ? aiResult.conflict ?? null : null
  const conflict = submitConflict ?? scanConflict
  const action = submitConflict ? 'conflict' : aiResult?.validation_action
  const warnings = aiResult?.warnings

  const resetVerdict = () => { setAiResult(null); setError(null); setSubmitConflict(null); setOverrideConfirm(false) }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    resetVerdict()
  }

  const handleAiScan = async () => {
    if (!file) return
    setScanning(true); setError(null); setSubmitConflict(null); setOverrideConfirm(false)
    try {
      const result = await api.scanVehicleDocument(file, vdtId)
      setAiResult(result)
      if (result.issue_date) setIssueDate(result.issue_date)
      if (result.expiry_date) setExpiryDate(result.expiry_date)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar con IA')
    } finally { setScanning(false) }
  }

  const doSubmit = async (override: boolean) => {
    if (!isEdit && !file) { setError('Selecciona un archivo.'); return }
    setSaving(true); setError(null)
    try {
      if (isEdit) {
        await api.editVehicleDocument(docId!, {
          issue_date: issueDate || undefined,
          expiry_date: expiryDate || undefined,
          file: file ?? undefined,
          force_validation_override: override,
        })
      } else {
        await api.uploadVehicleDocument({
          vehicle_id: vehicleId,
          vehicle_document_type_id: vdtId,
          issue_date: issueDate || undefined,
          expiry_date: expiryDate || undefined,
          file: file!,
          force_validation_override: override,
        })
      }
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      const httpStatus = (err as { httpStatus?: number }).httpStatus
      const c = deriveConflict((err as { detail?: unknown }).detail)
      if (httpStatus === 409 && c) {
        setSubmitConflict(c)
        setOverrideConfirm(false)
      } else {
        setError(msg)
      }
    } finally { setSaving(false) }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (conflict) return
    doSubmit(false)
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
      {error && !conflict && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-red-50 border border-red-300">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-xs font-bold text-red-700 mb-0.5">No se pudo subir</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Veredicto combinado de IA (solo tipo en vehículos) */}
      <ValidationNotice action={action} warnings={warnings} conflict={conflict} />

      {aiResult && !error && !conflict && action !== 'warn' && (
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
            <select value={vdtId} onChange={(e) => { setVdtId(Number(e.target.value)); resetVerdict() }} className={INPUT}>
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

      {conflict ? (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={overrideConfirm}
              onChange={(e) => setOverrideConfirm(e.target.checked)}
              className="mt-0.5 accent-red-600"
            />
            <span>Revisé el documento y quiero {isEdit ? 'guardarlo' : 'subirlo'} de todas formas.</span>
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancelar</button>
            <button
              type="button"
              onClick={() => doSubmit(true)}
              disabled={saving || !overrideConfirm}
              className="px-3 py-1.5 text-xs font-semibold rounded-none bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando…' : (isEdit ? 'Guardar de todas formas' : 'Subir de todas formas')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancelar</button>
          <button type="submit" disabled={saving} className={submitClass}>
            {saving ? (isEdit ? 'Guardando…' : 'Subiendo…') : (isEdit ? 'Guardar cambios' : 'Subir documento')}
          </button>
        </div>
      )}
    </form>
  )
}
