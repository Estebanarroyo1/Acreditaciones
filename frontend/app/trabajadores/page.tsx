'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Project } from '@/lib/types'
import { WorkersDirectory } from '@/components/WorkersDirectory'

export default function TrabajadoresPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getProjects()
      .then(data => setProjects(data))
      .catch(() => { /* non-fatal: directory still works without projects list */ })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full text-zinc-500 text-sm">Cargando…</div>
  )

  return <WorkersDirectory projects={projects} />
}
