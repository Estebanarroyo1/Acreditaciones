import type { TrafficLight, DocCheckStatus } from '@/lib/types'

type Status = TrafficLight | DocCheckStatus

function toLight(status: Status): TrafficLight {
  if (status === 'green' || status === 'ok') return 'green'
  if (status === 'yellow' || status === 'expiring_soon' || status === 'pending_review') return 'yellow'
  return 'red'
}

function getLabel(status: Status): string {
  switch (status) {
    case 'ok': return 'Vigente'
    case 'expiring_soon': return 'Por vencer'
    case 'expired': return 'Vencido'
    case 'missing': return 'Pendiente'
    case 'pending_review': return 'En revisión'
    case 'green': return 'Acreditado'
    case 'yellow': return 'Por vencer'
    case 'red': return 'Irregular'
  }
}

const CIRCLES: { light: TrafficLight; on: string }[] = [
  { light: 'red',    on: 'bg-red-500 shadow-[0_0_7px_2px_rgba(239,68,68,0.55)] ring-2 ring-red-300' },
  { light: 'yellow', on: 'bg-amber-400 shadow-[0_0_7px_2px_rgba(251,191,36,0.55)] ring-2 ring-amber-200' },
  { light: 'green',  on: 'bg-green-500 shadow-[0_0_7px_2px_rgba(34,197,94,0.55)] ring-2 ring-green-300' },
]

const PILL_CFG: Record<TrafficLight, { dot: string; text: string; bg: string; border: string }> = {
  green:  { dot: 'bg-green-500',  text: 'text-green-800',  bg: 'bg-green-50',  border: 'border-green-300' },
  yellow: { dot: 'bg-amber-400',  text: 'text-amber-800',  bg: 'bg-amber-50',  border: 'border-amber-300' },
  red:    { dot: 'bg-red-500',    text: 'text-red-800',    bg: 'bg-red-50',    border: 'border-red-300' },
}

interface Props {
  status: Status
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  variant?: 'stoplight' | 'pill'
}

export function TrafficLightBadge({ status, size = 'md', showLabel = false, variant = 'stoplight' }: Props) {
  const active = toLight(status)

  if (variant === 'pill') {
    const cfg = PILL_CFG[active]
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold border rounded-sm ${cfg.bg} ${cfg.text} ${cfg.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
        {getLabel(status)}
      </span>
    )
  }

  const dotSize =
    size === 'sm' ? 'w-2.5 h-2.5' :
    size === 'lg' ? 'w-5 h-5' :
    'w-3.5 h-3.5'

  const labelColor =
    active === 'red' ? 'text-red-700' :
    active === 'yellow' ? 'text-amber-700' :
    'text-green-700'

  const labelSize = size === 'lg' ? 'text-sm' : 'text-xs'

  return (
    <span className="inline-flex items-center gap-1">
      {CIRCLES.map(({ light, on }) => (
        <span
          key={light}
          className={`rounded-full shrink-0 transition-all duration-150 ${dotSize} ${
            active === light ? on : 'bg-slate-200'
          }`}
        />
      ))}
      {showLabel && (
        <span className={`ml-1 font-semibold ${labelColor} ${labelSize}`}>
          {getLabel(status)}
        </span>
      )}
    </span>
  )
}
