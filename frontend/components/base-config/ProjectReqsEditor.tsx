'use client'

import { useState } from 'react'
import type { DocumentType, ProjectRequirement } from '@/lib/types'

export function ProjectReqsEditor({
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
