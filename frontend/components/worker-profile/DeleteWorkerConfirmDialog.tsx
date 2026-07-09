'use client'

import { useState } from 'react'

export function DeleteWorkerConfirmDialog({
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
