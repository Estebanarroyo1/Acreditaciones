'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { useDocumentAIScan } from './useDocumentAIScan'

export function EditDocForm({
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
  const [saving, setSaving] = useState(false)
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
  } = useDocumentAIScan({ validityDays, initialExpiryDate: currentExpiryDate ?? '' })

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
            <p className="mt-1 text-[10px] text-amber-700">Estado volverá a &ldquo;En revisión&rdquo;.</p>
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
