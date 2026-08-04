'use client'

import { useEffect, useRef, useState } from 'react'
import type { Project, Worker, WorkLocation } from '@/lib/types'
import { api } from '@/lib/api'

interface Props {
  isOpen: boolean
  projects: Project[]
  onClose: () => void
  onSuccess: (worker: Worker) => void
}

interface FormState {
  first_name: string
  last_name: string
  dni: string
  email: string
  phone: string
  work_location: WorkLocation | ''
}

const EMPTY: FormState = { first_name: '', last_name: '', dni: '', email: '', phone: '', work_location: '' }

export function NewWorkerModal({ isOpen, projects, onClose, onSuccess }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [selectedProjects, setSelectedProjects] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [apiError, setApiError] = useState('')
  const firstInputRef = useRef<HTMLInputElement>(null)

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setForm(EMPTY)
      setSelectedProjects(new Set())
      setErrors({})
      setApiError('')
    }
  }

  useEffect(() => {
    if (isOpen) setTimeout(() => firstInputRef.current?.focus(), 50)
  }, [isOpen])

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const toggleProject = (id: number) =>
    setSelectedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.first_name.trim()) e.first_name = 'Requerido'
    if (!form.last_name.trim()) e.last_name = 'Requerido'
    if (!form.dni.trim()) e.dni = 'Requerido'
    if (!form.work_location) e.work_location = 'Selecciona una ubicación'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Email inválido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError('')
    try {
      const payload: import('@/lib/types').CreateWorkerPayload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        dni: form.dni.trim(),
        work_location: form.work_location as WorkLocation,
        ...(form.email.trim() && { email: form.email.trim() }),
        ...(form.phone.trim() && { phone: form.phone.trim() }),
      }

      const worker = await api.createWorker(payload)

      // Assign to selected projects (failures are non-blocking)
      await Promise.allSettled(
        [...selectedProjects].map((pid) => api.assignWorkerToProject(worker.id, pid))
      )

      onSuccess(worker)
      onClose()
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Error al crear el trabajador')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Nuevo Trabajador</h2>
            <p className="text-slate-400 text-xs mt-0.5">Completa los datos y asigna proyectos</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Names row */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre *" error={errors.first_name}>
              <input
                ref={firstInputRef}
                type="text"
                value={form.first_name}
                onChange={set('first_name')}
                placeholder="Carlos"
                className={inputCls(!!errors.first_name)}
              />
            </Field>
            <Field label="Apellido *" error={errors.last_name}>
              <input
                type="text"
                value={form.last_name}
                onChange={set('last_name')}
                placeholder="Gómez"
                className={inputCls(!!errors.last_name)}
              />
            </Field>
          </div>

          {/* DNI */}
          <Field label="DNI / RUT *" error={errors.dni}>
            <input
              type="text"
              value={form.dni}
              onChange={set('dni')}
              placeholder="12.345.678-9"
              className={inputCls(!!errors.dni)}
            />
          </Field>

          {/* Work location */}
          <Field label="Ubicación *" error={errors.work_location}>
            <div className="flex gap-3">
              {(['Planta', 'Obra'] as const).map((loc) => (
                <label
                  key={loc}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg border cursor-pointer transition-colors ${
                    form.work_location === loc
                      ? 'bg-blue-50 border-blue-400 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="work_location"
                    value={loc}
                    checked={form.work_location === loc}
                    onChange={() => {
                      setForm((f) => ({ ...f, work_location: loc }))
                      setErrors((prev) => ({ ...prev, work_location: '' }))
                    }}
                    className="w-4 h-4 accent-blue-600"
                  />
                  {loc}
                </label>
              ))}
            </div>
          </Field>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email" error={errors.email}>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="correo@empresa.cl"
                className={inputCls(!!errors.email)}
              />
            </Field>
            <Field label="Teléfono">
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                placeholder="+56 9 1234 5678"
                className={inputCls(false)}
              />
            </Field>
          </div>

          {/* Project assignment */}
          {projects.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">
                Asignar a proyectos
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {projects.map((p) => (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedProjects.has(p.id)
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjects.has(p.id)}
                      onChange={() => toggleProject(p.id)}
                      className="w-4 h-4 accent-blue-600 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                      {p.description && (
                        <p className="text-xs text-slate-500 truncate">{p.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {apiError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {apiError}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {submitting && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {submitting ? 'Guardando…' : 'Crear Trabajador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function inputCls(hasError: boolean) {
  return `w-full px-3 py-2.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    hasError
      ? 'border-red-300 bg-red-50'
      : 'border-slate-200 bg-white hover:border-slate-300'
  }`
}
