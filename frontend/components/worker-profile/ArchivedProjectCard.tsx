'use client'

import { useState } from 'react'
import type { ArchivedProjectProfile } from '@/lib/types'
import { api } from '@/lib/api'
import { CATEGORY_LABELS } from './utils'

export function ArchivedProjectCard({
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
                    <button
                      type="button"
                      onClick={() => api.downloadFile(api.getDocumentDownloadUrl(doc.worker_document_id!), doc.document_type_name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Descargar
                    </button>
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
