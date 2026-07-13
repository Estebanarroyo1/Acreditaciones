'use client'

import { useState } from 'react'
import type { DocumentCategory } from '@/lib/types'
import { api } from '@/lib/api'
import { usePermissions } from '@/lib/permissions'

export function CategoriesSection({
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
  const { canWrite } = usePermissions()

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
        {canWrite('configuracion') && (
          <button
            onClick={openCreate}
            className="shrink-0 flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nueva Categoría
          </button>
        )}
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
                {canWrite('configuracion') && (
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
