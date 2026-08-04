'use client'

import { useState } from 'react'
import { saveSession } from '@/lib/session'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

interface LoginResponse {
  access_token: string
  token_type: string
  must_change_password: boolean
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { detail?: string } | null
        setError(data?.detail ?? 'No se pudo iniciar sesión.')
        return
      }
      const data = (await res.json()) as LoginResponse
      await saveSession(data.access_token)
      // Navegación dura para que el PermissionsProvider rehidrate desde la cookie.
      window.location.href = data.must_change_password ? '/cambiar-contrasena' : '/'
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo + brand */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#003f7a] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-black tracking-[0.15em]">ACREDITACIONES</p>
            <p className="text-zinc-400 text-[11px] tracking-wide">Sistema ERP de Gestión Corporativa</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-zinc-800 border border-zinc-700 p-8">
          <h1 className="text-white text-base font-bold mb-1">Iniciar sesión</h1>
          <p className="text-zinc-400 text-xs mb-6">Accede con tu correo y contraseña.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-zinc-400 text-[11px] mb-1">
                Correo
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-9 px-3 bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-[#005096]"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-zinc-400 text-[11px] mb-1">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-9 px-3 bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-[#005096]"
              />
            </div>

            {error && (
              <p className="text-red-400 text-[11px] bg-red-950/40 border border-red-900 px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-2.5 bg-[#003f7a] hover:bg-[#005096] disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? 'Ingresando…' : 'Iniciar sesión'}
            </button>
          </form>
        </div>

        <p className="text-zinc-600 text-[10px] text-center mt-4">
          Solo cuentas autorizadas. Si no tienes acceso, contacta al administrador.
        </p>
      </div>
    </div>
  )
}
