'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { usePermissions } from '@/lib/permissions'

// ── Nav context ────────────────────────────────────────────────────────────
export type ActiveView = 'projects' | 'workers' | 'config' | 'reports' | 'fleet'

interface NavCtx {
  view: ActiveView
  setView: (v: ActiveView) => void
}

const NavContext = createContext<NavCtx>({ view: 'projects', setView: () => {} })
export const useNavContext = () => useContext(NavContext)

// ── Icons ──────────────────────────────────────────────────────────────────
function IconProjects() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  )
}
function IconWorkers() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}
function IconFleet() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  )
}
function IconConfig() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
function IconReports() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}
function IconAdmin() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
}

// ── ERP nav item (left column, light theme) ────────────────────────────────
function NavItem({ icon, label, active, onClick }: {
  icon: ReactNode; label: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-none text-left ${
        active
          ? 'bg-[#003f7a] text-white'
          : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
      }`}
    >
      <span className={active ? 'text-blue-300' : 'text-slate-400'}>{icon}</span>
      {label}
    </button>
  )
}

function NavLink({ icon, label, href }: { icon: ReactNode; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900"
    >
      <span className="text-slate-400">{icon}</span>
      {label}
    </Link>
  )
}

// ── View metadata ──────────────────────────────────────────────────────────
const VIEW_META: Record<ActiveView, { title: string; subtitle: string }> = {
  projects: { title: 'Proyectos', subtitle: 'Estado de acreditación por proyecto' },
  workers: { title: 'Empleados', subtitle: 'Directorio y estado global de trabajadores' },
  config: { title: 'Configuración', subtitle: 'Tipos de documento, proyectos y requisitos' },
  reports: { title: 'Reportes y Vencimientos', subtitle: 'Documentos próximos a vencer o vencidos' },
  fleet: { title: 'Flota y Equipos', subtitle: 'Gestión de vehículos y maquinaria' },
}

// ── AppShell (master ERP layout — root page) ───────────────────────────────
export function AppShell({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ActiveView>('projects')
  const pathname = usePathname()
  const isRoot = pathname === '/'
  const { user, isAdmin, canRead, loading, logout } = usePermissions()

  const showWorkers = canRead('trabajadores')
  const showFleet   = canRead('vehiculos')
  const showConfig  = canRead('configuracion')
  const showReports = canRead('reportes')
  const noModules   = !loading && !showWorkers && !showFleet && !showConfig && !showReports

  // Derive the effective view — falls back to first accessible if current is forbidden
  const allowedViews: ActiveView[] = [
    ...(showWorkers ? (['projects', 'workers'] as ActiveView[]) : []),
    ...(showFleet   ? (['fleet']               as ActiveView[]) : []),
    ...(showConfig  ? (['config']              as ActiveView[]) : []),
    ...(showReports ? (['reports']             as ActiveView[]) : []),
  ]
  const effectiveView: ActiveView =
    !loading && allowedViews.length > 0 && !allowedViews.includes(view)
      ? allowedViews[0]
      : view
  const meta = VIEW_META[effectiveView]

  return (
    <NavContext.Provider value={{ view: effectiveView, setView }}>
      <div className="h-screen w-full flex flex-col overflow-hidden">

        {/* ── TOP NAV ───────────────────────────────────────────────────── */}
        <header className="h-12 bg-[#003f7a] flex items-center px-4 gap-3 shrink-0 border-b border-[#002d5a]">
          <div className="flex items-center gap-2.5 mr-3">
            <div className="w-6 h-6 bg-white/20 flex items-center justify-center rounded-sm shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <span className="text-white text-[11px] font-black tracking-[0.15em]">ACREDITACIONES</span>
          </div>
          <div className="w-px h-5 bg-white/20" />
          <span className="text-white/80 text-xs font-medium">{meta.title}</span>
          <span className="text-white/40 text-[11px] hidden sm:inline">{meta.subtitle}</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/50 text-[11px]">API conectada</span>
            {user && (
              <>
                <div className="w-px h-4 bg-white/20" />
                <span className="text-white/70 text-[11px] max-w-[140px] truncate">
                  {user.full_name ?? user.email}
                </span>
                <button
                  onClick={() => { void logout() }}
                  className="text-white/50 hover:text-white text-[11px] underline underline-offset-2 transition-colors"
                >
                  Cerrar sesión
                </button>
              </>
            )}
          </div>
        </header>

        {/* ── BODY: Left nav + Center ────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left nav */}
          <aside className="w-56 shrink-0 bg-slate-50 border-r border-slate-300 flex flex-col overflow-y-auto">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 px-3 pt-3 pb-1">Módulos</p>
            {isRoot ? (
              <>
                {showWorkers && <NavItem icon={<IconProjects />} label="Proyectos" active={effectiveView === 'projects'} onClick={() => setView('projects')} />}
                {showWorkers && <NavItem icon={<IconWorkers />} label="Empleados" active={effectiveView === 'workers'} onClick={() => setView('workers')} />}
                {showFleet   && <NavItem icon={<IconFleet />} label="Flota y Equipos" active={effectiveView === 'fleet'} onClick={() => setView('fleet')} />}
                {(showConfig || showReports) && (
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 px-3 pt-3 pb-1">Sistema</p>
                )}
                {showConfig  && <NavItem icon={<IconConfig />} label="Configuración" active={effectiveView === 'config'} onClick={() => setView('config')} />}
                {showReports && <NavItem icon={<IconReports />} label="Reportes" active={effectiveView === 'reports'} onClick={() => setView('reports')} />}
                {noModules && !isAdmin && (
                  <p className="text-[11px] text-slate-400 px-3 py-4">Sin módulos asignados.</p>
                )}
                {isAdmin && (
                  <>
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 px-3 pt-3 pb-1">Administración</p>
                    <NavLink icon={<IconAdmin />} label="Usuarios" href="/admin/usuarios" />
                  </>
                )}
              </>
            ) : (
              <>
                {showWorkers && <NavLink icon={<IconProjects />} label="Proyectos" href="/" />}
                {showWorkers && <NavLink icon={<IconWorkers />} label="Empleados" href="/trabajadores" />}
                {showFleet   && <NavLink icon={<IconFleet />} label="Flota y Equipos" href="/vehiculos" />}
                {(showConfig || showReports) && (
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 px-3 pt-3 pb-1">Sistema</p>
                )}
                {showConfig  && <NavLink icon={<IconConfig />} label="Configuración" href="/" />}
                {showReports && <NavLink icon={<IconReports />} label="Reportes" href="/" />}
                {noModules && !isAdmin && (
                  <p className="text-[11px] text-slate-400 px-3 py-4">Sin módulos asignados.</p>
                )}
                {isAdmin && (
                  <>
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 px-3 pt-3 pb-1">Administración</p>
                    <NavLink icon={<IconAdmin />} label="Usuarios" href="/admin/usuarios" />
                  </>
                )}
              </>
            )}
          </aside>

          {/* Center workspace */}
          <main className="flex-1 overflow-y-auto bg-[#f4f6f8]">
            {children}
          </main>

        </div>
      </div>
    </NavContext.Provider>
  )
}
