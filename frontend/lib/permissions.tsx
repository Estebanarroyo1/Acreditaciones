'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { tokenStore } from './token-store'
import { clearSession, loadSessionToken } from './session'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

export interface BackendPermission {
  module: string
  level: string
}

export interface BackendUser {
  id: number
  email: string
  full_name: string | null
  is_admin: boolean
  is_active: boolean
  must_change_password: boolean
  permissions: BackendPermission[]
}

interface PermissionsCtx {
  user: BackendUser | null
  isAdmin: boolean
  canRead: (module: string) => boolean
  canWrite: (module: string) => boolean
  loading: boolean
  logout: () => Promise<void>
}

const Ctx = createContext<PermissionsCtx>({
  user: null,
  isAdmin: false,
  canRead: () => false,
  canWrite: () => false,
  loading: true,
  logout: async () => {},
})

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BackendUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  // Rehidrata el token desde la cookie httpOnly y carga el usuario desde /auth/me.
  useEffect(() => {
    let active = true
    ;(async () => {
      const token = await loadSessionToken()
      tokenStore.set(token)
      if (!token) {
        if (active) {
          setUser(null)
          setLoading(false)
        }
        return
      }
      try {
        const res = await fetch(`${BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          // Un 401/403 aquí suele ser una sesión inválida/expirada (p. ej. token
          // viejo tras rotar JWT_SECRET_KEY) o un usuario desactivado. Lo
          // registramos para que sea visible en consola en vez de fallar en silencio.
          console.error(
            `[auth] GET /auth/me respondió ${res.status}: sesión no válida.`,
          )
          tokenStore.set(null)
          if (res.status === 401 || res.status === 403) {
            // Auto-recuperación: limpiamos la cookie stale y volvemos al login, para
            // que el usuario no quede atrapado con el menú vacío. Consistente con el
            // manejo de 401 en lib/api.ts.
            await clearSession()
            if (active) router.replace('/login')
            return
          }
          if (active) {
            setUser(null)
            setLoading(false)
          }
          return
        }
        const data = (await res.json()) as BackendUser
        if (active) {
          setUser(data)
          setLoading(false)
        }
      } catch (err) {
        console.error('[auth] No se pudo contactar /auth/me:', err)
        if (active) {
          setUser(null)
          setLoading(false)
        }
      }
    })()
    return () => {
      active = false
    }
    // router es estable (useRouter); el efecto sigue corriendo una sola vez al montar.
  }, [router])

  // Guard de primer ingreso: si must_change_password es true, el usuario no puede
  // navegar a ninguna otra ruta — se le fuerza a /cambiar-contrasena.
  useEffect(() => {
    if (loading || !user) return
    if (user.must_change_password && pathname !== '/cambiar-contrasena') {
      router.replace('/cambiar-contrasena')
    }
  }, [loading, user, pathname, router])

  const logout = async (): Promise<void> => {
    await clearSession()
    tokenStore.set(null)
    setUser(null)
    router.replace('/login')
  }

  const canRead = (module: string): boolean => {
    if (!user) return false
    if (user.is_admin) return true
    return user.permissions.some((p) => p.module === module)
  }

  const canWrite = (module: string): boolean => {
    if (!user) return false
    if (user.is_admin) return true
    return user.permissions.some((p) => p.module === module && p.level === 'write')
  }

  return (
    <Ctx.Provider
      value={{ user, isAdmin: user?.is_admin ?? false, canRead, canWrite, loading, logout }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const usePermissions = () => useContext(Ctx)
