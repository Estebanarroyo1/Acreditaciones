'use client'

import { useState } from 'react'
import { api } from '@/lib/api'

export function DownloadZipButton({
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
