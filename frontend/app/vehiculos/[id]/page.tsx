'use client'

import { use } from 'react'
import { VehicleProfile } from '@/components/VehicleProfile'

export default function VehiculoProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <VehicleProfile vehicleId={parseInt(id)} />
}
