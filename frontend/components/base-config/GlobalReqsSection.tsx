'use client'

import { useState } from 'react'
import type { CreateDocumentTypePayload, DocumentCategory, DocumentType } from '@/lib/types'
import { api } from '@/lib/api'
import { DocTypeRow } from './DocTypeRow'
import { EditDocTypeModal } from './EditDocTypeModal'
import { DeleteDocTypeModal } from './DeleteDocTypeModal'
import { usePermissions } from '@/lib/permissions'

function TableHeader({ label, count, accent }: { label: string; count: number; accent: string }) {
  return (
    <div className={`px-5 py-3 border-b flex items-center justify-between ${accent}`}>
      <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <span className="text-xs font-semibold text-slate-400 tabular-nums">{count} registro{count !== 1 ? 's' : ''}</span>
    </div>
  )
}

export function GlobalReqsSection({
  docTypes,
  categories,
  onRefresh,
}: {
  docTypes: DocumentType[]
  categories: DocumentCategory[]
  onRefresh: () => void
}) {
  const globalDocuments   = docTypes.filter((d) => !d.is_achs && d.is_global_base_requirement)
  const specificDocuments = docTypes.filter((d) => !d.is_achs && !d.is_global_base_requirement)
  const achsDocuments     = docTypes.filter((d) => d.is_achs)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [validityDays, setValidityDays] = useState('')
  const [alertPct, setAlertPct] = useState('')
  const [isGlobal, setIsGlobal] = useState(true)
  const [isAchs, setIsAchs] = useState(false)
  const [achsCategory, setAchsCategory] = useState<'EXAMEN' | 'CURSO' | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [editingDoc, setEditingDoc] = useState<DocumentType | null>(null)
  const [deletingDoc, setDeletingDoc] = useState<DocumentType | null>(null)
  const { canWrite } = usePermissions()

  const resetForm = () => {
    setName(''); setCategoryId(''); setValidityDays(''); setAlertPct('')
    setIsGlobal(true); setIsAchs(false); setAchsCategory(''); setError('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (isAchs && !achsCategory) { setError('Selecciona el tipo de documento ACHS (Examen u Curso).'); return }
    setSubmitting(true)
    setError('')
    try {
      const payload: CreateDocumentTypePayload = {
        name: name.trim(),
        is_global_base_requirement: isGlobal,
      }
      if (categoryId) payload.category_id = parseInt(categoryId)
      if (validityDays) payload.validity_days = parseInt(validityDays)
      if (alertPct) payload.alert_percentage_override = parseInt(alertPct)
      if (isAchs) {
        payload.is_achs = true
        if (achsCategory) payload.achs_category = achsCategory
      }
      await api.createDocumentType(payload)
      resetForm()
      setShowForm(false)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleGlobal = async (dt: DocumentType) => {
    try {
      await api.updateDocumentType(dt.id, { is_global_base_requirement: !dt.is_global_base_requirement })
      onRefresh()
    } catch { /* silently ignore */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Catálogo de Tipos de Documentos</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Define y clasifica los documentos que el sistema gestionará para acreditación de personal.
          </p>
        </div>
        {canWrite('configuracion') && (
          <button
            onClick={() => { resetForm(); setShowForm((v) => !v) }}
            className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[#003f7a] text-white text-sm font-semibold rounded-sm hover:bg-[#005096] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            + Nuevo Tipo de Documento
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-slate-200 rounded-sm shadow-sm p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <p className="text-sm font-bold text-slate-800">Nuevo Tipo de Documento</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Nombre *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Examen Médico Anual"
                autoFocus
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-sm focus:outline-none focus:border-[#003f7a] focus:ring-1 focus:ring-[#003f7a]/20"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Categoría</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-sm focus:outline-none focus:border-[#003f7a] focus:ring-1 focus:ring-[#003f7a]/20 bg-white"
              >
                <option value="">Sin categoría</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Vigencia (días)</label>
              <input
                type="number"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                placeholder="365 (vacío = sin vencimiento)"
                min="1"
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-sm focus:outline-none focus:border-[#003f7a] focus:ring-1 focus:ring-[#003f7a]/20"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">% Alerta personalizado</label>
              <input
                type="number"
                value={alertPct}
                onChange={(e) => setAlertPct(e.target.value)}
                placeholder="Usa el global"
                min="1"
                max="100"
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-sm focus:outline-none focus:border-[#003f7a] focus:ring-1 focus:ring-[#003f7a]/20"
              />
            </div>
            <div className="flex items-center gap-3 pt-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <button
                  type="button"
                  onClick={() => setIsGlobal((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${isGlobal ? 'bg-blue-600' : 'bg-slate-300'}`}
                  role="switch" aria-checked={isGlobal}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${isGlobal ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-xs font-semibold text-slate-600">Requisito global</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-semibold text-slate-600">¿Documento ACHS / Mutual?</span>
              <button
                type="button"
                onClick={() => { setIsAchs((v) => !v); setAchsCategory('') }}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${isAchs ? 'bg-red-500' : 'bg-slate-300'}`}
                role="switch" aria-checked={isAchs}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${isAchs ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </label>
            {isAchs && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Tipo ACHS *</label>
                <select
                  value={achsCategory}
                  onChange={(e) => setAchsCategory(e.target.value as 'EXAMEN' | 'CURSO' | '')}
                  className="mt-1 block px-3 py-2 text-sm border border-slate-200 rounded-sm focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
                >
                  <option value="">Seleccionar tipo…</option>
                  <option value="EXAMEN">Examen Ocupacional</option>
                  <option value="CURSO">Curso</option>
                </select>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-600 text-red-800 px-3 py-2 rounded-sm text-xs">{error}</div>
          )}
          <div className="flex justify-end gap-3 pt-1 border-t border-slate-100">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-sm transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={submitting || !name.trim()}
              className="px-4 py-2 text-sm font-semibold bg-[#003f7a] text-white rounded-sm hover:bg-[#005096] disabled:opacity-50 transition-colors">
              {submitting ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm">
        <TableHeader label="Documentación Global (Obligatoria)" count={globalDocuments.length} accent="bg-blue-50 border-blue-100" />
        {globalDocuments.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            Ningún documento marcado como global. Crea uno con el botón de arriba o promueve uno existente.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {globalDocuments.map((dt) => (
              <DocTypeRow
                key={dt.id}
                docType={dt}
                onToggle={() => toggleGlobal(dt)}
                onEdit={() => setEditingDoc(dt)}
                onDelete={() => setDeletingDoc(dt)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm">
        <TableHeader label="Documentación Específica (Adicional)" count={specificDocuments.length} accent="bg-slate-50 border-slate-200" />
        {specificDocuments.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            Sin documentos específicos de proyecto. Se asignan a proyectos desde la pestaña{' '}
            <strong>Gestión de Proyectos</strong>.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {specificDocuments.map((dt) => (
              <DocTypeRow
                key={dt.id}
                docType={dt}
                onToggle={() => toggleGlobal(dt)}
                onEdit={() => setEditingDoc(dt)}
                onDelete={() => setDeletingDoc(dt)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm">
        <TableHeader label="Documentación ACHS / Mutual" count={achsDocuments.length} accent="bg-red-50 border-red-100" />
        {achsDocuments.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            Sin documentos ACHS configurados. Crea uno con el botón de arriba y activa la opción &ldquo;Documento ACHS&rdquo;.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {achsDocuments.map((dt) => (
              <DocTypeRow
                key={dt.id}
                docType={dt}
                showAchsBadge
                onToggle={() => toggleGlobal(dt)}
                onEdit={() => setEditingDoc(dt)}
                onDelete={() => setDeletingDoc(dt)}
              />
            ))}
          </div>
        )}
      </div>

      {editingDoc && (
        <EditDocTypeModal
          docType={editingDoc}
          categories={categories}
          onClose={() => setEditingDoc(null)}
          onSaved={() => { setEditingDoc(null); onRefresh() }}
        />
      )}
      {deletingDoc && (
        <DeleteDocTypeModal
          docType={deletingDoc}
          onClose={() => setDeletingDoc(null)}
          onDeleted={() => { setDeletingDoc(null); onRefresh() }}
        />
      )}
    </div>
  )
}
