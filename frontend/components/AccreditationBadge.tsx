import type { TrafficLight } from '@/lib/types'

const CONFIG: Record<
  TrafficLight,
  { bg: string; text: string; dot: string; border: string; label: string; pulse: boolean }
> = {
  green: {
    bg: 'bg-green-50',
    text: 'text-green-800',
    dot: 'bg-green-500',
    border: 'border-green-200',
    label: 'Acreditado',
    pulse: false,
  },
  yellow: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
    label: 'Por vencer',
    pulse: false,
  },
  red: {
    bg: 'bg-red-50',
    text: 'text-red-800',
    dot: 'bg-red-500',
    border: 'border-red-200',
    label: 'Irregular',
    pulse: true,
  },
}

interface Props {
  status: TrafficLight
  size?: 'sm' | 'md' | 'lg'
}

export function AccreditationBadge({ status, size = 'md' }: Props) {
  const c = CONFIG[status]
  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs gap-1'
      : size === 'lg'
      ? 'px-4 py-2 text-sm gap-2'
      : 'px-3 py-1 text-xs gap-1.5'
  const dotSize = size === 'lg' ? 'w-3 h-3' : 'w-2 h-2'

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${c.bg} ${c.text} ${c.border} ${sizeClasses}`}
    >
      <span
        className={`${dotSize} rounded-full ${c.dot} shrink-0 ${c.pulse ? 'animate-pulse' : ''}`}
      />
      {c.label}
    </span>
  )
}
