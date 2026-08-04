'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import type { AdminPermissionItem, AdminUser, AdminUserCreate } from '@/lib/types'

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

function emptyPerms(): LocalPerms {
  const result = {} as LocalPerms
  for (const m of MODULES) result[m.key] = 'none'
  return result
}

function permItemsFromLocal(perms: LocalPerms): AdminPermissionItem[] {
  return (Object.entries(perms) as [ModuleKey, PermLevel][])
    .filter(([, level]) => level !== 'none')
    .map(([module, level]) => ({ module, level }))
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Password policy (espejo de validate_password_strength del backend) ──────
interface PwChecks {
  length: boolean
  letter: boolean
  number: boolean
}
function checkPassword(pw: string): PwChecks {
  return {
    length: pw.length >= 10 && pw.length <= 72,
    letter: /[a-zA-Z]/.test(pw),
    number: /[0-9]/.test(pw),
  }
}
function pwValid(pw: string): boolean {
  const c = checkPassword(pw)
  return c.length && c.letter && c.number
}
function pwStrength(pw: string): number {
  if (!pw) return 0
  const c = checkPassword(pw)
  let score = 0
  if (c.length) score += 1
  if (c.letter && c.number) score += 1
  if (pw.length >= 14) score += 1
  if (/[^a-zA-Z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score += 1
  return Math.min(score, 4)
}
const STRENGTH_META = [
  { label: '', color: '' },
  { label: 'Débil', color: 'bg-red-500' },
  { label: 'Media', color: 'bg-amber-500' },
  { label: 'Buena', color: 'bg-blue-500' },
  { label: 'Fuerte', color: 'bg-green-500' },
]

function PwReq({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? 'text-green-700' : 'text-slate-500'}`}>
      <span className="w-3 text-center">{ok ? '✓' : '•'}</span>
      {text}
    </li>
  )
}

// ── UI primitives ────────────────────────────────────────────────────────────
function Toggle({ checked, disabled, title, onChange }: {
  checked: boolean
  disabled?: boolean
  title?: string
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
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

// Grilla de permisos por módulo (Sin acceso / Lectura / Escritura), compartida.
function PermGrid({ perms, onChange }: {
  perms: LocalPerms
  onChange: (key: ModuleKey, level: PermLevel) => void
}) {
  return (
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
                      onChange={(v) => onChange(m.key, v)}
                    />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Campo de contraseña con requisitos visibles + barra de fuerza.
function PasswordField({ id, label, value, autoComplete, onChange }: {
  id: string
  label: string
  value: string
  autoComplete?: string
  onChange: (v: string) => void
}) {
  const checks = checkPassword(value)
  const strength = pwStrength(value)
  const meta = STRENGTH_META[strength]
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-medium text-slate-600 mb-1">
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 px-2.5 border border-slate-300 text-[12px] text-slate-800 focus:outline-none focus:border-[#005096] rounded-sm"
      />
      {value && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-200 rounded overflow-hidden">
            <div
              className={`h-full transition-all ${meta.color}`}
              style={{ width: `${(strength / 4) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 w-10">{meta.label}</span>
        </div>
      )}
      <ul className="mt-1.5 text-[10px] space-y-0.5">
        <PwReq ok={checks.length} text="Entre 10 y 72 caracteres" />
        <PwReq ok={checks.letter} text="Al menos una letra" />
        <PwReq ok={checks.number} text="Al menos un número" />
      </ul>
    </div>
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

// ── Create user modal ──────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (created: AdminUser) => void
}) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [isAdminFlag, setIsAdminFlag] = useState(false)
  const [perms, setPerms] = useState<LocalPerms>(emptyPerms)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = email.trim() !== '' && pwValid(password) && !saving

  const handleCreate = async () => {
    setSaving(true)
    setError('')
    try {
      const body: AdminUserCreate = {
        email: email.trim(),
        full_name: fullName.trim() || null,
        password,
        is_admin: isAdminFlag,
        permissions: isAdminFlag ? [] : permItemsFromLocal(perms),
      }
      const created = await api.createAdminUser(body)
      onCreated(created)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear usuario')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4">
      <div className="w-full max-w-lg bg-white shadow-xl rounded-sm">
        <div className="px-4 py-3 border-b border-slate-200 bg-[#f4f6f8] flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Crear usuario</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-email" className="block text-[11px] font-medium text-slate-600 mb-1">Correo</label>
              <input
                id="new-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-8 px-2.5 border border-slate-300 text-[12px] text-slate-800 focus:outline-none focus:border-[#005096] rounded-sm"
              />
            </div>
            <div>
              <label htmlFor="new-name" className="block text-[11px] font-medium text-slate-600 mb-1">Nombre completo</label>
              <input
                id="new-name"
                type="text"
                autoComplete="off"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full h-8 px-2.5 border border-slate-300 text-[12px] text-slate-800 focus:outline-none focus:border-[#005096] rounded-sm"
              />
            </div>
          </div>

          <PasswordField
            id="new-password"
            label="Contraseña inicial"
            value={password}
            autoComplete="new-password"
            onChange={setPassword}
          />
          <p className="text-[10px] text-slate-500 -mt-1">
            El usuario deberá cambiarla en su primer ingreso.
          </p>

          <div className="flex items-center gap-2.5 pt-1">
            <Toggle checked={isAdminFlag} onChange={setIsAdminFlag} />
            <span className="text-[11px] font-medium text-slate-700">Administrador (acceso total)</span>
          </div>

          {!isAdminFlag && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">Permisos por módulo</p>
              <PermGrid perms={perms} onChange={(k, v) => setPerms((p) => ({ ...p, [k]: v }))} />
            </div>
          )}

          {error && (
            <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">{error}</p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 bg-[#f4f6f8] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 border border-slate-300 hover:bg-slate-100 rounded-sm"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-[11px] font-semibold bg-[#003f7a] text-white hover:bg-[#005096] disabled:opacity-50 rounded-sm"
          >
            {saving ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit panel ─────────────────────────────────────────────────────────────
function EditPanel({ user, isSelf, isLastActiveAdmin, onSaved, onDeleted, onClose }: {
  user: AdminUser
  isSelf: boolean
  isLastActiveAdmin: boolean
  onSaved: (updated: AdminUser) => void
  onDeleted: (id: number) => void
  onClose: () => void
}) {
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [isActive, setIsActive] = useState(user.is_active)
  const [isAdminFlag, setIsAdminFlag] = useState(user.is_admin)
  const [perms, setPerms] = useState<LocalPerms>(() => initPerms(user))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Reset / password
  const [showReset, setShowReset] = useState(false)
  const [resetPw, setResetPw] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState('')

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Motivo por el que se bloquean las acciones peligrosas (toggles admin/activo, eliminar).
  const dangerReason = isSelf
    ? 'No puedes modificar el rol/estado ni eliminar tu propia cuenta.'
    : isLastActiveAdmin
      ? 'Es el único administrador activo del sistema. Asigna otro admin antes de modificarlo o eliminarlo.'
      : null
  const dangerDisabled = dangerReason !== null

  useEffect(() => {
    void Promise.resolve().then(() => {
      setFullName(user.full_name ?? '')
      setIsActive(user.is_active)
      setIsAdminFlag(user.is_admin)
      setPerms(initPerms(user))
      setSaved(false)
      setError('')
      setShowReset(false)
      setResetPw('')
      setResetMsg('')
      setConfirmDelete(false)
    })
  }, [user])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const patched = await api.patchAdminUser(user.id, {
        full_name: fullName.trim(),
        is_active: isActive,
        is_admin: isAdminFlag,
      })
      const permItems = isAdminFlag ? [] : permItemsFromLocal(perms)
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

  const handleReset = async () => {
    setResetting(true)
    setResetMsg('')
    setError('')
    try {
      await api.resetAdminUserPassword(user.id, resetPw)
      setResetMsg('Contraseña restablecida. El usuario deberá cambiarla al ingresar.')
      setResetPw('')
      setShowReset(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al restablecer la contraseña')
    } finally {
      setResetting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await api.deleteAdminUser(user.id)
      onDeleted(user.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar el usuario')
      setDeleting(false)
    }
  }

  return (
    <div className="w-[400px] shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-[#f4f6f8] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{user.full_name ?? user.email}</p>
          <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
        </div>
        <button onClick={onClose} className="mt-0.5 text-slate-400 hover:text-slate-700 transition-colors shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Datos */}
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">Datos</p>
          <label htmlFor="edit-name" className="block text-[11px] font-medium text-slate-600 mb-1">Nombre completo</label>
          <input
            id="edit-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 text-[12px] text-slate-800 focus:outline-none focus:border-[#005096] rounded-sm"
          />
        </div>

        {/* Estado de cuenta */}
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-3">Estado de cuenta</p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <Toggle checked={isActive} disabled={dangerDisabled} title={dangerReason ?? undefined} onChange={setIsActive} />
              <span className="text-[11px] font-medium text-slate-700">Activo</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Toggle checked={isAdminFlag} disabled={dangerDisabled} title={dangerReason ?? undefined} onChange={setIsAdminFlag} />
              <span className="text-[11px] font-medium text-slate-700">Administrador</span>
            </div>
          </div>
          {dangerReason && (
            <p className="mt-2.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded">
              {dangerReason}
            </p>
          )}
        </div>

        {/* Permisos */}
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-3">Permisos por módulo</p>
          {isAdminFlag ? (
            <p className="text-[11px] text-slate-500 bg-blue-50 border border-blue-100 px-3 py-2.5 rounded">
              Los administradores tienen acceso total a todos los módulos del sistema.
            </p>
          ) : (
            <PermGrid perms={perms} onChange={(k, v) => setPerms((p) => ({ ...p, [k]: v }))} />
          )}
        </div>

        {/* Seguridad: reset password */}
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">Seguridad</p>
          {!showReset ? (
            <button
              onClick={() => { setShowReset(true); setResetMsg('') }}
              className="text-[11px] font-semibold text-[#003f7a] hover:underline"
            >
              Restablecer contraseña…
            </button>
          ) : (
            <div className="space-y-2.5">
              <PasswordField
                id="reset-password"
                label="Nueva contraseña"
                value={resetPw}
                autoComplete="new-password"
                onChange={setResetPw}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleReset()}
                  disabled={!pwValid(resetPw) || resetting}
                  className="px-3 py-1.5 text-[11px] font-semibold bg-[#003f7a] text-white hover:bg-[#005096] disabled:opacity-50 rounded-sm"
                >
                  {resetting ? 'Restableciendo…' : 'Restablecer'}
                </button>
                <button
                  onClick={() => { setShowReset(false); setResetPw('') }}
                  className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 border border-slate-300 hover:bg-slate-100 rounded-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {resetMsg && <p className="mt-2 text-[11px] text-green-700">✓ {resetMsg}</p>}
        </div>

        {/* Zona peligrosa: eliminar */}
        <div className="px-4 py-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-red-400 mb-2">Zona peligrosa</p>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={dangerDisabled}
              title={dangerReason ?? undefined}
              className="text-[11px] font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-sm"
            >
              Eliminar usuario
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-[11px] text-red-700 mb-2">
                ¿Eliminar a <strong>{user.full_name ?? user.email}</strong>? Esta acción no se puede deshacer.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="px-3 py-1.5 text-[11px] font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 rounded-sm"
                >
                  {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 border border-slate-300 hover:bg-slate-100 rounded-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-[#f4f6f8] flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {error && <p className="text-[11px] text-red-600 truncate" title={error}>{error}</p>}
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
  const [creating, setCreating] = useState(false)

  // Guard: redirige a quien no sea admin (defensa en cliente; el backend ya exige require_admin).
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

  const activeAdminCount = useMemo(
    () => users.filter((u) => u.is_admin && u.is_active).length,
    [users],
  )

  const handleUserSaved = (updated: AdminUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    setSelected(updated)
  }

  const handleUserDeleted = (id: number) => {
    setUsers((prev) => prev.filter((u) => u.id !== id))
    setSelected(null)
  }

  const handleUserCreated = (created: AdminUser) => {
    setCreating(false)
    setUsers((prev) => [...prev, created])
    setSelected(created)
  }

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
            <div className="flex items-center gap-2">
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
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-[#003f7a] hover:bg-[#005096] rounded-sm transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Crear usuario
              </button>
            </div>
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
            isSelf={selected.id === selfUser?.id}
            isLastActiveAdmin={selected.is_admin && selected.is_active && activeAdminCount === 1}
            onSaved={handleUserSaved}
            onDeleted={handleUserDeleted}
            onClose={() => setSelected(null)}
          />
        )}

      </div>

      {creating && (
        <CreateUserModal onClose={() => setCreating(false)} onCreated={handleUserCreated} />
      )}
    </div>
  )
}
