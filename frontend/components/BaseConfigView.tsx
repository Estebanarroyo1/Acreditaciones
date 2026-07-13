'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DocumentCategory, DocumentType, Project } from '@/lib/types'
import { api } from '@/lib/api'
import { AlertSettingsPanel } from './AlertSettingsPanel'
import { CategoriesSection } from './base-config/CategoriesSection'
import { GlobalReqsSection } from './base-config/GlobalReqsSection'
import { ProjectsSection } from './base-config/ProjectsSection'

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

  useEffect(() => {
    Promise.all([api.getDocumentTypes(), api.getDocumentCategories(), api.getProjects()])
      .then(([dts, cats, projs]) => {
        setDocTypes(dts)
        setCategories(cats)
        setProjects(projs)
      })
      .catch(() => { /* silently ignore */ })
      .finally(() => setLoading(false))
  }, [])

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
