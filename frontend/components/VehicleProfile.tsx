'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { VehicleDocumentType, VehicleFullProfile } from '@/lib/types'
import { api } from '@/lib/api'
import { TrafficLightBadge } from './TrafficLightBadge'
import { StatusArrow } from './vehicle-profile/StatusArrow'
import { HField } from './vehicle-profile/HField'
import { Tab } from './vehicle-profile/Tab'
import { ActionBtn } from './vehicle-profile/ActionBtn'
import { DocForm } from './vehicle-profile/DocForm'
import { NewMaintenanceForm } from './vehicle-profile/NewMaintenanceForm'
import { DocRow } from './vehicle-profile/DocRow'
import { MaintRow } from './vehicle-profile/MaintRow'
import { TH } from './vehicle-profile/TH'
import { stepColor, stepLabel } from './vehicle-profile/utils'
import { usePermissions } from '@/lib/permissions'

export function VehicleProfile({ vehicleId }: { vehicleId: number }) {
  const [profile, setProfile] = useState<VehicleFullProfile | null>(null)
  const [docTypes, setDocTypes] = useState<VehicleDocumentType[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewMaint, setShowNewMaint] = useState(false)
  const [showAddAdditional, setShowAddAdditional] = useState(false)
  const [activeTab, setActiveTab] = useState<'docs' | 'maint'>('docs')
  const { canWrite } = usePermissions()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, dts] = await Promise.all([
        api.getVehicleFullProfile(vehicleId),
        api.getVehicleDocumentTypes(true),
      ])
      setProfile(p)
      setDocTypes(dts)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [vehicleId])

  useEffect(() => {
    Promise.all([api.getVehicleFullProfile(vehicleId), api.getVehicleDocumentTypes(true)])
      .then(([p, dts]) => { setProfile(p); setDocTypes(dts) })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false))
  }, [vehicleId])

  if (loading) {
    return (
      <div className="flex min-h-full animate-pulse">
        <div className="flex-1 space-y-0">
          <div className="h-9 bg-slate-300" />
          <div className="h-[72px] bg-[#f4f6f8] border-b border-slate-300" />
          <div className="h-9 bg-[#f4f6f8] border-b border-slate-300" />
          <div className="h-8 bg-[#e6f0f9] border-b border-[#c5d8ed]" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 border-b border-slate-200 bg-white" />
          ))}
        </div>
        <div className="w-64 bg-white border-l border-slate-300" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-500 text-sm">
        Vehículo no encontrado.{' '}
        <Link href="/vehiculos" className="text-[#003f7a] hover:underline ml-1">Volver a Flota</Link>
      </div>
    )
  }

  const kmChecks = profile.maintenance_checks.filter(c => c.measurement_unit === 'km')

  const IcoSettings = (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
  const IcoBell = (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
  const IcoPlus = (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
  const IcoX = (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )

  return (
    <div className="flex min-h-full">

      {/* ══ MAIN CONTENT ══════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Status stepper */}
        <div className="h-9 flex border-b border-slate-300 bg-[#f4f6f8] overflow-hidden shrink-0">
          <StatusArrow
            position="first"
            label="Estado"
            subLabel={profile.is_active ? 'ACTIVO' : 'INACTIVO'}
            color={profile.is_active ? 'blue' : 'gray'}
          />
          <StatusArrow
            position="middle"
            label="Documentación"
            subLabel={stepLabel(profile.doc_traffic_light)}
            color={stepColor(profile.doc_traffic_light)}
          />
          <StatusArrow
            position="last"
            label="Mantención"
            subLabel={stepLabel(profile.maintenance_traffic_light)}
            color={stepColor(profile.maintenance_traffic_light)}
          />
          <div className="flex-1" />
          <Link
            href="/vehiculos"
            className="flex items-center gap-1 px-4 text-[11px] text-slate-500 hover:text-[#003f7a] shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Directorio
          </Link>
        </div>

        {/* Data header */}
        <div className="bg-[#f4f6f8] border-b border-slate-300 px-4 py-2 shrink-0">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
            <HField label="Patente" value={profile.license_plate} mono />
            <HField label="Tipo" value={profile.type} />
            <HField label="Marca" value={profile.brand} />
            <HField label="Modelo" value={profile.model} />
            <HField label="Año" value={profile.year} />
            <HField label="Propietario" value={profile.owners} />
            <HField label="Municipio" value={profile.municipality} />
            <HField label="Seguro" value={profile.insurance_company} />
            <HField label="N° Póliza" value={profile.insurance_policy_number} />
          </div>
          {(profile.vin_chassis || profile.engine_number || profile.tag_id || profile.gps_id) && (
            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mt-1.5 pt-1.5 border-t border-slate-200">
              {profile.vin_chassis && <HField label="VIN / Chasis" value={profile.vin_chassis} mono />}
              {profile.engine_number && <HField label="N° Motor" value={profile.engine_number} mono />}
              {profile.tag_id && <HField label="TAG" value={profile.tag_id} mono />}
              {profile.gps_id && <HField label="GPS ID" value={profile.gps_id} mono />}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-300 bg-[#f4f6f8] px-4 shrink-0">
          <Tab
            label="Documentación Legal"
            active={activeTab === 'docs'}
            onClick={() => setActiveTab('docs')}
            count={profile.required_document_checks.length + profile.additional_document_checks.length}
          />
          <Tab
            label="Control de Mantención"
            active={activeTab === 'maint'}
            onClick={() => setActiveTab('maint')}
            count={profile.maintenance_checks.length}
          />
        </div>

        {/* Tab content */}
        <div className="flex-1">

          {/* ── Documentación ── */}
          {activeTab === 'docs' && (
            <>
              {/* Tabla 1: Documentación Obligatoria Base */}
              <div className="border-b border-slate-300">
                <div className="bg-[#f0f4f8] border-b border-slate-200 px-4 py-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Documentación Obligatoria Base
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({profile.required_document_checks.length})
                  </span>
                  {profile.required_doc_traffic_light && (
                    <div className="ml-auto">
                      <TrafficLightBadge status={profile.required_doc_traffic_light} variant="pill" />
                    </div>
                  )}
                </div>
                {profile.required_document_checks.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No hay tipos de documento obligatorio configurados.{' '}
                    <Link href="/vehiculos/documentacion" className="text-[#003f7a] hover:underline">Configurar</Link>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#e6f0f9] border-b border-[#c5d8ed]">
                        <TH>Documento</TH>
                        <TH>Vencimiento</TH>
                        <TH>Días por vencer</TH>
                        <TH>Estado</TH>
                        <TH right>Acciones</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.required_document_checks.map((check) => (
                        <DocRow
                          key={check.vehicle_document_type_id}
                          check={check}
                          vehicleId={vehicleId}
                          docTypes={docTypes.filter(d => d.is_required_base)}
                          onRefresh={load}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Tabla 2: Documentación Adicional */}
              <div>
                <div className="bg-[#f0f4f8] border-b border-slate-200 px-4 py-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Documentación Adicional
                  </span>
                  {profile.additional_document_checks.length > 0 && (
                    <span className="text-[10px] text-slate-400">
                      ({profile.additional_document_checks.length})
                    </span>
                  )}
                  {profile.additional_doc_traffic_light && (
                    <div className="ml-1">
                      <TrafficLightBadge status={profile.additional_doc_traffic_light} variant="pill" />
                    </div>
                  )}
                  {canWrite('vehiculos') && (
                    <button
                      onClick={() => setShowAddAdditional(v => !v)}
                      className={`ml-auto px-2 py-0.5 text-[10px] font-semibold rounded-none transition-colors ${
                        showAddAdditional
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-[#003f7a] text-white hover:bg-[#005096]'
                      }`}
                    >
                      {showAddAdditional ? 'Cancelar' : '+ Añadir Documento Adicional'}
                    </button>
                  )}
                </div>

                {showAddAdditional && (
                  <div className="border-b border-slate-200">
                    <DocForm
                      vehicleId={vehicleId}
                      docTypes={docTypes.filter(d => !d.is_required_base)}
                      onSuccess={() => { setShowAddAdditional(false); load() }}
                      onCancel={() => setShowAddAdditional(false)}
                    />
                  </div>
                )}

                {profile.additional_document_checks.length === 0 && !showAddAdditional ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Sin documentos adicionales cargados para este vehículo.
                  </div>
                ) : profile.additional_document_checks.length > 0 && (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#e6f0f9] border-b border-[#c5d8ed]">
                        <TH>Documento</TH>
                        <TH>Vencimiento</TH>
                        <TH>Días por vencer</TH>
                        <TH>Estado</TH>
                        <TH right>Acciones</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.additional_document_checks.map((check) => (
                        <DocRow
                          key={check.vehicle_document_type_id}
                          check={check}
                          vehicleId={vehicleId}
                          docTypes={docTypes.filter(d => !d.is_required_base)}
                          onRefresh={load}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ── Mantención ── */}
          {activeTab === 'maint' && (
            <>
              {showNewMaint && (
                <div className="border-b border-slate-300">
                  <NewMaintenanceForm
                    vehicleId={vehicleId}
                    onSuccess={() => { setShowNewMaint(false); load() }}
                    onCancel={() => setShowNewMaint(false)}
                  />
                </div>
              )}

              {profile.maintenance_checks.length === 0 && !showNewMaint ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No hay programas de mantención registrados.
                </div>
              ) : profile.maintenance_checks.length > 0 && (
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#e6f0f9] border-b border-[#c5d8ed] sticky top-0">
                      <TH>Programa</TH>
                      <TH>Unidad</TH>
                      <TH>Lectura actual</TH>
                      <TH>Próx. servicio</TH>
                      <TH>Restante</TH>
                      <TH>Estado</TH>
                      <TH right>Acciones</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.maintenance_checks.map((check) => (
                      <MaintRow key={check.vehicle_maintenance_id} check={check} onRefresh={load} />
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

        </div>
      </div>

      {/* ══ RIGHT ACTION PANEL ════════════════════════════════════════════ */}
      <aside
        className="w-64 shrink-0 bg-white border-l border-slate-300 sticky top-0 self-start overflow-y-auto flex flex-col"
        style={{ height: 'calc(100vh - 48px)' }}
      >
        <div className="h-8 bg-[#f4f6f8] border-b border-slate-300 flex items-center px-3 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Acciones</span>
        </div>

        <div className="p-2 space-y-1 border-b border-slate-200">
          {activeTab === 'docs' && (
            <>
              <ActionBtn label="Tipos de Documento" icon={IcoSettings} color="slate" href="/vehiculos/documentacion" />
              <ActionBtn label="Config. de Alertas" icon={IcoBell} color="slate" href="/vehiculos/alertas" />
            </>
          )}
          {activeTab === 'maint' && canWrite('vehiculos') && (
            <ActionBtn
              label={showNewMaint ? 'Cancelar nuevo' : 'Nuevo programa'}
              icon={showNewMaint ? IcoX : IcoPlus}
              color={showNewMaint ? 'slate' : 'blue'}
              onClick={() => setShowNewMaint((v) => !v)}
            />
          )}
        </div>

        <div className="p-3 space-y-2 border-b border-slate-200">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Estado del vehículo</p>

          <div className="space-y-1.5">
            <div className="border border-slate-200 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Global</p>
              {profile.global_traffic_light
                ? <TrafficLightBadge status={profile.global_traffic_light} size="lg" showLabel />
                : <span className="text-xs text-slate-300">N/A</span>}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div className="border border-slate-200 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Docs</p>
                {profile.doc_traffic_light
                  ? <TrafficLightBadge status={profile.doc_traffic_light} size="sm" showLabel />
                  : <span className="text-[10px] text-slate-300">N/A</span>}
              </div>
              <div className="border border-slate-200 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Mant.</p>
                {profile.maintenance_traffic_light
                  ? <TrafficLightBadge status={profile.maintenance_traffic_light} size="sm" showLabel />
                  : <span className="text-[10px] text-slate-300">N/A</span>}
              </div>
            </div>
          </div>
        </div>

        {kmChecks.length > 0 && (
          <div className="p-3 space-y-2 border-b border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Odómetro</p>
            {kmChecks.map((c) => (
              <div key={c.vehicle_maintenance_id}>
                <p className="text-[10px] text-slate-400 truncate">{c.maintenance_program}</p>
                <p className="text-base font-black text-slate-800 font-mono leading-tight">
                  {c.current_meter.toLocaleString('es-CL')}
                  <span className="text-xs font-normal text-slate-400 ml-1">km</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Próx: {c.next_service_meter.toLocaleString('es-CL')} km
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="p-3 mt-auto border-t border-slate-200">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Identificación</p>
          <p className="text-lg font-black text-slate-800 font-mono tracking-widest leading-none">
            {profile.license_plate}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {[profile.brand, profile.model, profile.year].filter(Boolean).join(' ')}
          </p>
          {!profile.is_active && (
            <span className="inline-block mt-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200">
              INACTIVO
            </span>
          )}
        </div>
      </aside>

    </div>
  )
}
