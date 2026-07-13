'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Project } from '@/lib/types'

export default function ProyectosPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getProjects()
      .then(data => setProjects(data))
      .catch(() => setError('No se pudo cargar la lista de proyectos.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Proyectos</h1>
        <p className="text-sm text-slate-500 mt-1">Selecciona un proyecto para ver el detalle de acreditación.</p>
      </div>

      {loading && (
        <div className="text-center py-20 text-slate-400 text-sm">Cargando proyectos…</div>
      )}
      {error && (
        <div className="text-center py-20 text-red-500 text-sm">{error}</div>
      )}
      {!loading && !error && projects.length === 0 && (
        <div className="text-center py-20 text-slate-400 text-sm">No hay proyectos registrados.</div>
      )}
      {!loading && !error && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-3 max-w-2xl">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/trabajadores/proyectos/${p.id}`}
              className="flex items-center justify-between px-5 py-4 bg-white border border-slate-300 rounded-sm hover:bg-slate-50 hover:border-blue-400 transition-colors cursor-pointer group"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                {p.description && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{p.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  p.is_active
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {p.is_active ? 'Activo' : 'Inactivo'}
                </span>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
