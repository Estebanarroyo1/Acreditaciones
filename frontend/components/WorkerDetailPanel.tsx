'use client'

import { useRef, useState } from 'react'
import type { AccreditationStatus, DocCheckStatus, DocumentCheck, Worker } from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from './TrafficLightBadge'
import { DocumentPreviewModal } from './DocumentPreviewModal'

// ── Status maps ────────────────────────────────────────────────────────────
const ROW_ACCENT: Record<DocCheckStatus, string> = {
  ok:             'border-l-[3px] border-l-green-400',
  expiring_soon:  'border-l-[3px] border-l-amber-400',
  expired:        'border-l-[3px] border-l-red-500',
  missing:        'border-l-[3px] border-l-slate-300',
  pending_review: 'border-l-[3px] border-l-blue-400',
}

const STATUS_CHIP: Record<DocCheckStatus, { label: string; cls: string }> = {
  ok:             { label: 'Vigente',      cls: 'bg-green-100  text-green-700  border-green-200'  },
  expiring_soon:  { label: 'Por vencer',   cls: 'bg-amber-100  text-amber-700  border-amber-200'  },
  expired:        { label: 'Vencido',      cls: 'bg-red-100    text-red-700    border-red-200'    },
  missing:        { label: 'Faltante',     cls: 'bg-slate-100  text-slate-600  border-slate-200'  },
  pending_review: { label: 'En revisión',  cls: 'bg-blue-100   text-blue-700   border-blue-200'   },
}

