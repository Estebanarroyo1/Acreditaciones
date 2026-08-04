'use client'

import { useState } from 'react'
import type { DocumentCategory, DocumentType } from '@/lib/types'
import { api } from '@/lib/api'

export function EditDocTypeModal({
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
  const [name, setName]                 = useState(docType.name)
  const [description, setDescription]   = useState(docType.description ?? '')
  const [categoryId, setCategoryId]     = useState(docType.category_id ? String(docType.category_id) : '')
  const [validityDays, setValidityDays] = useState(docType.validity_days ? String(docType.validity_days) : '')
  const [alertPct, setAlertPct]         = useState(docType.alert_percentage_override != null ? String(docType.alert_percentage_override) : '')
  const [isGlobal, setIsGlobal]         = useState(docType.is_global_base_requirement)
  const [isAchs, setIsAchs]             = useState(docType.is_achs)
  const [achsCategory, setAchsCategory] = useState<'EXAMEN' | 'CURSO' | ''>(docType.achs_category ?? '')
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')

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
