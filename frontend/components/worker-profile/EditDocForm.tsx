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
  const hasValidity = !!validityDays && validityDays > 0
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState(hasValidity ? '' : currentExpiryDate ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const computedExpiry = hasValidity && issueDate ? addDays(issueDate, validityDays as number) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.editDocument(docId, {
        issue_date: issueDate || undefined,
        // Con vigencia el backend recalcula el vencimiento; sin vigencia es manual.
        expiry_date: hasValidity ? undefined : expiryDate || undefined,
        file: file ?? undefined,
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
      className="mt-3 p-3 rounded-md bg-amber-50 border border-amber-200 space-y-3"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Editar documento</p>

      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Fecha emisión
          </label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="mt-0.5 block text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>

        {hasValidity ? (
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Vence el <span className="normal-case font-normal text-slate-400">(vigencia {validityDays}d)</span>
            </label>
            <p className="mt-0.5 text-xs font-semibold text-slate-700 py-1.5">
              {computedExpiry ? (
                formatDMY(computedExpiry)
              ) : currentExpiryDate ? (
                <span className="text-slate-500 font-normal">
                  Actual: {formatDMY(currentExpiryDate)} (cambia la emisión para recalcular)
                </span>
              ) : (
                <span className="text-slate-400 font-normal">— (ingresa la emisión)</span>
              )}
            </p>
          </div>
        ) : (
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Fecha vencimiento
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="mt-0.5 block text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
          </div>
        )}

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
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs text-slate-400 hover:text-red-500"
              >
                ✕
              </button>
            )}
          </div>
          {file && (
            <p className="mt-1 text-[10px] text-amber-700">Estado volverá a &ldquo;En revisión&rdquo;.</p>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
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
