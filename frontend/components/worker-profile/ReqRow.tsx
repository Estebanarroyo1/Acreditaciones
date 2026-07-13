'use client'

import { useState } from 'react'
import type { DocCheckStatus } from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from '../TrafficLightBadge'
import { ROW_LEFT, CATEGORY_LABELS } from './utils'
import { UploadForm } from './UploadForm'
import { EditDocForm } from './EditDocForm'
import { ReviewForm } from './ReviewForm'
import { usePermissions } from '@/lib/permissions'

export function ReqRow({
  dtId,
  dtName,
  category,
  checkStatus,
  validityDays,
  expiryDate,
  daysUntilExpiry,
  isMandatory,
  workerDocumentId,
  workerId,
  projectIds,
  isGlobal,
  onRefresh,
  onPreview,
}: {
  dtId: number
  dtName: string
  category: string
  checkStatus: DocCheckStatus
  validityDays?: number | null
  expiryDate: string | null
  daysUntilExpiry: number | null
  isMandatory?: boolean
  workerDocumentId?: number | null
  workerId: number
  projectIds: number[]
  isGlobal?: boolean
  onRefresh: () => void
  onPreview: (docId: number, label: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [archiveConfirm, setArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const needsUpload = checkStatus !== 'ok' && checkStatus !== 'pending_review'
  const hasDoc = !!workerDocumentId
  const isPendingReview = checkStatus === 'pending_review'
  const { canWrite } = usePermissions()

  const handleArchive = async () => {
    if (!workerDocumentId) return
    setArchiving(true)
    try {
      await api.archiveWorkerDocument(workerDocumentId)
      onRefresh()
    } finally {
      setArchiving(false)
      setArchiveConfirm(false)
    }
  }

  return (
    <div className={`rounded-lg border bg-white ${ROW_LEFT[checkStatus]} overflow-hidden`}>
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Traffic light */}
        <TrafficLightBadge status={checkStatus} showLabel />

        {/* Doc info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 truncate">{dtName}</span>
            {isMandatory === false && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">Opcional</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-slate-500">{CATEGORY_LABELS[category] ?? category}</span>
            {expiryDate && (
              <span className="text-xs text-slate-500">
                Vence: {new Date(expiryDate + 'T12:00:00').toLocaleDateString('es-CL')}
              </span>
            )}
            {daysUntilExpiry !== null && daysUntilExpiry >= 0 && (
              <span className={`text-xs font-medium ${daysUntilExpiry <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                {daysUntilExpiry === 0 ? '¡Vence hoy!' : `${daysUntilExpiry}d restantes`}
              </span>
            )}
            {daysUntilExpiry !== null && daysUntilExpiry < 0 && (
              <span className="text-xs font-medium text-red-600">
                Venció hace {Math.abs(daysUntilExpiry)}d
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {hasDoc && (
            <button
              onClick={() => onPreview(workerDocumentId!, dtName)}
              title="Ver documento"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          {hasDoc && canWrite('trabajadores') && (
            <button
              onClick={() => { setShowEdit((v) => !v); setShowForm(false); setShowReview(false) }}
              title="Editar fechas o reemplazar archivo"
              className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          )}
          {isPendingReview && hasDoc && canWrite('trabajadores') && (
            <button
              onClick={() => { setShowReview((v) => !v); setShowEdit(false); setShowForm(false) }}
              title="Aprobar o rechazar documento"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                showReview
                  ? 'bg-slate-700 text-white border-slate-800'
                  : 'bg-slate-900 text-white hover:bg-slate-700 border-slate-900'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Revisar
            </button>
          )}
          {needsUpload && (isGlobal || projectIds.length > 0) && canWrite('trabajadores') && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              {checkStatus === 'missing' ? 'Subir' : 'Actualizar'}
            </button>
          )}
          {hasDoc && !archiveConfirm && canWrite('trabajadores') && (
            <button
              onClick={() => { setArchiveConfirm(true); setShowEdit(false); setShowForm(false); setShowReview(false) }}
              title="Archivar documento"
              className="p-1.5 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Archive confirmation strip */}
      {archiveConfirm && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border-t border-slate-200">
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">¿Archivar este documento?</span>{' '}
            Quedará excluido de la acreditación activa pero conservado para auditoría.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setArchiveConfirm(false)}
              disabled={archiving}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-slate-700 text-white hover:bg-slate-900 disabled:opacity-50 transition-colors"
            >
              {archiving ? 'Archivando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="px-4 pb-4">
          <UploadForm
            workerId={workerId}
            projectIds={projectIds}
            documentTypeId={dtId}
            validityDays={validityDays}
            isGlobal={isGlobal}
            onSuccess={() => { setShowForm(false); onRefresh() }}
          />
        </div>
      )}

      {showEdit && workerDocumentId && (
        <div className="px-4 pb-4">
          <EditDocForm
            docId={workerDocumentId}
            currentExpiryDate={expiryDate}
            validityDays={validityDays}
            onSuccess={() => { setShowEdit(false); onRefresh() }}
            onCancel={() => setShowEdit(false)}
          />
        </div>
      )}

      {showReview && workerDocumentId && (
        <div className="px-4 pb-4">
          <ReviewForm
            docId={workerDocumentId}
            onSuccess={() => { setShowReview(false); onRefresh() }}
            onCancel={() => setShowReview(false)}
          />
        </div>
      )}
    </div>
  )
}
