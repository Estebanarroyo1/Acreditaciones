'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import type { DocumentType, Project, ProjectRequirement } from '@/lib/types'
import { api } from '@/lib/api'
import { ProjectReqsEditor } from './ProjectReqsEditor'

export function ProjectsSection({
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
