'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type {
  ArchivedProjectProfile,
  AssignedProjectProfile,
  DocCheckStatus,
  GlobalRequirementCheck,
  ProjectSpecificCheck,
  TrafficLight,
  WorkerAIScanResult,
  WorkerFullProfile,
} from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from './TrafficLightBadge'
import { DocumentPreviewModal } from './DocumentPreviewModal'

// ── Status helpers ─────────────────────────────────────────────────────────
const ROW_LEFT: Record<DocCheckStatus, string> = {
  ok: 'border-l-4 border-l-green-400',
  expiring_soon: 'border-l-4 border-l-amber-400',
  expired: 'border-l-4 border-l-red-500',
  missing: 'border-l-4 border-l-slate-300',
  pending_review: 'border-l-4 border-l-blue-400',
}
const CATEGORY_LABELS: Record<string, string> = {
  medical: 'Médico',
  background: 'Antecedentes',
  certification: 'Certificación',
  training: 'Capacitación',
  legal: 'Legal',
  other: 'Otro',
}

// ── Expiry status helper (shared by upload + edit forms) ──────────────────
function getExpiryStatus(expiry: string): { type: 'blocked' | 'warning' | 'ok'; msg: string } {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [y, m, d] = expiry.split('-')
  const fmt = `${d}-${m}-${y}`
  if (expiry < todayStr) {
    return { type: 'blocked', msg: `Bloqueo del sistema: El documento ya se encuentra vencido. Fecha de caducidad: ${fmt}. No se permite su ingreso.` }
  }
  const daysLeft = Math.round(
    (new Date(expiry + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86400000
  )
  if (daysLeft <= 30) {
    const when = daysLeft === 0 ? 'hoy mismo' : `en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}`
    return { type: 'warning', msg: `Atención: Este documento vence ${when} (${fmt}). Verifica la fecha de emisión antes de guardar.` }
  }
  return { type: 'ok', msg: '' }
}

// ── Inline edit form ───────────────────────────────────────────────────────
function EditDocForm({
  docId,
  currentExpiryDate,
  validityDays,
  onSuccess,
  onCancel,
}: {
  docId: number
  currentExpiryDate: string | null
  validityDays?: number | null
  onSuccess: () => void
  onCancel: () => void
}) {
  const [expiryDate, setExpiryDate] = useState(currentExpiryDate ?? '')
  const [issueDate, setIssueDate]   = useState('')
  const [file, setFile]             = useState<File | null>(null)
  const [saving, setSaving]         = useState(false)
  const [scanning, setScanning]     = useState(false)
  const [aiResult, setAiResult]     = useState<WorkerAIScanResult | null>(null)
  const [scanNoResults, setScanNoResults] = useState(false)
  const [error, setError]           = useState('')
  const [blockedError, setBlockedError] = useState('')
  const [expiryWarning, setExpiryWarning] = useState('')
  const [suggestedExpiry, setSuggestedExpiry] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const checkExpiryStatus = (expiry: string) => {
    const st = getExpiryStatus(expiry)
    setBlockedError(st.type === 'blocked' ? st.msg : '')
    setExpiryWarning(st.type === 'warning' ? st.msg : '')
  }

  const acceptSuggestion = () => {
    if (!suggestedExpiry) return
    setExpiryDate(suggestedExpiry)
    checkExpiryStatus(suggestedExpiry)
    setSuggestedExpiry(null)
  }

  const handleAiScan = async () => {
    if (!file) return
    setScanning(true)
    setError('')
    setBlockedError('')
    setExpiryWarning('')
    setSuggestedExpiry(null)
    setScanNoResults(false)
    try {
      const result = await api.scanWorkerDocument(file, validityDays)
      setAiResult(result)
      const foundAny = !!(result.issue_date || result.expiry_date)
      setScanNoResults(!foundAny)
      if (result.issue_date) setIssueDate(result.issue_date)
      if (result.expiry_date) {
        if (result.expiry_computed) {
          setSuggestedExpiry(result.expiry_date)
        } else {
          setExpiryDate(result.expiry_date)
          checkExpiryStatus(result.expiry_date)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar con IA')
    } finally {
      setScanning(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setBlockedError('')
    setExpiryWarning('')
    try {
      await api.editDocument(docId, {
        expiry_date: expiryDate || undefined,
        issue_date:  issueDate  || undefined,
        file:        file       ?? undefined,
      })
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      if ((err as { httpStatus?: number }).httpStatus === 400) {
        setBlockedError(msg)
        setFile(null)
        setAiResult(null)
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 p-3 rounded-md bg-amber-50 border border-amber-200 space-y-3"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Editar documento</p>

      {blockedError && (
        <div className="bg-red-50 border-l-4 border-red-600 text-red-800 p-3 rounded-sm text-sm font-medium">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <span>{blockedError}</span>
          </div>
        </div>
      )}

      {expiryWarning && (
        <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 px-3 py-2 rounded-sm text-xs flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>{expiryWarning}</span>
        </div>
      )}

      {aiResult && !scanNoResults && !error && !blockedError && (
        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-violet-50 border border-violet-200 rounded text-xs text-violet-700">
          <svg className="w-3.5 h-3.5 shrink-0 text-violet-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span>
            <strong>IA encontró datos</strong>
            {aiResult.document_type_detected && <span className="ml-1">— {aiResult.document_type_detected}</span>}.
            Revisa y confirma antes de guardar.
          </span>
        </div>
      )}

      {scanNoResults && !error && (
        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
          <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <span>La IA no pudo extraer fechas de este documento. Ingresa las fechas manualmente.</span>
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Fecha emisión {aiResult?.issue_date && <span className="text-violet-500 normal-case font-normal">(IA)</span>}
          </label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="mt-0.5 block text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Fecha vencimiento {aiResult?.expiry_date && !aiResult.expiry_computed && (
              <span className="text-violet-500 normal-case font-normal">(IA)</span>
            )}
          </label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => {
              const val = e.target.value
              setExpiryDate(val)
              setBlockedError('')
              setExpiryWarning('')
              if (val) checkExpiryStatus(val)
            }}
            className="mt-0.5 block text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Nuevo archivo (opcional)</label>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {file ? file.name : 'Adjuntar'}
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setAiResult(null); setBlockedError(''); setExpiryWarning(''); setSuggestedExpiry(null); setScanNoResults(false); setError('') }}
            />
            {file && !scanning && (
              <button
                type="button"
                onClick={handleAiScan}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-violet-100 text-violet-700 border border-violet-200 hover:bg-violet-200 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                Analizar con IA
              </button>
            )}
            {scanning && <span className="text-xs text-violet-600 animate-pulse">Analizando…</span>}
            {file && (
              <button type="button" onClick={() => { setFile(null); setAiResult(null); setBlockedError('') }} className="text-xs text-slate-400 hover:text-red-500">✕</button>
            )}
          </div>
          {file && (
            <p className="mt-1 text-[10px] text-amber-700">Estado volverá a "En revisión".</p>
          )}
        </div>
      </div>
      {suggestedExpiry && (
        <div className="bg-amber-50 border border-amber-300 rounded px-3 py-2.5 text-xs text-amber-900 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">No se encontró fecha de vencimiento en el documento</p>
            <p className="mt-0.5">Según la vigencia configurada ({validityDays} días), vencería el{' '}
              <strong>{(() => { const [y,m,d] = suggestedExpiry.split('-'); return `${d}-${m}-${y}` })()}</strong>.
            </p>
          </div>
          <div className="flex gap-2 shrink-0 mt-0.5">
            <button type="button" onClick={acceptSuggestion} className="px-2.5 py-1.5 text-xs font-bold bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors">Usar</button>
            <button type="button" onClick={() => setSuggestedExpiry(null)} className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-amber-400 text-amber-700 rounded hover:bg-amber-50 transition-colors">Ignorar</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !!blockedError}
          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ── Inline review form ─────────────────────────────────────────────────────
function ReviewForm({
  docId,
  onSuccess,
  onCancel,
}: {
  docId: number
  onSuccess: () => void
  onCancel: () => void
}) {
  const [action, setAction] = useState<'approved' | 'rejected' | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!action) return
    if (action === 'rejected' && !notes.trim()) {
      setError('Agrega un comentario para indicar el motivo del rechazo.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.reviewDocument(docId, {
        status: action,
        reviewer_notes: notes.trim() || undefined,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 p-3 rounded-md bg-blue-50 border border-blue-200 space-y-3"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Revisar documento</p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setAction('approved'); setNotes('') }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
            action === 'approved'
              ? 'bg-green-600 text-white border-green-700'
              : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Aprobar
        </button>
        <button
          type="button"
          onClick={() => setAction('rejected')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
            action === 'rejected'
              ? 'bg-red-600 text-white border-red-700'
              : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Rechazar
        </button>
      </div>

      {action === 'rejected' && (
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Motivo del rechazo <span className="text-red-500">*</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Ej: Documento vencido, firma ilegible…"
            className="mt-0.5 block w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white resize-none"
          />
        </div>
      )}

      {action === 'approved' && (
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Comentario (opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Observaciones adicionales…"
            className="mt-0.5 block w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white resize-none"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !action}
          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Guardando…' : 'Confirmar revisión'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ── Inline upload form ─────────────────────────────────────────────────────
function UploadForm({
  workerId,
  projectIds,
  documentTypeId,
  validityDays,
  isGlobal,
  onSuccess,
}: {
  workerId: number
  projectIds: number[]
  documentTypeId: number
  validityDays?: number | null
  isGlobal?: boolean
  onSuccess: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [uploading, setUploading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [aiResult, setAiResult] = useState<WorkerAIScanResult | null>(null)
  const [scanNoResults, setScanNoResults] = useState(false)
  const [error, setError] = useState('')
  const [blockedError, setBlockedError] = useState('')
  const [expiryWarning, setExpiryWarning] = useState('')
  const [suggestedExpiry, setSuggestedExpiry] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const checkExpiryStatus = (expiry: string) => {
    const st = getExpiryStatus(expiry)
    setBlockedError(st.type === 'blocked' ? st.msg : '')
    setExpiryWarning(st.type === 'warning' ? st.msg : '')
  }

  const acceptSuggestion = () => {
    if (!suggestedExpiry) return
    setExpiryDate(suggestedExpiry)
    checkExpiryStatus(suggestedExpiry)
    setSuggestedExpiry(null)
  }

  const handleAiScan = async () => {
    if (!file) return
    setScanning(true)
    setError('')
    setBlockedError('')
    setExpiryWarning('')
    setSuggestedExpiry(null)
    setScanNoResults(false)
    try {
      const result = await api.scanWorkerDocument(file, validityDays)
      setAiResult(result)
      const foundAny = !!(result.issue_date || result.expiry_date)
      setScanNoResults(!foundAny)
      if (result.issue_date) setIssueDate(result.issue_date)
      if (result.expiry_date) {
        if (result.expiry_computed) {
          setSuggestedExpiry(result.expiry_date)
        } else {
          setExpiryDate(result.expiry_date)
          checkExpiryStatus(result.expiry_date)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar con IA')
    } finally {
      setScanning(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setError('')
    setBlockedError('')
    setExpiryWarning('')
    try {
      if (isGlobal) {
        await api.uploadDocument({
          worker_id: workerId,
          document_type_id: documentTypeId,
          issue_date: issueDate || undefined,
          expiry_date: expiryDate || undefined,
          file,
        })
      } else {
        await Promise.all(
          projectIds.map((pid) =>
            api.uploadDocument({
              worker_id: workerId,
              project_id: pid,
              document_type_id: documentTypeId,
              issue_date: issueDate || undefined,
              expiry_date: expiryDate || undefined,
              file,
            })
          )
        )
      }
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir'
      if ((err as { httpStatus?: number }).httpStatus === 400) {
        setBlockedError(msg)
        setFile(null)
        setAiResult(null)
      } else {
        setError(msg)
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 p-3 rounded-lg bg-white border border-dashed border-slate-300 space-y-3"
    >
      {!isGlobal && projectIds.length > 1 && (
        <p className="text-xs text-blue-600 font-medium">
          Se subirá a {projectIds.length} proyectos simultáneamente
        </p>
      )}

      {blockedError && (
        <div className="bg-red-50 border-l-4 border-red-600 text-red-800 p-3 rounded-sm text-sm font-medium">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <span>{blockedError}</span>
          </div>
        </div>
      )}

      {expiryWarning && (
        <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 px-3 py-2 rounded-sm text-xs flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>{expiryWarning}</span>
        </div>
      )}

      {aiResult && !scanNoResults && !error && !blockedError && (
        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-violet-50 border border-violet-200 rounded text-xs text-violet-700">
          <svg className="w-3.5 h-3.5 shrink-0 text-violet-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span>
            <strong>IA encontró datos</strong>
            {aiResult.document_type_detected && <span className="ml-1">— {aiResult.document_type_detected}</span>}.
            Revisa y confirma.
          </span>
        </div>
      )}

      {scanNoResults && !error && (
        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
          <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <span>La IA no pudo extraer fechas de este documento. Ingresa las fechas manualmente.</span>
        </div>
      )}

      {suggestedExpiry && (
        <div className="bg-amber-50 border border-amber-300 rounded px-3 py-2.5 text-xs text-amber-900 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">No se encontró fecha de vencimiento en el documento</p>
            <p className="mt-0.5">Según la vigencia configurada ({validityDays} días), vencería el{' '}
              <strong>{(() => { const [y,m,d] = suggestedExpiry.split('-'); return `${d}-${m}-${y}` })()}</strong>.
            </p>
          </div>
          <div className="flex gap-2 shrink-0 mt-0.5">
            <button type="button" onClick={acceptSuggestion} className="px-2.5 py-1.5 text-xs font-bold bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors">Usar</button>
            <button type="button" onClick={() => setSuggestedExpiry(null)} className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-amber-400 text-amber-700 rounded hover:bg-amber-50 transition-colors">Ignorar</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
          {file ? file.name : 'Seleccionar archivo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setAiResult(null); setBlockedError(''); setExpiryWarning(''); setSuggestedExpiry(null); setScanNoResults(false); setError('') }}
          accept=".pdf,.jpg,.jpeg,.png"
        />
        {file && !scanning && (
          <button
            type="button"
            onClick={handleAiScan}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-violet-100 text-violet-700 border border-violet-200 hover:bg-violet-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Analizar con IA
          </button>
        )}
        {scanning && <span className="text-xs text-violet-600 animate-pulse">Analizando…</span>}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 shrink-0">
            Fecha emisión: {aiResult?.issue_date && <span className="text-violet-500 ml-0.5">(IA)</span>}
          </label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 shrink-0">
            Fecha vencimiento: {expiryDate && aiResult && !aiResult.expiry_computed && (
              <span className="text-violet-500 ml-0.5">(IA)</span>
            )}
          </label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => {
              const val = e.target.value
              setExpiryDate(val)
              setBlockedError('')
              setExpiryWarning('')
              if (val) checkExpiryStatus(val)
            }}
            className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      <button
        type="submit"
        disabled={!file || uploading || !!blockedError}
        className="w-full py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? 'Subiendo…' : 'Subir documento'}
      </button>
    </form>
  )
}

// ── Archive worker confirmation dialog ──────────────────────────────────────
function ArchiveWorkerConfirmDialog({
  workerName,
  onConfirm,
  onCancel,
  archiving,
}: {
  workerName: string
  onConfirm: () => void
  onCancel: () => void
  archiving: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="text-base font-bold text-slate-900 mb-2">¿Archivar trabajador?</h3>
          <p className="text-sm text-slate-600 mb-1">
            <strong>{workerName}</strong> ya no aparecerá en las vistas activas del directorio ni en el semáforo global.
          </p>
          <p className="text-sm text-slate-500">
            Sus documentos permanecen intactos para el registro histórico y podrás restaurarlo más adelante.
          </p>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={archiving}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {archiving ? 'Archivando…' : 'Archivar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete worker confirmation dialog ───────────────────────────────────────
function DeleteWorkerConfirmDialog({
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
            Esta acción <strong>no se puede deshacer</strong>. Se eliminarán de forma permanente todos los datos de{' '}
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
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
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

// ── Bulk ZIP download button ────────────────────────────────────────────────
function DownloadZipButton({
  workerId,
  scope,
}: {
  workerId: number
  scope: { kind: 'global' } | { kind: 'project'; projectId: number }
}) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setDownloading(true)
    setError('')
    try {
      await api.downloadWorkerDocumentsZip(workerId, scope)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descargar')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); handleClick() }}
        disabled={downloading}
        title="Descargar todos los documentos en un ZIP"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        {downloading ? 'Descargando…' : 'Descargar Todos'}
      </button>
      {error && (
        <p className="absolute right-0 top-full mt-1 text-[10px] text-red-600 whitespace-nowrap bg-white px-1.5 py-0.5 rounded shadow-sm border border-red-100 z-10">
          {error}
        </p>
      )}
    </div>
  )
}

// ── Requirement row (shared for global + specific) ─────────────────────────
function ReqRow({
  dtId,
  dtName,
  category,
  checkStatus,
  validityDays,
  expiryDate,
  daysUntilExpiry,
  isMandatory,
  workerDocumentId,
  workerId,
  projectIds,
  isGlobal,
  onRefresh,
  onPreview,
}: {
  dtId: number
  dtName: string
  category: string
  checkStatus: DocCheckStatus
  validityDays?: number | null
  expiryDate: string | null
  daysUntilExpiry: number | null
  isMandatory?: boolean
  workerDocumentId?: number | null
  workerId: number
  projectIds: number[]
  isGlobal?: boolean
  onRefresh: () => void
  onPreview: (docId: number, label: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [archiveConfirm, setArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const needsUpload = checkStatus !== 'ok' && checkStatus !== 'pending_review'
  const hasDoc = !!workerDocumentId
  const isPendingReview = checkStatus === 'pending_review'

  const handleArchive = async () => {
    if (!workerDocumentId) return
    setArchiving(true)
    try {
      await api.archiveWorkerDocument(workerDocumentId)
      onRefresh()
    } finally {
      setArchiving(false)
      setArchiveConfirm(false)
    }
  }

  return (
    <div className={`rounded-lg border bg-white ${ROW_LEFT[checkStatus]} overflow-hidden`}>
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Traffic light */}
        <TrafficLightBadge status={checkStatus} showLabel />

        {/* Doc info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 truncate">{dtName}</span>
            {isMandatory === false && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">Opcional</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-slate-500">{CATEGORY_LABELS[category] ?? category}</span>
            {expiryDate && (
              <span className="text-xs text-slate-500">
                Vence: {new Date(expiryDate + 'T12:00:00').toLocaleDateString('es-CL')}
              </span>
            )}
            {daysUntilExpiry !== null && daysUntilExpiry >= 0 && (
              <span className={`text-xs font-medium ${daysUntilExpiry <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                {daysUntilExpiry === 0 ? '¡Vence hoy!' : `${daysUntilExpiry}d restantes`}
              </span>
            )}
            {daysUntilExpiry !== null && daysUntilExpiry < 0 && (
              <span className="text-xs font-medium text-red-600">
                Venció hace {Math.abs(daysUntilExpiry)}d
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {hasDoc && (
            <button
              onClick={() => onPreview(workerDocumentId!, dtName)}
              title="Ver documento"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          {hasDoc && (
            <button
              onClick={() => { setShowEdit((v) => !v); setShowForm(false); setShowReview(false) }}
              title="Editar fechas o reemplazar archivo"
              className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          )}
          {isPendingReview && hasDoc && (
            <button
              onClick={() => { setShowReview((v) => !v); setShowEdit(false); setShowForm(false) }}
              title="Aprobar o rechazar documento"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                showReview
                  ? 'bg-slate-700 text-white border-slate-800'
                  : 'bg-slate-900 text-white hover:bg-slate-700 border-slate-900'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Revisar
            </button>
          )}
          {needsUpload && (isGlobal || projectIds.length > 0) && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              {checkStatus === 'missing' ? 'Subir' : 'Actualizar'}
            </button>
          )}
          {hasDoc && !archiveConfirm && (
            <button
              onClick={() => { setArchiveConfirm(true); setShowEdit(false); setShowForm(false); setShowReview(false) }}
              title="Archivar documento"
              className="p-1.5 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Archive confirmation strip */}
      {archiveConfirm && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border-t border-slate-200">
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">¿Archivar este documento?</span>{' '}
            Quedará excluido de la acreditación activa pero conservado para auditoría.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setArchiveConfirm(false)}
              disabled={archiving}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-slate-700 text-white hover:bg-slate-900 disabled:opacity-50 transition-colors"
            >
              {archiving ? 'Archivando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="px-4 pb-4">
          <UploadForm
            workerId={workerId}
            projectIds={projectIds}
            documentTypeId={dtId}
            validityDays={validityDays}
            isGlobal={isGlobal}
            onSuccess={() => { setShowForm(false); onRefresh() }}
          />
        </div>
      )}

      {showEdit && workerDocumentId && (
        <div className="px-4 pb-4">
          <EditDocForm
            docId={workerDocumentId}
            currentExpiryDate={expiryDate}
            validityDays={validityDays}
            onSuccess={() => { setShowEdit(false); onRefresh() }}
            onCancel={() => setShowEdit(false)}
          />
        </div>
      )}

      {showReview && workerDocumentId && (
        <div className="px-4 pb-4">
          <ReviewForm
            docId={workerDocumentId}
            onSuccess={() => { setShowReview(false); onRefresh() }}
            onCancel={() => setShowReview(false)}
          />
        </div>
      )}
    </div>
  )
}

// ── Project accordion card ─────────────────────────────────────────────────
function ProjectCard({
  project,
  workerId,
  onRefresh,
  onPreview,
}: {
  project: AssignedProjectProfile
  workerId: number
  onRefresh: () => void
  onPreview: (docId: number, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const noSpecific = project.project_specific_requirements.length === 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Card header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <TrafficLightBadge status={project.traffic_light} size="md" showLabel />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{project.project_name}</p>
          {project.project_description && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{project.project_description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <DownloadZipButton workerId={workerId} scope={{ kind: 'project', projectId: project.project_id }} />
          <Link
            href={`/trabajadores/proyectos/${project.project_id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Ver proyecto →
          </Link>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded requirements */}
      {open && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50 space-y-2">
          {noSpecific ? (
            <p className="text-sm text-slate-400 text-center py-4 italic">
              Este proyecto no tiene requisitos específicos adicionales.
            </p>
          ) : (
            project.project_specific_requirements.map((req) => (
              <ReqRow
                key={req.document_type_id}
                dtId={req.document_type_id}
                dtName={req.document_type_name}
                category={req.category}
                checkStatus={req.check_status}
                expiryDate={req.expiry_date}
                daysUntilExpiry={req.days_until_expiry}
                isMandatory={req.is_mandatory}
                workerDocumentId={req.worker_document_id}
                workerId={workerId}
                projectIds={[project.project_id]}
                onRefresh={onRefresh}
                onPreview={onPreview}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Archived project card (read-only, with download links) ────────────────
function ArchivedProjectCard({
  project,
  onPreview,
}: {
  project: ArchivedProjectProfile
  onPreview: (docId: number, label: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm opacity-80">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-700 truncate">{project.project_name}</p>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Archivado</span>
          </div>
          {project.project_description && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{project.project_description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-400">{project.documents.length} docs</span>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50 space-y-2">
          {project.documents.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4 italic">Sin documentos registrados.</p>
          ) : (
            project.documents.map((doc) => (
              <div key={doc.document_type_id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white border border-slate-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{doc.document_type_name}</p>
                  <p className="text-xs text-slate-400">{CATEGORY_LABELS[doc.category] ?? doc.category}</p>
                  {doc.expiry_date && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Venció: {new Date(doc.expiry_date + 'T12:00:00').toLocaleDateString('es-CL')}
                    </p>
                  )}
                </div>
                {doc.worker_document_id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onPreview(doc.worker_document_id!, doc.document_type_name)}
                      title="Ver documento"
                      className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <a
                      href={api.getDocumentDownloadUrl(doc.worker_document_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Descargar
                    </a>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 shrink-0">Sin documento</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main WorkerProfile ─────────────────────────────────────────────────────
export function WorkerProfile({ workerId }: { workerId: number }) {
  const router = useRouter()
  const [profile, setProfile] = useState<WorkerFullProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewDocId, setPreviewDocId] = useState<number | null>(null)
  const [previewLabel, setPreviewLabel] = useState('')
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<'docs' | 'achs'>('docs')

  const handleArchive = async () => {
    setArchiving(true)
    try {
      await api.archiveWorker(workerId)
      router.push('/')
    } catch { /* silently ignore */ } finally {
      setArchiving(false)
      setShowArchiveDialog(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.deleteWorker(workerId)
      router.push('/')
    } catch { /* silently ignore */ } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const handleRestore = async () => {
    try {
      const updated = await api.restoreWorker(workerId)
      setProfile((prev) => (prev ? { ...prev, is_active: updated.is_active } : prev))
    } catch { /* silently ignore */ }
  }

  const handlePreview = (docId: number, label: string) => {
    setPreviewLabel(label)
    setPreviewDocId(docId)
  }

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.getWorkerFullProfile(workerId)
      setProfile(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el perfil')
    } finally {
      setLoading(false)
    }
  }, [workerId])

  useEffect(() => { loadProfile() }, [loadProfile])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="w-10 h-10 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Cargando perfil…</p>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-sm mb-4">{error || 'Trabajador no encontrado'}</p>
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Volver</Link>
        </div>
      </div>
    )
  }

  const allProjectIds = profile.assigned_projects.map((p) => p.project_id)
  const initials = `${profile.first_name[0] ?? ''}${profile.last_name[0] ?? ''}`.toUpperCase()

  // Global section: count issues
  const globalBad = profile.global_requirements.filter(
    (r) => r.check_status === 'missing' || r.check_status === 'expired'
  ).length
  const globalWarn = profile.global_requirements.filter(
    (r) => r.check_status === 'expiring_soon'
  ).length

  const regularDocs = profile.global_requirements.filter((r) => !r.is_achs)
  const achsExams = profile.global_requirements.filter((r) => r.is_achs && r.achs_category === 'EXAMEN')
  const achsCourses = profile.global_requirements.filter((r) => r.is_achs && r.achs_category === 'CURSO')

  return (
    <div className="min-h-screen bg-slate-50">
      <DocumentPreviewModal
        docId={previewDocId}
        label={previewLabel}
        onClose={() => setPreviewDocId(null)}
      />
      {showArchiveDialog && (
        <ArchiveWorkerConfirmDialog
          workerName={`${profile.first_name} ${profile.last_name}`}
          onConfirm={handleArchive}
          onCancel={() => setShowArchiveDialog(false)}
          archiving={archiving}
        />
      )}
      {showDeleteDialog && (
        <DeleteWorkerConfirmDialog
          workerName={`${profile.first_name} ${profile.last_name}`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
          deleting={deleting}
        />
      )}
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Volver al directorio
        </Link>

        {/* ── Worker header ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-sm border border-slate-300 overflow-hidden">
          <div className="bg-white border-b border-slate-200 px-6 py-5 flex items-center gap-5">
            <div className="w-14 h-14 rounded-sm bg-[#003f7a] flex items-center justify-center shrink-0">
              <span className="text-white text-xl font-bold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-800 truncate">
                  {profile.first_name} {profile.last_name}
                </h1>
                {!profile.is_active && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-sm bg-amber-100 text-amber-700 border border-amber-200">
                    Archivado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 flex-wrap">
                <span className="text-slate-500 text-sm font-mono">DNI: {profile.dni}</span>
                {profile.email && <span className="text-slate-500 text-sm">{profile.email}</span>}
                {profile.phone && <span className="text-slate-500 text-sm">{profile.phone}</span>}
              </div>
            </div>
            {profile.global_traffic_light && (
              <TrafficLightBadge status={profile.global_traffic_light} size="lg" showLabel />
            )}
            <div className="flex items-center gap-2 shrink-0">
              {profile.is_active ? (
                <button
                  onClick={() => setShowArchiveDialog(true)}
                  title="Archivar trabajador"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  Archivar
                </button>
              ) : (
                <button
                  onClick={handleRestore}
                  title="Restaurar trabajador"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                  </svg>
                  Restaurar
                </button>
              )}
              <button
                onClick={() => setShowDeleteDialog(true)}
                title="Eliminar trabajador permanentemente"
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-sm bg-white border border-slate-300 text-slate-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Eliminar
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
            <div className="px-5 py-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{profile.assigned_projects.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Proyectos</p>
            </div>
            <div className="px-5 py-4 text-center">
              <p className={`text-2xl font-bold ${globalBad > 0 ? 'text-red-600' : 'text-slate-800'}`}>{globalBad}</p>
              <p className="text-xs text-slate-500 mt-0.5">Doc. vencidos / faltantes</p>
            </div>
            <div className="px-5 py-4 text-center">
              <p className={`text-2xl font-bold ${globalWarn > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{globalWarn}</p>
              <p className="text-xs text-slate-500 mt-0.5">Por vencer</p>
            </div>
          </div>
        </div>

        {/* ── Tab strip ─────────────────────────────────────────────────── */}
        <div className="flex items-center border-b border-slate-200 bg-white">
          <button
            onClick={() => setActiveTab('docs')}
            className={`h-10 px-5 text-sm font-semibold border-b-2 transition-none whitespace-nowrap ${
              activeTab === 'docs'
                ? 'border-[#003f7a] text-[#003f7a] -mb-[1px]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            Documentos
          </button>
          <button
            onClick={() => setActiveTab('achs')}
            className={`h-10 px-5 text-sm font-semibold border-b-2 transition-none whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'achs'
                ? 'border-[#003f7a] text-[#003f7a] -mb-[1px]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-red-100 text-red-600">
              ACHS
            </span>
            Mutual
          </button>
        </div>

        {/* ── Documentos tab ─────────────────────────────────────────────── */}
        {activeTab === 'docs' && (
          <>
            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                <h2 className="text-base font-bold text-slate-800">Exámenes Obligatorios — Empresa</h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {regularDocs.length} requisitos
                </span>
                <div className="ml-auto">
                  <DownloadZipButton workerId={profile.worker_id} scope={{ kind: 'global' }} />
                </div>
              </div>
              {regularDocs.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
                  No hay requisitos globales configurados aún.
                </div>
              ) : (
                <div className="space-y-2">
                  {regularDocs.map((req) => (
                    <ReqRow
                      key={req.document_type_id}
                      dtId={req.document_type_id}
                      dtName={req.document_type_name}
                      category={req.category}
                      checkStatus={req.check_status}
                      validityDays={req.validity_days}
                      expiryDate={req.expiry_date}
                      daysUntilExpiry={req.days_until_expiry}
                      workerDocumentId={req.worker_document_id}
                      workerId={profile.worker_id}
                      projectIds={allProjectIds}
                      isGlobal
                      onRefresh={loadProfile}
                      onPreview={handlePreview}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-3 h-3 rounded-full bg-slate-400 shrink-0" />
                <h2 className="text-base font-bold text-slate-800">Proyectos Asignados</h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {profile.assigned_projects.length}
                </span>
              </div>
              {profile.assigned_projects.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
                  El trabajador no está asignado a ningún proyecto aún.
                </div>
              ) : (
                <div className="space-y-3">
                  {profile.assigned_projects.map((project) => (
                    <ProjectCard
                      key={project.project_id}
                      project={project}
                      workerId={profile.worker_id}
                      onRefresh={loadProfile}
                      onPreview={handlePreview}
                    />
                  ))}
                </div>
              )}
            </section>

            {profile.archived_projects.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0" />
                  <h2 className="text-base font-bold text-slate-500">Historial de Proyectos Archivados</h2>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {profile.archived_projects.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {profile.archived_projects.map((project) => (
                    <ArchivedProjectCard
                      key={project.project_id}
                      project={project}
                      onPreview={handlePreview}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── ACHS tab ───────────────────────────────────────────────────── */}
        {activeTab === 'achs' && (
          <div className="space-y-6">
            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                <h2 className="text-base font-bold text-slate-800">Exámenes Ocupacionales</h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {achsExams.length}
                </span>
                <div className="ml-auto">
                  <DownloadZipButton workerId={profile.worker_id} scope={{ kind: 'global' }} />
                </div>
              </div>
              {achsExams.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
                  No hay exámenes ocupacionales ACHS configurados. Crea un tipo de documento ACHS en{' '}
                  <strong>Configuración → Requisitos Globales</strong>.
                </div>
              ) : (
                <div className="space-y-2">
                  {achsExams.map((req) => (
                    <ReqRow
                      key={req.document_type_id}
                      dtId={req.document_type_id}
                      dtName={req.document_type_name}
                      category={req.category}
                      checkStatus={req.check_status}
                      validityDays={req.validity_days}
                      expiryDate={req.expiry_date}
                      daysUntilExpiry={req.days_until_expiry}
                      workerDocumentId={req.worker_document_id}
                      workerId={profile.worker_id}
                      projectIds={allProjectIds}
                      isGlobal
                      onRefresh={loadProfile}
                      onPreview={handlePreview}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                <h2 className="text-base font-bold text-slate-800">Cursos Realizados</h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {achsCourses.length}
                </span>
              </div>
              {achsCourses.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
                  No hay cursos ACHS configurados. Crea un tipo de documento ACHS en{' '}
                  <strong>Configuración → Requisitos Globales</strong>.
                </div>
              ) : (
                <div className="space-y-2">
                  {achsCourses.map((req) => (
                    <ReqRow
                      key={req.document_type_id}
                      dtId={req.document_type_id}
                      dtName={req.document_type_name}
                      category={req.category}
                      checkStatus={req.check_status}
                      validityDays={req.validity_days}
                      expiryDate={req.expiry_date}
                      daysUntilExpiry={req.days_until_expiry}
                      workerDocumentId={req.worker_document_id}
                      workerId={profile.worker_id}
                      projectIds={allProjectIds}
                      isGlobal
                      onRefresh={loadProfile}
                      onPreview={handlePreview}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

      </div>
    </div>
  )
}
