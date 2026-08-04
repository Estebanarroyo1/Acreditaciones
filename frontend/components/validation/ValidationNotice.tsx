'use client'

import type { ValidationConflict, ValidationWarning } from '@/lib/types'

/**
 * Normaliza el `detail` de un 409 (o el `conflict` de un /ai-scan) a
 * ValidationConflict. Devuelve null si no es un conflicto estructurado.
 */
export function deriveConflict(detail: unknown): ValidationConflict | null {
  if (!detail || typeof detail !== 'object') return null
  const d = detail as Record<string, unknown>
  if (d.type || d.identity) {
    return d as unknown as ValidationConflict
  }
  return null
}

function TypeMismatch({ expected, detected }: { expected?: string | null; detected?: string | null }) {
  return (
    <p>
      Esperábamos <strong>{expected ?? 'este tipo'}</strong> pero el documento parece{' '}
      <strong>{detected ?? 'ser de otro tipo'}</strong>.
    </p>
  )
}

function IdentityMismatch({
  expectedName, detectedName,
}: { expectedName?: string | null; detectedName?: string | null }) {
  return (
    <p>
      Este documento parece ser de <strong>{detectedName ?? 'otra persona'}</strong>, no de{' '}
      <strong>{expectedName ?? 'este trabajador'}</strong>.
    </p>
  )
}

/**
 * Avisos del veredicto combinado de IA, consistentes en trabajadores y vehículos.
 * - warn      → nota ámbar suave con el/los reasoning (no bloquea).
 * - conflict  → advertencia roja específica (tipo y/o identidad).
 */
export function ValidationNotice({
  action,
  warnings,
  conflict,
}: {
  action?: 'silent' | 'warn' | 'conflict'
  warnings?: ValidationWarning[]
  conflict?: ValidationConflict | null
}) {
  if (action === 'conflict' && conflict) {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-300 rounded-sm text-xs text-red-700">
        <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div className="space-y-1">
          <p className="font-bold">Revisa el archivo antes de subir</p>
          {conflict.type && (
            <TypeMismatch expected={conflict.type.expected} detected={conflict.type.detected} />
          )}
          {conflict.identity && (
            <IdentityMismatch
              expectedName={conflict.identity.expected_name}
              detectedName={conflict.identity.detected_name}
            />
          )}
        </div>
      </div>
    )
  }

  if (action === 'warn' && warnings && warnings.length > 0) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-sm text-xs text-amber-800">
        <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div className="space-y-0.5">
          <p className="font-semibold">Verifica antes de continuar</p>
          {warnings.map((w, i) => (
            <p key={i}>
              {w.dimension === 'identity' ? 'Titular: ' : 'Tipo: '}
              {w.reasoning}
            </p>
          ))}
        </div>
      </div>
    )
  }

  return null
}
