import Link from 'next/link'
import { LauncherActions } from '@/components/LauncherActions'

// ── Module card ────────────────────────────────────────────────────────────
function ModuleCard({
  href,
  icon,
  title,
  description,
  badge,
  accent,
  comingSoon,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  badge?: string
  accent: string
  comingSoon?: boolean
}) {
  const content = (
    <div className={`group relative flex flex-col h-full bg-white/[0.04] border border-white/10 rounded-2xl p-7 transition-all duration-200 overflow-hidden
      ${comingSoon ? 'opacity-60 cursor-default' : 'hover:bg-white/[0.08] hover:border-white/20 hover:shadow-2xl hover:-translate-y-0.5 cursor-pointer'}`}>

      {/* Accent glow */}
      <div className={`absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-300 ${accent}`} />

      {/* Badge */}
      {badge && (
        <span className={`absolute top-4 right-4 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
          comingSoon
            ? 'bg-slate-700/50 text-slate-400 border-slate-600/50'
            : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
        }`}>
          {badge}
        </span>
      )}

      {/* Icon */}
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 ${accent}/10 border border-white/5`}>
        <div className={`text-white/80 ${accent.replace('bg-', 'text-')}`}>
          {icon}
        </div>
      </div>

      {/* Content */}
      <h2 className="text-lg font-bold text-white mb-2 leading-tight">{title}</h2>
      <p className="text-sm text-slate-400 leading-relaxed flex-1">{description}</p>

      {/* Arrow */}
      {!comingSoon && (
        <div className="flex items-center gap-1.5 mt-6 text-xs font-semibold text-slate-500 group-hover:text-blue-400 transition-colors">
          <span>Abrir módulo</span>
          <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </div>
      )}
      {comingSoon && (
        <p className="mt-6 text-xs font-semibold text-slate-600">Próximamente disponible</p>
      )}
    </div>
  )

  if (comingSoon) return content
  return <Link href={href} className="block h-full">{content}</Link>
}

// ── Icons ──────────────────────────────────────────────────────────────────
function IconPersonal() {
  return (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

function IconFlota() {
  return (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  )
}

// ── App Launcher ───────────────────────────────────────────────────────────
export default function AppLauncher() {
  return (
    <div className="min-h-full bg-zinc-950 flex flex-col">

      {/* Top bar */}
      <header className="flex items-center justify-between h-14 px-8 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <p className="text-white text-xs font-bold tracking-wide">ACREDITACIONES</p>
            <p className="text-zinc-500 text-[10px]">Sistema corporativo</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-950/50 border border-green-900/40">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] text-green-400 font-medium">Todos los servicios activos</span>
          </div>
          <LauncherActions />
        </div>
      </header>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">

        {/* Welcome text */}
        <div className="text-center mb-14">
          <p className="text-[11px] font-bold tracking-[0.25em] uppercase text-blue-400 mb-3">
            Selector de módulos
          </p>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
            ¿En qué módulo deseas trabajar?
          </h1>
          <p className="text-slate-400 text-base max-w-lg mx-auto leading-relaxed">
            Selecciona un módulo para acceder a su entorno de trabajo dedicado.
            Cada módulo opera de forma completamente independiente.
          </p>
        </div>

        {/* Module cards */}
        <div className="grid grid-cols-2 gap-5 w-full max-w-2xl">
          <ModuleCard
            href="/trabajadores"
            icon={<IconPersonal />}
            title="Personal y Acreditaciones"
            description="Gestión de empleados, documentación requerida, semáforo de acreditación por proyecto y control de vencimientos."
            accent="bg-blue-500"
            badge="Activo"
          />
          <ModuleCard
            href="/vehiculos"
            icon={<IconFlota />}
            title="Flota y Vehículos"
            description="Control de vehículos y maquinaria, documentación legal, programas de mantención con alertas por KM u horas."
            accent="bg-violet-500"
            badge="Activo"
          />
        </div>

        {/* Quick stats footer */}
        <p className="mt-16 text-xs text-zinc-700 text-center">
          Sistema de Acreditación Corporativa · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
