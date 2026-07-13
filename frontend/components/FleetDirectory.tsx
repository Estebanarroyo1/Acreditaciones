'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { CreateVehiclePayload, VehicleGlobalStatus } from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from './TrafficLightBadge'
import { usePermissions } from '@/lib/permissions'

// ── New vehicle form ───────────────────────────────────────────────────────
function NewVehicleForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<Partial<CreateVehiclePayload>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof CreateVehiclePayload, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v || undefined }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.type || !form.brand || !form.model || !form.license_plate) {
      setError('Tipo, Marca, Modelo y Patente son obligatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.createVehicle(form as CreateVehiclePayload)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el vehículo')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof CreateVehiclePayload, placeholder?: string) => (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={(form[key] as string) ?? ''}
        onChange={(e) => set(key, e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">Nuevo vehículo / equipo</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        {field('Tipo *', 'type', 'Ej: Camioneta, Excavadora')}
        {field('Marca *', 'brand', 'Ej: Toyota')}
        {field('Modelo *', 'model', 'Ej: Hilux')}
        {field('Patente *', 'license_plate', 'Ej: AB-1234')}
        {field('Año', 'year', 'Ej: 2022')}
        {field('N° Motor', 'engine_number')}
        {field('VIN / Chasis', 'vin_chassis')}
        {field('Propietarios', 'owners')}
        {field('Municipio', 'municipality')}
        {field('Compañía seguros', 'insurance_company')}
        {field('N° Póliza', 'insurance_policy_number')}
        {field('TAG ID', 'tag_id')}
        {field('GPS ID', 'gps_id')}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Crear vehículo'}
        </button>
      </div>
    </form>
  )
}

// ── Fleet directory ────────────────────────────────────────────────────────
export function FleetDirectory() {
  const [fleet, setFleet] = useState<VehicleGlobalStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [activeOnly, setActiveOnly] = useState(true)
  const [search, setSearch] = useState('')
  const { canWrite } = usePermissions()

  const [prevActiveOnly, setPrevActiveOnly] = useState(activeOnly)
  if (activeOnly !== prevActiveOnly) {
    setPrevActiveOnly(activeOnly)
    setLoading(true)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getVehiclesGlobalStatus(activeOnly)
      setFleet(data)
    } catch {
      setFleet([])
    } finally {
      setLoading(false)
    }
  }, [activeOnly])

  useEffect(() => {
    api.getVehiclesGlobalStatus(activeOnly)
      .then(data => setFleet(data))
      .catch(() => setFleet([]))
      .finally(() => setLoading(false))
  }, [activeOnly])

  const filtered = fleet.filter((v) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      v.license_plate.toLowerCase().includes(q) ||
      v.type.toLowerCase().includes(q) ||
      v.brand.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por patente, tipo, marca…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>

        {/* Active/Archived toggle */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md p-1 shadow-sm">
          {([true, false] as const).map((val) => (
            <button
              key={String(val)}
              onClick={() => setActiveOnly(val)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activeOnly === val ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {val ? 'Activos' : 'Todos'}
            </button>
          ))}
        </div>

        {canWrite('vehiculos') && (
          <button
            onClick={() => setShowNew((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 transition-colors shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nuevo vehículo
          </button>
        )}
      </div>

      {/* New vehicle form */}
      {showNew && (
        <NewVehicleForm
          onCreated={() => { setShowNew(false); load() }}
          onCancel={() => setShowNew(false)}
        />
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Estado</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Patente</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Tipo</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Marca / Modelo</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Año</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-widest text-[10px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[...Array(6)].map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3.5 bg-slate-100 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">
                  {search ? 'Sin resultados para la búsqueda.' : 'No hay vehículos registrados. Agrega el primero.'}
                </td>
              </tr>
            ) : (
              filtered.map((v) => (
                <tr key={v.vehicle_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    {v.global_traffic_light ? (
                      <TrafficLightBadge status={v.global_traffic_light} showLabel />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-900">{v.license_plate}</td>
                  <td className="px-4 py-3 text-slate-600">{v.type}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">{v.brand} {v.model}</td>
                  <td className="px-4 py-3 text-slate-500">{v.year ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/vehiculos/${v.vehicle_id}`}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Ver perfil →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
