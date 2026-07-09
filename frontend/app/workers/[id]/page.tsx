'use client'

import { use } from 'react'
import { redirect } from 'next/navigation'

export default function WorkerOldRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  redirect(`/trabajadores/${id}`)
}
