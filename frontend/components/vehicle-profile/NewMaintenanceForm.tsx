'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { INPUT, BTN_PRIMARY, BTN_GHOST } from './utils'

export function NewMaintenanceForm({ vehicleId, onSuccess, onCancel }: {
  vehicleId: number
  onSuccess: () => void
  onCancel: () => void
}) {
  const [program, setProgram] = useState('')
  const [unit, setUnit] = useState<'km' | 'horas'>('km')
  const [lastMeter, setLastMeter] = useState('')
  const [nextMeter, setNextMeter] = useState('')
  const [currentMeter, setCurrentMeter] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!program || !nextMeter) { setError('Nombre del programa y próximo servicio son obligatorios.'); return }
    setSaving(true); setError(null)
    try {
      await api.createVehicleMaintenance({
        vehicle_id: vehicleId,
        maintenance_program: program,
        measurement_unit: unit,
        last_service_meter: lastMeter ? parseFloat(lastMeter) : undefined,
        next_service_meter: parseFloat(nextMeter),
        current_meter: currentMeter ? parseFloat(currentMeter) : 0,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-blue-50 border border-blue-200 space-y-3">
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Programa de mantención *</label>
          <input type="text" placeholder="Ej: Cambio de aceite" value={program} onChange={(e) => setProgram(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Unidad</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as 'km' | 'horas')} className={INPUT}>
            <option value="km">Kilómetros</option>
            <option value="horas">Horas</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Lectura actual</label>
          <input type="number" step="0.1" min="0" value={currentMeter} onChange={(e) => setCurrentMeter(e.target.value)} placeholder="0" className={INPUT} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Último servicio en</label>
          <input type="number" step="0.1" min="0" value={lastMeter} onChange={(e) => setLastMeter(e.target.value)} placeholder="Opcional" className={INPUT} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Próximo servicio en *</label>
          <input type="number" step="0.1" min="0" value={nextMeter} onChange={(e) => setNextMeter(e.target.value)} placeholder="Ej: 10000" className={INPUT} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancelar</button>
        <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? 'Guardando…' : 'Crear programa'}</button>
      </div>
    </form>
  )
}
