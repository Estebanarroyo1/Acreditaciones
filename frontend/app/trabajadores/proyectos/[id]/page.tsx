'use client'

import { use } from 'react'
import { ProjectDetail } from '@/components/ProjectDetail'

export default function ProyectoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <ProjectDetail projectId={parseInt(id)} />
}
