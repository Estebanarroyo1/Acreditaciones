'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { DocumentType } from '@/lib/types'

const PRESETS = [5, 10, 15, 20, 25, 30]

// ── Per-type override row ──────────────────────────────────────────────────
function DocTypeOverrideRow({
  dt,
  globalPct,
  onSaved,
}: {
  dt: DocumentType
  globalPct: number
  onSaved: () => void
}) {
  const current = dt.alert_percentage_override
  const [input, setInput] = useState(current != null ? String(current) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [saved, setSaved]   = useState(false)
  const dirty = input !== (current != null ? String(current) : '')

  const handleSave = async () => {
    const trimmed = input.trim()
    let value: number | null = null
    if (trimmed !== '') {
      const n = parseInt(trimmed)
      if (isNaN(n) || n < 1 || n > 100) {
        setError('1–100')
        return
      }
      value = n
    }
    setSaving(true)
    setError('')
    try {
      await api.updateDocumentType(dt.id, { alert_percentage_override: value })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const effectivePct = input.trim() !== '' ? parseInt(input) || globalPct : globalPct
  const previewDays  = Math.round(365 * effectivePct / 100)

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
      {/* Name + category */}
      <td className="py-2.5 pl-4 pr-2">
        <p className="text-sm font-medium text-slate-800 leading-tight">{dt.name}</p>
        {dt.category && (
          <p className="text-[10px] text-slate-400 mt-0.5">{dt.category.name}</p>
        )}
      </td>

      {/* Preview */}
      <td className="py-2.5 px-2 text-xs text-slate-500 whitespace-nowrap">
        {input.trim() !== '' && !isNaN(parseInt(input))
          ? <span className="text-amber-700 font-medium">{previewDays} días</span>
          : <span className="text-slate-400">— usa global ({Math.round(365 * globalPct / 100)} días)</span>
        }
      </td>

      {/* Input */}
      <td className="py-2.5 px-2">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={100}
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); setSaved(false) }}
            placeholder={`${globalPct} (global)`}
            className="w-24 px-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
          />
          <span className="text-xs text-slate-400">%</span>
          {error && <span className="text-[10px] text-red-600">{error}</span>}
        </div>
      </td>

      {/* Actions */}
      <td className="py-2.5 pr-4 pl-2">
        <div className="flex items-center gap-1.5">
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 transition-colors"
            >
              {saving ? '…' : 'Guardar'}
            </button>
          )}
          {current != null && !dirty && (
            <button
              onClick={() => { setInput(''); }}
              className="px-2 py-1 text-[11px] rounded-md border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors"
              title="Borrar excepción — usará el porcentaje global"
            >
              Quitar
            </button>
          )}
          {saved && (
            <span className="text-[10px] text-green-600 font-medium">✓</span>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────
export function AlertSettingsPanel() {
  const [pct, setPct]               = useState<number>(20)
  const [input, setInput]           = useState('20')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [dirty, setDirty]           = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)
  const [docTypes, setDocTypes]     = useState<DocumentType[]>([])
  const [dtLoading, setDtLoading]   = useState(true)
  const [search, setSearch]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await api.getAlertSettings()
      setPct(s.global_alert_percentage)
      setInput(String(s.global_alert_percentage))
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  const loadDocTypes = useCallback(async () => {
    setDtLoading(true)
    try {
      const dts = await api.getDocumentTypes()
      setDocTypes(dts.filter((d) => d.is_active))
    } catch { /* ignore */ } finally {
      setDtLoading(false)
    }
  }, [])

  useEffect(() => { load(); loadDocTypes() }, [load, loadDocTypes])

  const apply = (value: number) => {
    setPct(value)
    setInput(String(value))
    setDirty(true)
    setSuccess(false)
    setError('')
  }

  const handleInputChange = (raw: string) => {
    setInput(raw)
    const n = parseInt(raw)
    if (!isNaN(n) && n >= 1 && n <= 100) {
      setPct(n)
      setDirty(true)
      setSuccess(false)
      setError('')
    }
  }

  const save = async () => {
    const n = parseInt(input)
    if (isNaN(n) || n < 1 || n > 100) {
      setError('Ingresa un porcentaje entre 1 y 100.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.updateAlertSettings({ global_alert_percentage: n })
      setDirty(false)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-slate-400 animate-pulse">
        Cargando configuración…
      </div>
    )
  }

  const previewAlertDays = Math.round(365 * pct / 100)
  const withOverride  = docTypes.filter((d) => d.alert_percentage_override != null)
  const withoutOverride = docTypes.filter((d) => d.alert_percentage_override == null)

  const filtered = (list: DocumentType[]) =>
    search.trim()
      ? list.filter((d) =>
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          (d.category?.name ?? '').toLowerCase().includes(search.toLowerCase())
        )
      : list

  return (
    <div className="space-y-6">
      {/* ── Global alert percentage ── */}
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
          <h3 className="text-sm font-bold text-blue-900">Umbral de Alerta por Porcentaje de Vida Útil</h3>
          <p className="text-xs text-blue-700 mt-1 leading-relaxed">
            El sistema calcula el umbral en función del tiempo restante del documento.
            Fórmula: <strong>días de alerta = (vencimiento − emisión) × porcentaje / 100</strong>.
            Cuando los días restantes caen dentro de ese umbral el documento pasa a <strong>Amarillo</strong>.
            Puedes afinar el porcentaje por tipo de documento en la sección inferior.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Porcentaje global de alerta
          </p>

          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={100}
                value={pct}
                onChange={(e) => apply(parseInt(e.target.value))}
                className="flex-1 accent-blue-600"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  className="w-16 px-2 py-1.5 text-sm font-bold text-center border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-slate-500">%</span>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Ejemplo: </span>
              un documento de 365 días de vigencia entraría en alerta{' '}
              <span className="font-semibold text-amber-600">{previewAlertDays} días antes</span> de su vencimiento.
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Valores comunes
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => apply(p)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    pct === p
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-700'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Guardar cambios
              </>
            )}
          </button>
          {!dirty && !success && <span className="text-xs text-slate-400">Sin cambios pendientes</span>}
          {success && <span className="text-xs text-green-600 font-medium">✓ Configuración guardada</span>}
        </div>
      </div>

      {/* ── Per-type overrides ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Excepciones por tipo de documento</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Establece un porcentaje distinto para tipos específicos. Sobreescribe el valor global.
            </p>
          </div>
          {withOverride.length > 0 && (
            <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">
              {withOverride.length} con excepción
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre o categoría…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
          />
        </div>

        {dtLoading ? (
          <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Cargando tipos de documento…</div>
        ) : docTypes.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">No hay tipos de documento activos.</div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  <th className="py-2.5 pl-4 pr-2">Tipo de documento</th>
                  <th className="py-2.5 px-2">Equivale a (doc. 365 días)</th>
                  <th className="py-2.5 px-2">% de alerta</th>
                  <th className="py-2.5 pr-4 pl-2"></th>
                </tr>
              </thead>
              <tbody>
                {/* Con excepción activa primero */}
                {filtered(withOverride).map((dt) => (
                  <DocTypeOverrideRow
                    key={dt.id}
                    dt={dt}
                    globalPct={pct}
                    onSaved={loadDocTypes}
                  />
                ))}
                {/* Sin excepción */}
                {filtered(withoutOverride).map((dt) => (
                  <DocTypeOverrideRow
                    key={dt.id}
                    dt={dt}
                    globalPct={pct}
                    onSaved={loadDocTypes}
                  />
                ))}
                {filtered(withOverride).length === 0 && filtered(withoutOverride).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-slate-400">
                      Sin resultados para "{search}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
