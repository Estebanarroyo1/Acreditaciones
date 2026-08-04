'use client'

import { useState } from 'react'
import { loadSessionToken } from '@/lib/session'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (next !== confirm) {
      setError('La nueva contraseña y su confirmación no coinciden.')
      return
    }

    setSubmitting(true)
    try {
      const token = await loadSessionToken()
      if (!token) {
        window.location.href = '/login'
        return
      }
      const res = await fetch(`${BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: current, new_password: next }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { detail?: string } | null
        setError(data?.detail ?? 'No se pudo cambiar la contraseña.')
        return
      }
      // Éxito: must_change_password quedó en false; recarga dura al dashboard.
      window.location.href = '/'
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#003f7a] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-black tracking-[0.15em]">ACREDITACIONES</p>
            <p className="text-zinc-400 text-[11px] tracking-wide">Cambio de contraseña obligatorio</p>
          </div>
        </div>

        <div className="bg-zinc-800 border border-zinc-700 p-8">
          <h1 className="text-white text-base font-bold mb-1">Define tu nueva contraseña</h1>
          <p className="text-zinc-400 text-xs mb-4">
            Por seguridad, debes cambiar la contraseña antes de continuar.
          </p>

          <ul className="text-zinc-400 text-[11px] mb-5 list-disc pl-4 space-y-0.5">
            <li>Entre 10 y 72 caracteres.</li>
            <li>Al menos una letra.</li>
            <li>Al menos un número.</li>
          </ul>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="current" className="block text-zinc-400 text-[11px] mb-1">
                Contraseña actual
              </label>
              <input
                id="current"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="w-full h-9 px-3 bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-[#005096]"
              />
            </div>
            <div>
              <label htmlFor="next" className="block text-zinc-400 text-[11px] mb-1">
                Nueva contraseña
              </label>
              <input
                id="next"
                type="password"
                autoComplete="new-password"
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="w-full h-9 px-3 bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-[#005096]"
              />
            </div>
            <div>
              <label htmlFor="confirm" className="block text-zinc-400 text-[11px] mb-1">
                Confirmar nueva contraseña
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {submitting ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
