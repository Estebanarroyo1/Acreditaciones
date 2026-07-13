'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

const PRESETS = [7, 14, 30, 60, 90]

export default function AlertasPage() {
  const [globalDays, setGlobalDays] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getVehicleAlertSettings()
      .then(settings => {
        setGlobalDays(settings.vehicle_global_alert_days)
        setInput(String(settings.vehicle_global_alert_days))
      })
      .catch(() => setError('No se pudo cargar la configuración de alertas.'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    const n = parseInt(input)
    if (isNaN(n) || n < 1 || n > 365) { setError('Debe ser un valor entre 1 y 365 días.'); return }
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await api.updateVehicleAlertSettings({ vehicle_global_alert_days: n })
      setGlobalDays(n)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Error al guardar la configuración.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Configuración de Alertas</h1>
        <p className="text-sm text-slate-500 mt-1">
          Días restantes antes del vencimiento a partir de los cuales se activa el semáforo amarillo en documentos de flota.
        </p>
      </div>

      {loading && <div className="text-center py-20 text-slate-400 text-sm">Cargando…</div>}

      {!loading && (
        <div className="max-w-md space-y-5">
          {/* Main config card */}
          <div className="bg-white border border-slate-300 rounded-sm p-5 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#003f7a]">
              Umbral Global de Alerta
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-3">
                Selecciona un preset o ingresa un valor personalizado
              </label>
              <div className="flex gap-2 flex-wrap mb-4">
                {PRESETS.map(p => (
                  <button
                    key={p}
                    onClick={() => { setInput(String(p)); setSaved(false) }}
                    className={`px-3 py-1.5 rounded-sm text-sm font-semibold border transition-colors ${
                      input === String(p)
                        ? 'bg-[#003f7a] text-white border-[#003f7a]'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-[#003f7a] hover:text-[#003f7a]'
                    }`}
                  >
                    {p}d
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={input}
                  onChange={e => { setInput(e.target.value); setSaved(false) }}
                  className="w-28 bg-white border border-slate-300 rounded-sm px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#003f7a] focus:ring-1 focus:ring-[#003f7a]/20"
                />
                <span className="text-slate-500 text-sm">días antes del vencimiento</span>
              </div>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-sm px-3 py-2">{error}</p>}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || input === String(globalDays)}
                className="px-5 py-2 bg-[#003f7a] hover:bg-[#005096] disabled:opacity-40 text-white text-sm font-semibold rounded-sm transition-colors"
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              {saved && (
                <span className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Guardado correctamente
                </span>
              )}
            </div>
          </div>

          {/* Info card */}
          <div className="bg-[#f4f6f8] border border-slate-300 rounded-sm p-4 space-y-3">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Cómo funciona</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Si el umbral global es 30 días, el semáforo cambiará a amarillo cuando queden 30 días o menos para
              el vencimiento. El semáforo rojo se activa cuando el documento ya ha vencido.
            </p>
            <div className="border-t border-slate-200 pt-3">
              <p className="text-xs font-semibold text-slate-600 mb-2">Cascada de 3 niveles:</p>
              <ol className="space-y-1.5 text-xs text-slate-500">
                <li className="flex items-start gap-2">
                  <span className="text-[#003f7a] font-bold shrink-0 w-4">1.</span>
                  Días específicos del documento individual (mayor prioridad)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#003f7a] font-bold shrink-0 w-4">2.</span>
                  Días de excepción por tipo de documento
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#003f7a] font-bold shrink-0 w-4">3.</span>
                  Este umbral global (fallback)
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
