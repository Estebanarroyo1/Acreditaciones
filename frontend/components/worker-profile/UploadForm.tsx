'use client'

import { useRef, useState } from 'react'
import { api } from '@/lib/api'

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
  const [file, setFile] = useState<File | null>(null)
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const hasValidity = !!validityDays && validityDays > 0
  const computedExpiry = hasValidity && issueDate ? addDays(issueDate, validityDays as number) : null
  const canSubmit = !!file && !!issueDate && (hasValidity || !!expiryDate) && !uploading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !file) return
    setUploading(true)
    setError('')
    try {
      const base = {
        worker_id: workerId,
        document_type_id: documentTypeId,
        issue_date: issueDate || undefined,
        // Con vigencia el backend calcula el vencimiento; sin vigencia es manual.
        expiry_date: hasValidity ? undefined : expiryDate || undefined,
        file,
      }
      if (isGlobal) {
        await api.uploadDocument(base)
      } else {
        await Promise.all(projectIds.map((pid) => api.uploadDocument({ ...base, project_id: pid })))
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir')
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
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          accept=".pdf,.jpg,.jpeg,.png"
        />

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 shrink-0">Fecha emisión:</label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {hasValidity ? (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 shrink-0">Vence el:</label>
            {computedExpiry ? (
              <span className="text-xs font-semibold text-slate-700">{formatDMY(computedExpiry)}</span>
            ) : (
              <span className="text-xs text-slate-400">— (ingresa la emisión)</span>
            )}
            <span className="text-[10px] text-slate-400">(vigencia {validityDays} días)</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 shrink-0">Fecha vencimiento:</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? 'Subiendo…' : 'Subir documento'}
      </button>
    </form>
  )
}
