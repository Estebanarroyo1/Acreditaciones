'use client'

export function Tab({ label, active, onClick, count }: {
  label: string
  active: boolean
  onClick: () => void
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`h-9 px-5 text-xs font-semibold border-b-2 whitespace-nowrap transition-none ${
        active
          ? 'border-[#003f7a] text-[#003f7a]'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-1.5 text-[10px] ${active ? 'text-[#003f7a]/60' : 'text-slate-400'}`}>
          ({count})
        </span>
      )}
    </button>
  )
}