// ── Edit inline form ───────────────────────────────────────────────────────
function EditForm({
  docId,
  currentExpiryDate,
  onSuccess,
  onCancel,
}: {
  docId: number
  currentExpiryDate: string | null
  onSuccess: () => void
  onCancel: () => void
}) {
  const [expiryDate, setExpiryDate] = useState(currentExpiryDate ?? '')
  const [issueDate, setIssueDate]   = useState('')
  const [file, setFile]             = useState<File | null>(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.editDocument(docId, {
        expiry_date: expiryDate || undefined,
        issue_date:  issueDate  || undefined,
        file:        file       ?? undefined,
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
      className="mt-2 p-3 rounded-md bg-amber-50 border border-amber-200 space-y-3"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Editar documento</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Fecha emisión
          </label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="mt-0.5 w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Fecha vencimiento
          </label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="mt-0.5 w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
          Reemplazar archivo (opcional)
        </label>
        <div className="mt-0.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
            {file ? file.name : 'Adjuntar nuevo archivo'}
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <button type="button" onClick={() => setFile(null)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">
              ✕
            </button>
          )}
        </div>
        {file && (
          <p className="mt-1 text-[10px] text-amber-700">
            El estado del documento volverá a &ldquo;En revisión&rdquo; al subir un nuevo archivo.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
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

// ── Upload inline form ─────────────────────────────────────────────────────
function UploadForm({
  doc,
  workerId,
  projectId,
  onSuccess,
}: {
  doc: DocumentCheck
  workerId: number
  projectId: number
  onSuccess: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [issueDate, setIssueDate] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await api.uploadDocument({
        worker_id: workerId,
        project_id: projectId,
        document_type_id: doc.document_type_id,
        issue_date: issueDate || undefined,
        file,
      })
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
      className="mt-2 p-3 rounded-md bg-white border border-slate-200 space-y-2.5 shadow-sm"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
          {file ? file.name : 'Adjuntar archivo'}
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] text-slate-400 shrink-0">Emisión:</label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!file || uploading}
        className="w-full py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? 'Subiendo…' : 'Confirmar subida'}
      </button>
    </form>
  )
}

// ── Document row ───────────────────────────────────────────────────────────
function DocRow({
  doc,
  workerId,
  projectId,
  onRefresh,
  onPreview,
}: {
  doc: DocumentCheck
  workerId: number
  projectId: number
  onRefresh: () => void
  onPreview: (docId: number, label: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const chip = STATUS_CHIP[doc.check_status]
  const canUpload = doc.check_status !== 'ok' && doc.check_status !== 'pending_review'
  const hasDoc = !!doc.worker_document_id

  return (
    <div className={`bg-white border border-slate-200 rounded-md overflow-hidden shadow-sm ${ROW_ACCENT[doc.check_status]}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-800 truncate">{doc.document_type_name}</span>
            {!doc.is_mandatory && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                Opcional
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] text-slate-400 capitalize">{doc.category}</span>
            {doc.expiry_date && (
              <span className="text-[11px] text-slate-400">
                Vence: {new Date(doc.expiry_date + 'T12:00:00').toLocaleDateString('es-CL')}
              </span>
            )}
            {doc.days_until_expiry !== null && doc.days_until_expiry >= 0 && (
              <span className={`text-[11px] font-semibold ${doc.days_until_expiry <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                {doc.days_until_expiry === 0 ? '¡Vence hoy!' : `${doc.days_until_expiry}d restantes`}
              </span>
            )}
            {doc.days_until_expiry !== null && doc.days_until_expiry < 0 && (
              <span className="text-[11px] font-semibold text-red-600">
                Venció hace {Math.abs(doc.days_until_expiry)}d
              </span>
            )}
          </div>
        </div>

        {/* Status + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${chip.cls}`}>
            {chip.label}
          </span>
          {hasDoc && (
            <button
              onClick={() => onPreview(doc.worker_document_id!, doc.document_type_name)}
              title="Ver documento"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          {hasDoc && (
            <button
              onClick={() => { setShowEdit((v) => !v); setShowForm(false) }}
              title="Editar"
              className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          )}
          {canUpload && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Subir
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="px-3 pb-3">
          <UploadForm
            doc={doc}
            workerId={workerId}
            projectId={projectId}
            onSuccess={() => { setShowForm(false); onRefresh() }}
          />
        </div>
      )}

      {showEdit && doc.worker_document_id && (
        <div className="px-3 pb-3">
          <EditForm
            docId={doc.worker_document_id}
            currentExpiryDate={doc.expiry_date}
            onSuccess={() => { setShowEdit(false); onRefresh() }}
            onCancel={() => setShowEdit(false)}
          />
        </div>
      )}
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────
interface PanelProps {
  worker: Worker | null
  projectId: number | null
  projectName: string
  accreditation: AccreditationStatus | null
  isOpen: boolean
  onClose: () => void
  onRefresh: (workerId: number, projectId: number) => void
}

export function WorkerDetailPanel({
  worker,
  projectId,
  projectName,
  accreditation,
  isOpen,
  onClose,
  onRefresh,
}: PanelProps) {
  const [previewDocId, setPreviewDocId] = useState<number | null>(null)
  const [previewLabel, setPreviewLabel] = useState('')

  if (!worker || projectId === null) return null

  const globalDocs  = accreditation?.documents.filter((d) => d.is_global) ?? []
  const projectDocs = accreditation?.documents.filter((d) => !d.is_global) ?? []

  const light = accreditation?.traffic_light
  const bannerCls =
    light === 'green'  ? 'bg-green-50  border-green-200  text-green-800'  :
    light === 'yellow' ? 'bg-amber-50  border-amber-200  text-amber-800'  :
    light === 'red'    ? 'bg-red-50    border-red-200    text-red-800'    :
    'bg-slate-50 border-slate-200 text-slate-700'

  return (
    <>
      <DocumentPreviewModal
        docId={previewDocId}
        label={previewLabel}
        onClose={() => setPreviewDocId(null)}
      />

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[500px] flex flex-col
          bg-white/95 backdrop-blur-xl border-l border-slate-200 shadow-2xl
          transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 bg-zinc-900 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-0.5">
              {projectName}
            </p>
            <h2 className="text-base font-bold text-white truncate">
              {worker.first_name} {worker.last_name}
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-zinc-400 font-mono">DNI {worker.dni}</span>
              {worker.email && <span className="text-xs text-zinc-500 truncate">{worker.email}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Accreditation banner */}
        {accreditation && (
          <div className={`flex items-center gap-3 px-5 py-3 border-b ${bannerCls} shrink-0`}>
            <TrafficLightBadge status={accreditation.traffic_light} size="md" showLabel />
            <p className="text-xs flex-1 leading-relaxed">{accreditation.summary}</p>
          </div>
        )}

        {/* Document list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
          {accreditation ? (
            <>
              {/* Global */}
              {globalDocs.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Base empresa ({globalDocs.length})
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    {globalDocs.map((doc) => (
                      <DocRow
                        key={doc.document_type_id}
                        doc={doc}
                        workerId={worker.id}
                        projectId={projectId}
                        onRefresh={() => onRefresh(worker.id, projectId)}
                        onPreview={(id, label) => { setPreviewLabel(label); setPreviewDocId(id) }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Project-specific */}
              {projectDocs.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {projectName} ({projectDocs.length})
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    {projectDocs.map((doc) => (
                      <DocRow
                        key={doc.document_type_id}
                        doc={doc}
                        workerId={worker.id}
                        projectId={projectId}
                        onRefresh={() => onRefresh(worker.id, projectId)}
                        onPreview={(id, label) => { setPreviewLabel(label); setPreviewDocId(id) }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {globalDocs.length === 0 && projectDocs.length === 0 && (
                <div className="flex items-center justify-center h-32 text-sm text-slate-400">
                  Sin requisitos configurados para este proyecto.
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400">
              <span className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-2" />
              <p className="text-xs">Cargando documentos…</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <p className="text-[10px] text-slate-400 text-center">
            {accreditation
              ? `Evaluado: ${new Date(accreditation.evaluated_at).toLocaleString('es-CL')}`
              : 'Cargando evaluación…'}
          </p>
        </div>
      </div>
    </>
  )
}
