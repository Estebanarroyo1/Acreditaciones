'use client'

export function StatusArrow({
  label,
  subLabel,
  color,
  position,
}: {
  label: string
  subLabel: string
  color: 'green' | 'yellow' | 'red' | 'blue' | 'gray'
  position: 'first' | 'middle' | 'last'
}) {
  const bg: Record<string, string> = {
    green: '#15803d',
    yellow: '#b45309',
    red: '#b91c1c',
    blue: '#003f7a',
    gray: '#64748b',
  }
  const clipPath: Record<string, string> = {
    first: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)',
    middle: 'polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)',
    last: 'polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%)',
  }
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-white shrink-0 px-5"
      style={{ backgroundColor: bg[color], clipPath: clipPath[position], minWidth: '130px' }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-widest opacity-75 leading-none">{label}</span>
      <span className="text-[11px] font-black leading-none mt-0.5">{subLabel}</span>
    </div>
  )
}
