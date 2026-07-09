'use client'

import { useState } from 'react'
import { api } from '@/lib/api'

export function ReviewForm({
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
