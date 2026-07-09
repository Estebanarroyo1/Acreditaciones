'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { INPUT, BTN_PRIMARY, BTN_GHOST } from './utils'

export function MeterUpdateForm({ maintId, current, unit, onSuccess, onCancel }: {
  maintId: number
  current: number
  unit: 'km' | 'horas'
  onSuccess: () => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(String(current))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(value)
    if (isNaN(n) || n < 0) { setError('Ingresa un número válido.'); return }
    setSaving(true); setError(null)
    try {
      await api.updateVehicleMaintenance(maintId, { current_meter: n })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-blue-50 border border-blue-200 space-y-3">
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-xs">
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">
            Lectura actual ({unit === 'km' ? 'KM' : 'Horas'})
          </label>
          <input type="number" step="0.1" min="0" value={value} onChange={(e) => setValue(e.target.value)} className={INPUT} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancelar</button>
          <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? 'Guardando…' : 'Actualizar'}</button>
        </div>
      </div>
    </form>
  )
}
