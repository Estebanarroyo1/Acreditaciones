'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import type { AdminPermissionItem, AdminUser } from '@/lib/types'

// ── Constants ──────────────────────────────────────────────────────────────
const MODULES = [
  { key: 'trabajadores',  label: 'Trabajadores' },
  { key: 'vehiculos',     label: 'Vehículos' },
  { key: 'gastos',        label: 'Gastos' },
  { key: 'configuracion', label: 'Configuración' },
  { key: 'reportes',      label: 'Reportes' },
] as const

type ModuleKey = (typeof MODULES)[number]['key']
type PermLevel = 'none' | 'read' | 'write'
type LocalPerms = Record<ModuleKey, PermLevel>

// ── Helpers ────────────────────────────────────────────────────────────────
function permLevelFromUser(user: AdminUser, module: string): PermLevel {
  const p = user.permissions.find((x) => x.module === module)
  if (!p) return 'none'
  return p.level === 'write' ? 'write' : 'read'
}

function initPerms(user: AdminUser): LocalPerms {
  const result = {} as LocalPerms
  for (const m of MODULES) result[m.key] = permLevelFromUser(user, m.key)
  return result
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Toggle ─────────────────────────────────────────────────────────────────
function Toggle({ checked, disabled, onChange }: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-[#003f7a]' : 'bg-slate-300'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  )
}

// ── Perm radio ─────────────────────────────────────────────────────────────
const PERM_LABELS: Record<PermLevel, string> = { none: 'Sin acceso', read: 'Lectura', write: 'Escritura' }

function PermRadio({ value, current, disabled, onChange }: {
  value: PermLevel
  current: PermLevel
  disabled?: boolean
  onChange: (v: PermLevel) => void
}) {
  return (
    <label className={`flex items-center gap-1.5 select-none ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="radio"
        checked={current === value}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="accent-[#003f7a] w-3 h-3"
      />
      <span className="text-[11px] text-slate-700 whitespace-nowrap">{PERM_LABELS[value]}</span>
    </label>
  )
}

// ── Permission summary badge (for table) ───────────────────────────────────
function PermSummary({ user }: { user: AdminUser }) {
  if (user.is_admin) {
    return <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-100 text-blue-700 border border-blue-200">Acceso total</span>
  }
  if (user.permissions.length === 0) {
    return <span className="text-[11px] text-slate-400">Sin permisos</span>
  }
  return (
    <span className="text-[11px] text-slate-600 font-mono">
      {user.permissions.map((p) => `${p.module.slice(0, 3)}:${p.level[0]}`).join(' · ')}
    </span>
  )
}

// ── Edit panel ─────────────────────────────────────────────────────────────
function EditPanel({ user, selfId, onSaved, onClose }: {
  user: AdminUser
  selfId: number | undefined
  onSaved: (updated: AdminUser) => void
  onClose: () => void
}) {
  const isSelf = user.id === selfId
  const [isActive, setIsActive] = useState(user.is_active)
  const [isAdminFlag, setIsAdminFlag] = useState(user.is_admin)
  const [perms, setPerms] = useState<LocalPerms>(() => initPerms(user))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Reset panel state when user changes (microtask avoids set-state-in-effect lint rule)
  useEffect(() => {
    void Promise.resolve().then(() => {
      setIsActive(user.is_active)
      setIsAdminFlag(user.is_admin)
      setPerms(initPerms(user))
      setSaved(false)
      setError('')
    })
  }, [user])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const patched = await api.patchAdminUser(user.id, {
        is_active: isActive,
        is_admin: isAdminFlag,
      })

      const permItems: AdminPermissionItem[] = (Object.entries(perms) as [ModuleKey, PermLevel][])
        .filter(([, level]) => level !== 'none')
        .map(([module, level]) => ({ module, level }))

      const final = await api.replaceUserPermissions(patched.id, permItems)
      setSaved(true)
      onSaved(final)
      void Promise.resolve().then(() => setTimeout(() => setSaved(false), 2500))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-[400px] shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-[#f4f6f8] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{user.full_name ?? user.email}</p>
          <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
        </div>
        <button
          onClick={onClose}
          className="mt-0.5 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Toggles section */}
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-3">Estado de cuenta</p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <Toggle checked={isActive} disabled={isSelf} onChange={setIsActive} />
              <span className="text-[11px] font-medium text-slate-700">Activo</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Toggle
                checked={isAdminFlag}
                disabled={isSelf}
                onChange={setIsAdminFlag}
              />
              <span className="text-[11px] font-medium text-slate-700">Administrador</span>
            </div>
          </div>
          {isSelf && (
            <p className="mt-2.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded">
              No puedes modificar tu propia cuenta de administrador.
            </p>
          )}
        </div>

        {/* Permissions section */}
        <div className="px-4 py-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-3">Permisos por módulo</p>
          {isAdminFlag ? (
            <p className="text-[11px] text-slate-500 bg-blue-50 border border-blue-100 px-3 py-2.5 rounded">
              Los administradores tienen acceso total a todos los módulos del sistema.
            </p>
          ) : (
            <div className="border border-slate-200 overflow-hidden rounded">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#e6f0f9] border-b border-[#c5d8ed]">
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-[#003f7a]">Módulo</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-[#003f7a]">Nivel de acceso</th>
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m, i) => (
                    <tr key={m.key} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="px-3 py-2 text-[11px] font-medium text-slate-700 w-32">{m.label}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          {(['none', 'read', 'write'] as PermLevel[]).map((level) => (
                            <PermRadio
                              key={level}
                              value={level}
                              current={perms[m.key]}
                              onChange={(v) => setPerms((p) => ({ ...p, [m.key]: v }))}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-[#f4f6f8] flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {error && <p className="text-[11px] text-red-600 truncate">{error}</p>}
          {saved && !error && <p className="text-[11px] text-green-700 font-medium">✓ Cambios guardados</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 border border-slate-300 hover:bg-slate-100 transition-colors rounded-sm"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-3 py-1.5 text-[11px] font-semibold bg-[#003f7a] text-white hover:bg-[#005096] disabled:opacity-50 transition-colors rounded-sm"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AdminUsuariosPage() {
  const { isAdmin, user: selfUser, loading: permLoading } = usePermissions()
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<AdminUser | null>(null)

  // Guard: redirect non-admins
  useEffect(() => {
    if (!permLoading && !isAdmin) {
      router.replace('/')
    }
  }, [permLoading, isAdmin, router])

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    setLoadError('')
    try {
      const data = await api.getAdminUsers()
      setUsers(data)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Error al cargar usuarios')
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void Promise.resolve().then(() => void loadUsers())
  }, [isAdmin, loadUsers])

  const handleUserSaved = (updated: AdminUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    setSelected(updated)
  }

  // Show spinner while checking permissions or redirecting
  if (permLoading || !isAdmin) {
    return (
      <div className="h-screen bg-[#f4f6f8] flex items-center justify-center">
        <p className="text-sm text-slate-500">Verificando permisos…</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden">

      {/* ERP header */}
      <header className="h-12 bg-[#003f7a] flex items-center px-4 gap-3 shrink-0 border-b border-[#002d5a]">
        <Link href="/" className="flex items-center gap-2.5 group mr-3">
          <div className="w-6 h-6 bg-white/20 flex items-center justify-center rounded-sm group-hover:bg-white/30 transition-colors shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span className="text-white text-[11px] font-black tracking-[0.15em]">ACREDITACIONES</span>
        </Link>
        <div className="w-px h-5 bg-white/20" />
        <span className="text-white/80 text-xs font-medium">Administración de Usuarios</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-white/50 text-[11px]">Sistema activo</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Users table area */}
        <div className="flex-1 overflow-y-auto bg-[#f4f6f8] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-bold text-slate-900">Usuarios del sistema</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => void loadUsers()}
              disabled={loadingUsers}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-600 border border-slate-300 bg-white hover:bg-slate-50 rounded-sm transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Actualizar
            </button>
          </div>

          {loadError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[11px] px-4 py-3 rounded mb-4">
              {loadError}
            </div>
          )}

          {loadingUsers ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              Cargando usuarios…
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#e6f0f9] border-b border-[#c5d8ed]">
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#003f7a]">Nombre</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#003f7a]">Correo</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#003f7a]">Estado</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#003f7a]">Rol</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#003f7a]">Último acceso</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#003f7a]">Permisos</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => {
                    const isSelected = selected?.id === u.id
                    return (
                      <tr
                        key={u.id}
                        onClick={() => setSelected(isSelected ? null : u)}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#e6f0f9]'
                            : i % 2 === 0
                            ? 'bg-white hover:bg-slate-50'
                            : 'bg-slate-50/60 hover:bg-slate-100'
                        }`}
                      >
                        <td className="px-3 py-2 text-[11px] font-semibold text-slate-800">
                          {u.full_name ?? <span className="text-slate-400 italic">Sin nombre</span>}
                          {u.id === selfUser?.id && (
                            <span className="ml-1.5 text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1 rounded">(yo)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-600 font-mono">{u.email}</td>
                        <td className="px-3 py-2">
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {u.is_admin && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Admin
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-500 tabular-nums">{formatDate(u.last_login_at)}</td>
                        <td className="px-3 py-2"><PermSummary user={u} /></td>
                      </tr>
                    )
                  })}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-[11px] text-slate-400">
                        No hay usuarios registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit panel */}
        {selected && (
          <EditPanel
            user={selected}
            selfId={selfUser?.id}
            onSaved={handleUserSaved}
            onClose={() => setSelected(null)}
          />
        )}

      </div>
    </div>
  )
}
