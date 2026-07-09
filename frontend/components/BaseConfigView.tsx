'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type {
  CreateDocumentTypePayload,
  DocumentCategory,
  DocumentType,
  Project,
  ProjectRequirement,
} from '@/lib/types'
import { api } from '@/lib/api'
import { AlertSettingsPanel } from './AlertSettingsPanel'

// ── CategoriesSection ──────────────────────────────────────────────────────
function CategoriesSection({
  categories,
  onRefresh,
}: {
  categories: DocumentCategory[]
  onRefresh: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DocumentCategory | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({})

  const openCreate = () => {
    setEditing(null)
    setName('')
    setDescription('')
    setError('')
    setShowForm(true)
  }

  const openEdit = (cat: DocumentCategory) => {
    setEditing(cat)
    setName(cat.name)
    setDescription(cat.description ?? '')
    setError('')
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError('')
    try {
      if (editing) {
        await api.updateDocumentCategory(editing.id, {
          name: name.trim(),
          description: description.trim() || undefined,
        })
      } else {
        await api.createDocumentCategory({
          name: name.trim(),
          description: description.trim() || undefined,
        })
      }
      setShowForm(false)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (cat: DocumentCategory) => {
    setDeleting(cat.id)
    setDeleteErrors((prev) => ({ ...prev, [cat.id]: '' }))
    try {
      await api.deleteDocumentCategory(cat.id)
      onRefresh()
    } catch (err) {
      setDeleteErrors((prev) => ({
        ...prev,
        [cat.id]: err instanceof Error ? err.message : 'Error al eliminar',
      }))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-5 py-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-violet-900">Categorías de Documentos</h3>
          <p className="text-sm text-violet-700 mt-1">
            Agrupa los tipos de documento por categoría. Al eliminar una categoría que
            tenga documentos asignados, se mostrará un error de integridad.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nueva Categoría
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <p className="text-sm font-semibold text-slate-800">
            {editing ? 'Editar Categoría' : 'Nueva Categoría'}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: Médico"
                autoFocus
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Descripción</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional"
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 text-sm font-semibold bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Guardando…' : editing ? 'Guardar Cambios' : 'Crear'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Categorías ({categories.length})
          </p>
        </div>
        {categories.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            No hay categorías aún. Crea la primera con el botón de arriba.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{cat.name}</p>
                  {cat.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                  )}
                  {deleteErrors[cat.id] && (
                    <p className="text-xs text-red-600 mt-0.5">{deleteErrors[cat.id]}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button
                    onClick={() => openEdit(cat)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(cat)}
                    disabled={deleting === cat.id}
                    className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {deleting === cat.id ? '…' : 'Eliminar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── EditDocTypeModal ───────────────────────────────────────────────────────
function EditDocTypeModal({
  docType,
  categories,
  onClose,
  onSaved,
}: {
  docType: DocumentType
  categories: DocumentCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName]                   = useState(docType.name)
  const [description, setDescription]     = useState(docType.description ?? '')
  const [categoryId, setCategoryId]       = useState(docType.category_id ? String(docType.category_id) : '')
  const [validityDays, setValidityDays]   = useState(docType.validity_days ? String(docType.validity_days) : '')
  const [alertPct, setAlertPct]           = useState(docType.alert_percentage_override != null ? String(docType.alert_percentage_override) : '')
  const [isGlobal, setIsGlobal]           = useState(docType.is_global_base_requirement)
  const [isAchs, setIsAchs]               = useState(docType.is_achs)
  const [achsCategory, setAchsCategory]   = useState<'EXAMEN' | 'CURSO' | ''>(docType.achs_category ?? '')
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (isAchs && !achsCategory) { setError('Selecciona el tipo ACHS (Examen u Curso).'); return }
    setSubmitting(true)
    setError('')
    try {
      await api.updateDocumentType(docType.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        category_id: categoryId ? parseInt(categoryId) : null,
        validity_days: validityDays ? parseInt(validityDays) : undefined,
        alert_percentage_override: alertPct ? parseInt(alertPct) : null,
        is_global_base_requirement: isGlobal,
        is_achs: isAchs,
        achs_category: isAchs ? (achsCategory || null) : null,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  const INPUT = 'mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-sm focus:outline-none focus:border-[#003f7a] focus:ring-1 focus:ring-[#003f7a]/20 bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-sm shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-[#003f7a] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white/60 text-[10px] uppercase tracking-widest">Tipo de Documento</p>
            <h3 className="text-white font-bold text-sm mt-0.5 truncate max-w-sm">{docType.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Nombre *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus className={INPUT} />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Descripción</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" className={INPUT} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Categoría</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={INPUT}>
                <option value="">Sin categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Vigencia (días)</label>
              <input type="number" min="1" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} placeholder="Sin vencimiento" className={INPUT} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">% Alerta personalizado</label>
              <input type="number" min="1" max="100" value={alertPct} onChange={(e) => setAlertPct(e.target.value)} placeholder="Usa el global" className={INPUT} />
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

          {/* ACHS toggle */}
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => { setIsAchs((v) => !v); setAchsCategory('') }}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${isAchs ? 'bg-red-500' : 'bg-slate-300'}`}
                role="switch" aria-checked={isAchs}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${isAchs ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-xs font-semibold text-slate-600">Documento ACHS / Mutual</span>
            </label>
            {isAchs && (
              <select
                value={achsCategory}
                onChange={(e) => setAchsCategory(e.target.value as 'EXAMEN' | 'CURSO' | '')}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-sm focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
              >
                <option value="">Seleccionar tipo…</option>
                <option value="EXAMEN">Examen Ocupacional</option>
                <option value="CURSO">Curso</option>
              </select>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-600 text-red-800 px-3 py-2 rounded-sm text-xs">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-sm transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={submitting || !name.trim()}
              className="px-4 py-2 text-sm font-semibold bg-[#003f7a] text-white rounded-sm hover:bg-[#005096] disabled:opacity-50 transition-colors">
              {submitting ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── DeleteDocTypeModal ─────────────────────────────────────────────────────
function DeleteDocTypeModal({
  docType,
  onClose,
  onDeleted,
}: {
  docType: DocumentType
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting]         = useState(false)
  const [integrityError, setIntegrityError] = useState('')
  const [error, setError]               = useState('')

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
        {/* Header */}
        <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-white shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <h3 className="text-base font-bold text-white">Eliminar tipo de documento</h3>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-700">
            ¿Eliminar <strong>"{docType.name}"</strong>?{' '}
            El tipo dejará de aparecer en el sistema, pero los archivos históricos
            se conservarán para auditoría (soft delete).
          </p>

          {/* Integrity error — SAP Fiori MessageStrip */}
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

// ── DocTypeRow ─────────────────────────────────────────────────────────────
function DocTypeRow({
  docType,
  onToggle,
  onEdit,
  onDelete,
  showAchsBadge = false,
}: {
  docType: DocumentType
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  showAchsBadge?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${docType.is_global_base_requirement ? 'bg-blue-500' : 'bg-slate-300'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-slate-800 truncate">{docType.name}</p>
            {showAchsBadge && docType.achs_category && (
              <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                docType.achs_category === 'EXAMEN'
                  ? 'bg-orange-100 text-orange-700 border border-orange-200'
                  : 'bg-sky-100 text-sky-700 border border-sky-200'
              }`}>
                {docType.achs_category}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {docType.category?.name ?? 'Sin categoría'}
            {docType.validity_days
              ? ` · ${docType.validity_days}d de vigencia`
              : ' · Sin vencimiento'}
            {docType.alert_percentage_override != null
              ? ` · alerta al ${docType.alert_percentage_override}%`
              : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-4">
        {/* Global toggle */}
        <button
          onClick={onToggle}
          className={`text-xs font-semibold px-2.5 py-1.5 rounded-sm transition-colors ${
            docType.is_global_base_requirement
              ? 'bg-blue-100 text-blue-700 hover:bg-red-50 hover:text-red-600'
              : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
          }`}
          title={docType.is_global_base_requirement ? 'Quitar de requisitos globales' : 'Promover a requisito global'}
        >
          {docType.is_global_base_requirement ? '● Global' : 'Hacer global'}
        </button>
        {/* Edit */}
        <button
          onClick={onEdit}
          title="Editar tipo de documento"
          className="p-1.5 rounded-sm text-slate-400 hover:text-[#003f7a] hover:bg-[#e6f0f9] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
        </button>
        {/* Delete */}
        <button
          onClick={onDelete}
          title="Eliminar tipo de documento"
          className="p-1.5 rounded-sm text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── GlobalReqsSection ──────────────────────────────────────────────────────
function GlobalReqsSection({
  docTypes,
  categories,
  onRefresh,
}: {
  docTypes: DocumentType[]
  categories: DocumentCategory[]
  onRefresh: () => void
}) {
  // ── Derived groups ─────────────────────────────────────────────────────
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

  // ── Table column header ────────────────────────────────────────────────
  const TableHeader = ({ label, count, accent }: { label: string; count: number; accent: string }) => (
    <div className={`px-5 py-3 border-b flex items-center justify-between ${accent}`}>
      <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <span className="text-xs font-semibold text-slate-400 tabular-nums">{count} registro{count !== 1 ? 's' : ''}</span>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ── Header + New button ────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Catálogo de Tipos de Documentos</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Define y clasifica los documentos que el sistema gestionará para acreditación de personal.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm((v) => !v) }}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[#003f7a] text-white text-sm font-semibold rounded-sm hover:bg-[#005096] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          + Nuevo Tipo de Documento
        </button>
      </div>

      {/* ── Create form ────────────────────────────────────────────────── */}
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

      {/* ── Tabla 1: Documentación Global (Obligatoria) ─────────────────── */}
      <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm">
        <TableHeader
          label="Documentación Global (Obligatoria)"
          count={globalDocuments.length}
          accent="bg-blue-50 border-blue-100"
        />
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

      {/* ── Tabla 2: Documentación Específica (Adicional) ───────────────── */}
      <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm">
        <TableHeader
          label="Documentación Específica (Adicional)"
          count={specificDocuments.length}
          accent="bg-slate-50 border-slate-200"
        />
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

      {/* ── Tabla 3: Documentación ACHS ─────────────────────────────────── */}
      <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm">
        <TableHeader
          label="Documentación ACHS / Mutual"
          count={achsDocuments.length}
          accent="bg-red-50 border-red-100"
        />
        {achsDocuments.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            Sin documentos ACHS configurados. Crea uno con el botón de arriba y activa la opción "Documento ACHS".
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

      {/* ── Modals ────────────────────────────────────────────────────────── */}
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

// ── ProjectReqsEditor ──────────────────────────────────────────────────────
function ProjectReqsEditor({
  projectId,
  requirements,
  availableDocTypes,
  onAdd,
  onRemove,
}: {
  projectId: number
  requirements: ProjectRequirement[]
  availableDocTypes: DocumentType[]
  onAdd: (dtId: number) => Promise<void>
  onRemove: (dtId: number) => Promise<void>
}) {
  const reqDtIds = new Set(requirements.map((r) => r.document_type_id))
  const addable = availableDocTypes.filter((dt) => !reqDtIds.has(dt.id))

  const [selectedDtId, setSelectedDtId] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)

  const handleAdd = async () => {
    if (!selectedDtId) return
    setAdding(true)
    try {
      await onAdd(parseInt(selectedDtId))
      setSelectedDtId('')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (dtId: number) => {
    setRemoving(dtId)
    try {
      await onRemove(dtId)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-4 pt-1">
      <p className="text-xs text-slate-500">
        Los requisitos globales se aplican automáticamente. Aquí configura los <strong>adicionales</strong> para este proyecto.
      </p>

      {/* Current requirements */}
      {requirements.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Sin requisitos específicos configurados.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {requirements.map((req) => (
            <span
              key={req.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm"
            >
              <span className="font-medium text-slate-700">{req.document_type.name}</span>
              {!req.is_mandatory && (
                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">
                  Opcional
                </span>
              )}
              <button
                onClick={() => handleRemove(req.document_type_id)}
                disabled={removing === req.document_type_id}
                className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                title="Quitar"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add selector */}
      {addable.length > 0 && (
        <div className="flex items-center gap-3">
          <select
            value={selectedDtId}
            onChange={(e) => setSelectedDtId(e.target.value)}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Agregar requisito específico…</option>
            {addable.map((dt) => (
              <option key={dt.id} value={dt.id}>
                {dt.name}{dt.category ? ` — ${dt.category.name}` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selectedDtId || adding}
            className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
          >
            {adding ? 'Agregando…' : 'Agregar'}
          </button>
        </div>
      )}

      {addable.length === 0 && requirements.length > 0 && (
        <p className="text-xs text-slate-400">
          Todos los tipos de documento disponibles ya están asignados a este proyecto.
        </p>
      )}
    </div>
  )
}

// ── ProjectsSection ────────────────────────────────────────────────────────
function ProjectsSection({
  projects,
  docTypes,
  onProjectCreated,
}: {
  projects: Project[]
  docTypes: DocumentType[]
  onProjectCreated: () => void
}) {
  const nonGlobalDocTypes = docTypes.filter((d) => !d.is_global_base_requirement)

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createError, setCreateError] = useState('')

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [projectReqs, setProjectReqs] = useState<Record<number, ProjectRequirement[]>>({})
  const [loadingReqs, setLoadingReqs] = useState<number | null>(null)

  const loadReqs = useCallback(async (projectId: number) => {
    setLoadingReqs(projectId)
    try {
      const reqs = await api.getProjectRequirements(projectId)
      setProjectReqs((prev) => ({ ...prev, [projectId]: reqs }))
    } finally {
      setLoadingReqs(null)
    }
  }, [])

  const handleExpand = async (projectId: number) => {
    if (expandedId === projectId) {
      setExpandedId(null)
      return
    }
    setExpandedId(projectId)
    if (!projectReqs[projectId]) {
      await loadReqs(projectId)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setCreateError('')
    try {
      await api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      setName('')
      setDescription('')
      setShowCreate(false)
      onProjectCreated()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear proyecto')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddReq = async (projectId: number, dtId: number) => {
    await api.addProjectRequirement(projectId, dtId)
    await loadReqs(projectId)
  }

  const handleRemoveReq = async (projectId: number, dtId: number) => {
    await api.removeProjectRequirement(projectId, dtId)
    await loadReqs(projectId)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Gestión de Proyectos</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Crea proyectos y define sus requisitos específicos (además de los requisitos globales).
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nuevo Proyecto
        </button>
      </div>

      {/* Create project form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <p className="text-sm font-semibold text-slate-800">Nuevo Proyecto</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Proyecto Edificio Central"
                autoFocus
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Descripción</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional"
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Creando…' : 'Crear Proyecto'}
            </button>
          </div>
        </form>
      )}

      {/* Projects list */}
      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-500 text-sm">
          No hay proyectos. Crea el primero con el botón de arriba.
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => handleExpand(project.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{project.name}</p>
                  {project.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{project.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <Link
                    href={`/trabajadores/proyectos/${project.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Ver detalle →
                  </Link>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${
                      expandedId === project.id ? 'rotate-180' : ''
                    }`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {expandedId === project.id && (
                <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/60">
                  {loadingReqs === project.id ? (
                    <p className="text-sm text-slate-400 py-2">Cargando requisitos…</p>
                  ) : (
                    <ProjectReqsEditor
                      projectId={project.id}
                      requirements={projectReqs[project.id] ?? []}
                      availableDocTypes={nonGlobalDocTypes}
                      onAdd={(dtId) => handleAddReq(project.id, dtId)}
                      onRemove={(dtId) => handleRemoveReq(project.id, dtId)}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────
export function BaseConfigView({ onProjectsChanged }: { onProjectsChanged?: () => void }) {
  type Section = 'requirements' | 'projects' | 'categories' | 'alerts'
  const [section, setSection] = useState<Section>('requirements')
  const [docTypes, setDocTypes] = useState<DocumentType[]>([])
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [dts, cats, projs] = await Promise.all([
        api.getDocumentTypes(),
        api.getDocumentCategories(),
        api.getProjects(),
      ])
      setDocTypes(dts)
      setCategories(cats)
      setProjects(projs)
    } catch { /* silently ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleProjectCreated = () => {
    loadData()
    onProjectsChanged?.()
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400 text-sm">
        Cargando configuración…
      </div>
    )
  }

  return (
    <>
      {/* Sub-section switcher */}
      <div className="flex gap-1 mb-6 p-1 bg-slate-100 rounded-xl w-fit">
        {([
          { key: 'requirements' as const, label: 'Requisitos Base' },
          { key: 'projects' as const, label: 'Gestión de Proyectos' },
          { key: 'categories' as const, label: 'Categorías' },
          { key: 'alerts' as const, label: 'Alertas' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSection(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              section === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {section === 'requirements' && (
        <GlobalReqsSection docTypes={docTypes} categories={categories} onRefresh={loadData} />
      )}

      {section === 'projects' && (
        <ProjectsSection
          projects={projects}
          docTypes={docTypes}
          onProjectCreated={handleProjectCreated}
        />
      )}

      {section === 'categories' && (
        <CategoriesSection categories={categories} onRefresh={loadData} />
      )}

      {section === 'alerts' && <AlertSettingsPanel />}
    </>
  )
}
