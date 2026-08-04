'use client'

import { useState } from 'react'
import type { ValidationConflict } from '@/lib/types'
import { api } from '@/lib/api'
import { ValidationNotice, deriveConflict } from '@/components/validation/ValidationNotice'
import { useDocumentAIScan } from './useDocumentAIScan'

export function UploadForm({
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
  const [uploading, setUploading] = useState(false)
  const [overrideConfirm, setOverrideConfirm] = useState(false)
  const [submitConflict, setSubmitConflict] = useState<ValidationConflict | null>(null)
  const {
    file, setFile,
    issueDate, setIssueDate,
    expiryDate, setExpiryDate,
    scanning,
    aiResult, setAiResult,
    scanNoResults, setScanNoResults,
    error, setError,
    blockedError, setBlockedError,
    expiryWarning, setExpiryWarning,
    suggestedExpiry, setSuggestedExpiry,
    inputRef,
    checkExpiryStatus,
    acceptSuggestion,
    handleAiScan,
  } = useDocumentAIScan({ validityDays, documentTypeId, workerId })

  // Conflicto = el del preview (/ai-scan) o el del 409 al subir.
  const scanConflict =
    aiResult?.validation_action === 'conflict' ? aiResult.conflict ?? null : null
  const conflict = submitConflict ?? scanConflict
  const action = submitConflict ? 'conflict' : aiResult?.validation_action
  const warnings = aiResult?.warnings

  const resetAiState = () => {
    setAiResult(null); setBlockedError(''); setExpiryWarning('')
    setSuggestedExpiry(null); setScanNoResults(false); setError('')
    setSubmitConflict(null); setOverrideConfirm(false)
  }

  const doUpload = async (override: boolean) => {
    if (!file) return
    setUploading(true)
    setError(''); setBlockedError(''); setExpiryWarning('')
    try {
      const base = {
        worker_id: workerId,
        document_type_id: documentTypeId,
        issue_date: issueDate || undefined,
        expiry_date: expiryDate || undefined,
        file,
        force_validation_override: override,
      }
      if (isGlobal) {
        await api.uploadDocument(base)
      } else {
        await Promise.all(projectIds.map((pid) => api.uploadDocument({ ...base, project_id: pid })))
      }
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir'
      const httpStatus = (err as { httpStatus?: number }).httpStatus
      const c = deriveConflict((err as { detail?: unknown }).detail)
      if (httpStatus === 409 && c) {
        // Conflicto de validación: abre la confirmación en vez de un error genérico.
        setSubmitConflict(c)
        setOverrideConfirm(false)
      } else if (httpStatus === 400) {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || conflict) return // con conflicto se usa "Subir de todas formas"
    doUpload(false)
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

      {/* Veredicto combinado de IA (aviso ámbar / conflicto rojo) */}
      <ValidationNotice action={action} warnings={warnings} conflict={conflict} />

      {expiryWarning && (
        <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 px-3 py-2 rounded-sm text-xs flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>{expiryWarning}</span>
        </div>
      )}

      {aiResult && !scanNoResults && !error && !blockedError && !conflict && action !== 'warn' && (
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
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); resetAiState() }}
          accept=".pdf,.jpg,.jpeg,.png"
        />
        {file && !scanning && (
          <button
            type="button"
            onClick={() => { setSubmitConflict(null); setOverrideConfirm(false); handleAiScan() }}
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

      {conflict ? (
        // Camino de conflicto: revisar archivo o confirmar explícitamente el override.
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={overrideConfirm}
              onChange={(e) => setOverrideConfirm(e.target.checked)}
              className="mt-0.5 accent-red-600"
            />
            <span>Revisé el documento y quiero subirlo de todas formas.</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { inputRef.current?.click() }}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Revisar archivo
            </button>
            <button
              type="button"
              onClick={() => doUpload(true)}
              disabled={!file || uploading || !overrideConfirm}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? 'Subiendo…' : 'Subir de todas formas'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={!file || uploading || !!blockedError}
          className="w-full py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'Subiendo…' : 'Subir documento'}
        </button>
      )}
    </form>
  )
}
