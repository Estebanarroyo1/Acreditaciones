'use client'

export function HField({ label, value, mono = false }: {
  label: string
  value?: string | number | null
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-[10px] font-bold uppercase tracking-wide text-slate-500 shrink-0 text-right"
        style={{ minWidth: '68px' }}
      >
        {label}
      </span>
      <div className={`flex-1 h-7 text-xs border border-slate-300 bg-white px-2 flex items-center text-slate-800 overflow-hidden ${mono ? 'font-mono' : ''}`}>
        {value != null && value !== '' ? (
          <span className="truncate">{value}</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>
    </div>
  )
}
