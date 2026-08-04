'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/api'

interface Props {
  docId: number | null
  label: string
  onClose: () => void
}

export function DocumentPreviewModal({ docId, label, onClose }: Props) {
  // El archivo se descarga con el token (Bearer) y se muestra como object URL:
  // el iframe/enlace no pueden adjuntar el header en una navegación directa.
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!docId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [docId, onClose])

  useEffect(() => {
    if (!docId) return
    let active = true
    let created: string | null = null
    void (async () => {
      setLoading(true)
      setError('')
      setBlobUrl(null)
      try {
        const url = await api.fetchFileBlobUrl(api.getDocumentViewUrl(docId))
        if (!active) {
          URL.revokeObjectURL(url)
          return
        }
        created = url
        setBlobUrl(url)
        setLoading(false)
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'No se pudo cargar el documento.')
          setLoading(false)
        }
      }
    })()
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [docId])

  if (typeof document === 'undefined' || !docId) return null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-5xl h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50 rounded-t-xl shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="text-sm font-medium text-slate-700 truncate">{label}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            {blobUrl && (
              <a
                href={blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Abrir en nueva pestaña
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500 hover:text-slate-800"
              aria-label="Cerrar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden rounded-b-xl bg-slate-100">
          {loading && (
            <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
              Cargando documento…
            </div>
          )}
          {error && !loading && (
            <div className="w-full h-full flex items-center justify-center px-6 text-center text-sm text-red-600">
              {error}
            </div>
          )}
          {blobUrl && !loading && !error && (
            <iframe src={blobUrl} className="w-full h-full border-0" title={label} />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
