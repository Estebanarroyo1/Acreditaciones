'use client'

import Link from 'next/link'
import { usePermissions } from '@/lib/permissions'

// Acciones del lanzador (header de la página raíz): acceso a Administración
// (solo admins), identidad del usuario y cierre de sesión. Reemplaza el hueco que
// dejó el AppShell (no renderizado) donde vivía la sección "Administración".
export function LauncherActions() {
  const { user, isAdmin, logout } = usePermissions()

  return (
    <div className="flex items-center gap-3">
      {isAdmin && (
        <Link
          href="/admin/usuarios"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 text-[11px] font-medium transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          Administración
        </Link>
      )}

      {user && (
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-[11px] max-w-[160px] truncate">
            {user.full_name ?? user.email}
          </span>
          <button
            onClick={() => void logout()}
            className="text-slate-500 hover:text-white text-[11px] underline underline-offset-2 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
