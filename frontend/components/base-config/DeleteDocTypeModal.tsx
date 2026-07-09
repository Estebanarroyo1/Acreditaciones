'use client'

import { useState } from 'react'
import type { DocumentType } from '@/lib/types'
import { api } from '@/lib/api'

export function DeleteDocTypeModal({
  docType,
  onClose,
  onDeleted,
}: {
  docType: DocumentType
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting]             = useState(false)
  const [integrityError, setIntegrityError] = useState('')
  const [error, setError]                   = useState('')

  const handleDelete = async () => {
    setDeleting(true)
    setIntegrityError('')
    setError('')
    try {
      await api.deleteDocumentType(docType.id)
      onDeleted()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar'
      if ((err as { httpStatus?: number }).httpStatus === 400) {
        setIntegrityError(msg)
      } else {
        setError(msg)
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!deleting ? onClose : undefined} />
      <div className="relative bg-white rounded-sm shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-white shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <h3 className="text-base font-bold text-white">Eliminar tipo de documento</h3>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-700">
            ¿Eliminar <strong>&ldquo;{docType.name}&rdquo;</strong>?{' '}
            El tipo dejará de aparecer en el sistema, pero los archivos históricos
            se conservarán para auditoría (soft delete).
          </p>

          {integrityError && (
            <div className="bg-red-50 border-l-4 border-red-600 text-red-800 p-3 rounded-sm text-sm">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <div>
                  <p className="font-semibold mb-0.5">Eliminación bloqueada</p>
                  <p className="font-normal text-xs leading-relaxed">{integrityError}</p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-sm px-3 py-2">{error}</p>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-2.5 text-sm font-semibold rounded-sm bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || !!integrityError}
            className="flex-1 py-2.5 text-sm font-semibold rounded-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            {deleting ? 'Eliminando…' : 'Confirmar eliminación'}
          </button>
        </div>
      </div>
    </div>
  )
}
