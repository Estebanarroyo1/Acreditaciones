'use client'

import { use } from 'react'
import { WorkerProfile } from '@/components/WorkerProfile'

export default function TrabajadorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <WorkerProfile workerId={parseInt(id)} />
}
