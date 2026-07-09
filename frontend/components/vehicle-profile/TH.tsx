'use client'

import type { ReactNode } from 'react'

export function TH({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#003f7a] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
