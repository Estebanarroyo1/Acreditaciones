'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { tokenStore } from './token-store'

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
  permissions: BackendPermission[]
}

interface PermissionsCtx {
  user: BackendUser | null
  isAdmin: boolean
  canRead: (module: string) => boolean
  canWrite: (module: string) => boolean
  loading: boolean
}

const Ctx = createContext<PermissionsCtx>({
  user: null,
  isAdmin: false,
  canRead: () => false,
  canWrite: () => false,
  loading: true,
})

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [user, setUser] = useState<BackendUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = (session as { accessToken?: string } | null)?.accessToken ?? null
    tokenStore.set(token)

    if (status === 'loading') return

    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    fetch(`${BASE}/auth/me`, { headers })
      .then((r) => (r.ok ? (r.json() as Promise<BackendUser>) : null))
      .then((data) => { setUser(data); setLoading(false) })
      .catch(() => { setUser(null); setLoading(false) })
  }, [session, status])

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
    <Ctx.Provider value={{ user, isAdmin: user?.is_admin ?? false, canRead, canWrite, loading }}>
      {children}
    </Ctx.Provider>
  )
}

export const usePermissions = () => useContext(Ctx)
