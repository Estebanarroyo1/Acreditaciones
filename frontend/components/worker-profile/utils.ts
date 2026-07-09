import type { DocCheckStatus } from '@/lib/types'

export const ROW_LEFT: Record<DocCheckStatus, string> = {
  ok: 'border-l-4 border-l-green-400',
  expiring_soon: 'border-l-4 border-l-amber-400',
  expired: 'border-l-4 border-l-red-500',
  missing: 'border-l-4 border-l-slate-300',
  pending_review: 'border-l-4 border-l-blue-400',
}

export const CATEGORY_LABELS: Record<string, string> = {
  medical: 'Médico',
  background: 'Antecedentes',
  certification: 'Certificación',
  training: 'Capacitación',
  legal: 'Legal',
  other: 'Otro',
}

export function getExpiryStatus(expiry: string): { type: 'blocked' | 'warning' | 'ok'; msg: string } {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [y, m, d] = expiry.split('-')
  const fmt = `${d}-${m}-${y}`
  if (expiry < todayStr) {
    return { type: 'blocked', msg: `Bloqueo del sistema: El documento ya se encuentra vencido. Fecha de caducidad: ${fmt}. No se permite su ingreso.` }
  }
  const daysLeft = Math.round(
    (new Date(expiry + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86400000
  )
  if (daysLeft <= 30) {
    const when = daysLeft === 0 ? 'hoy mismo' : `en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}`
    return { type: 'warning', msg: `Atención: Este documento vence ${when} (${fmt}). Verifica la fecha de emisión antes de guardar.` }
  }
  return { type: 'ok', msg: '' }
}
