'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { VehicleDocumentType } from '@/lib/types'

const INPUT = 'w-full px-2 py-1.5 text-xs border border-slate-300 rounded-none bg-white focus:outline-none focus:border-[#003f7a] focus:ring-1 focus:ring-[#003f7a]/20'
const BTN_PRIMARY = 'px-3 py-1.5 text-xs font-semibold rounded-none bg-[#003f7a] text-white hover:bg-[#005096] disabled:opacity-50 transition-colors'
const BTN_GHOST = 'px-3 py-1.5 text-xs font-semibold rounded-none border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors'

function TH({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#003f7a] bg-[#e6f0f9] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-[#003f7a]' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function DocumentacionPage() {
  const [types, setTypes] = useState<VehicleDocumentType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  // New form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [validityDays, setValidityDays] = useState('')
  const [alertDays, setAlertDays] = useState('')
  const [isRequired, setIsRequired] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Edit state
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.getVehicleDocumentTypes(false)
      setTypes(data)
    } catch {
      setError('No se pudo cargar los tipos de documento.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setFormError('El nombre es requerido.'); return }
    setSubmitting(true)
    setFormError('')
    try {
      await api.createVehicleDocumentType({
        name: name.trim(),
        description: description.trim() || undefined,
        validity_days: validityDays ? parseInt(validityDays) : undefined,
        alert_days_override: alertDays ? parseInt(alertDays) : undefined,
        is_required_base: isRequired,
      })
      setName(''); setDescription(''); setValidityDays(''); setAlertDays(''); setIsRequired(true)
      setShowForm(false)
      await load()
    } catch {
      setFormError('Error al crear el tipo de documento.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (t: VehicleDocumentType) => {
    setSavingId(t.id)
    try {
      await api.updateVehicleDocumentType(t.id, { is_active: !t.is_active })
      await load()
    } catch { /* ignore */ } finally { setSavingId(null) }
  }

  const toggleRequired = async (t: VehicleDocumentType) => {
    setSavingId(t.id)
    try {
      await api.updateVehicleDocumentType(t.id, { is_required_base: !t.is_required_base })
      await load()
    } catch { /* ignore */ } finally { setSavingId(null) }
  }

  const requiredTypes = types.filter(t => t.is_required_base)
  const additionalTypes = types.filter(t => !t.is_required_base)

  return (
    <div className="flex flex-col min-h-full">

      {/* Page header */}
      <div className="bg-[#f4f6f8] border-b border-slate-300 px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-bold text-slate-800">Tipos de Documento</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Configure los documentos requeridos por la flota.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className={showForm ? BTN_GHOST : BTN_PRIMARY}
        >
          {showForm ? 'Cancelar' : '+ Nuevo tipo'}
        </button>
      </div>

      {/* New type form */}
      {showForm && (
        <div className="bg-white border-b border-slate-300 px-6 py-4">
          <form onSubmit={handleSubmit} className="max-w-2xl space-y-3">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Nuevo tipo de documento</p>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Nombre *</label>
                <input value={name} onChange={e => setName(e.target.value)} className={INPUT} placeholder="Ej: SOAP, Permiso de Circulación" />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Descripción</label>
                <input value={description} onChange={e => setDescription(e.target.value)} className={INPUT} placeholder="Opcional" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Vigencia (días)</label>
                <input type="number" value={validityDays} onChange={e => setValidityDays(e.target.value)} className={INPUT} placeholder="365" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Días de alerta personalizados</label>
                <input type="number" min={1} max={365} value={alertDays} onChange={e => setAlertDays(e.target.value)} className={INPUT} placeholder="Global" />
              </div>
              <div className="col-span-2 flex items-center gap-3 py-1">
                <Toggle checked={isRequired} onChange={setIsRequired} />
                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    {isRequired ? '¿Es Requisito Obligatorio Base?' : 'Documento Adicional (Opcional)'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {isRequired
                      ? 'Obligatorio para todos los vehículos de la flota'
                      : 'Solo se registra si el vehículo lo tiene cargado'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
                {submitting ? 'Guardando…' : 'Crear tipo de documento'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className={BTN_GHOST}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading && <div className="text-center py-20 text-slate-400 text-xs">Cargando…</div>}
        {error && <div className="text-center py-20 text-red-500 text-xs">{error}</div>}

        {!loading && !error && (
          <>
            {/* Required base section */}
            <div className="border border-slate-300 bg-white">
              <div className="bg-[#e6f0f9] border-b border-[#c5d8ed] px-4 py-2 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#003f7a]">
                  Documentación Obligatoria Base
                </span>
                <span className="text-[10px] text-slate-500 ml-1">
                  — Obligatoria para toda la flota
                </span>
                <span className="ml-auto text-[10px] font-bold text-slate-500">{requiredTypes.length} tipos</span>
              </div>
              {requiredTypes.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Sin tipos de documento obligatorio base. Crea uno con el botón de arriba.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <TH>Nombre</TH>
                      <TH>Vigencia</TH>
                      <TH>Alerta</TH>
                      <TH>Estado</TH>
                      <TH right>Acciones</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {requiredTypes.map(t => (
                      <DocTypeRow
                        key={t.id}
                        t={t}
                        savingId={savingId}
                        onToggleActive={toggleActive}
                        onToggleRequired={toggleRequired}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Additional section */}
            <div className="border border-slate-300 bg-white">
              <div className="bg-[#e6f0f9] border-b border-[#c5d8ed] px-4 py-2 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#003f7a]">
                  Documentación Adicional
                </span>
                <span className="text-[10px] text-slate-500 ml-1">
                  — Opcional, se penaliza solo si está cargada y vence
                </span>
                <span className="ml-auto text-[10px] font-bold text-slate-500">{additionalTypes.length} tipos</span>
              </div>
              {additionalTypes.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Sin tipos de documento adicional configurados.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <TH>Nombre</TH>
                      <TH>Vigencia</TH>
                      <TH>Alerta</TH>
                      <TH>Estado</TH>
                      <TH right>Acciones</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {additionalTypes.map(t => (
                      <DocTypeRow
                        key={t.id}
                        t={t}
                        savingId={savingId}
                        onToggleActive={toggleActive}
                        onToggleRequired={toggleRequired}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DocTypeRow({
  t,
  savingId,
  onToggleActive,
  onToggleRequired,
}: {
  t: VehicleDocumentType
  savingId: number | null
  onToggleActive: (t: VehicleDocumentType) => void
  onToggleRequired: (t: VehicleDocumentType) => void
}) {
  const saving = savingId === t.id
  return (
    <tr className="border-b border-slate-100 even:bg-[#f4f6f8]/40 hover:bg-[#e8f0fa] transition-colors">
      <td className="px-3 py-1.5">
        <p className="text-[11px] font-medium text-slate-800">{t.name}</p>
        {t.description && <p className="text-[10px] text-slate-400">{t.description}</p>}
      </td>
      <td className="px-3 py-1.5 text-[11px] text-slate-600">{t.validity_days ? `${t.validity_days}d` : '—'}</td>
      <td className="px-3 py-1.5 text-[11px] text-slate-600">{t.alert_days_override != null ? `${t.alert_days_override}d` : 'Global'}</td>
      <td className="px-3 py-1.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${
          t.is_active
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-slate-100 text-slate-500 border-slate-200'
        }`}>
          {t.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td className="px-3 py-1.5 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-3">
          <button
            disabled={saving}
            onClick={() => onToggleRequired(t)}
            title={t.is_required_base ? 'Convertir en adicional (opcional)' : 'Convertir en obligatorio base'}
            className="text-[10px] text-slate-500 hover:text-[#003f7a] disabled:opacity-40"
          >
            {t.is_required_base ? 'Obl. Base →' : '→ Obl. Base'}
          </button>
          <button
            disabled={saving}
            onClick={() => onToggleActive(t)}
            className="text-[10px] text-slate-500 hover:text-[#003f7a] disabled:opacity-40"
          >
            {t.is_active ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </td>
    </tr>
  )
}
