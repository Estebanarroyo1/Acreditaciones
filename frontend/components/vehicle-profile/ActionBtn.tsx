'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

export function ActionBtn({
  label, icon, color = 'blue', onClick, href,
}: {
  label: string
  icon: ReactNode
  color?: 'blue' | 'slate'
  onClick?: () => void
  href?: string
}) {
  const cls = `w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white rounded-none transition-colors ${
    color === 'blue' ? 'bg-[#003f7a] hover:bg-[#005096]' : 'bg-slate-600 hover:bg-slate-700'
  }`
  if (href) return <Link href={href} className={cls}>{icon}{label}</Link>
  return <button onClick={onClick} className={cls}>{icon}{label}</button>
}
