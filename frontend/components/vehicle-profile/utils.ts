export const INPUT = 'w-full px-2 py-1.5 text-xs border border-slate-300 rounded-none bg-white focus:outline-none focus:border-[#003f7a] focus:ring-1 focus:ring-[#003f7a]/20'
export const BTN_PRIMARY = 'px-3 py-1.5 text-xs font-semibold rounded-none bg-[#003f7a] text-white hover:bg-[#005096] disabled:opacity-50 transition-colors'
export const BTN_GHOST = 'px-3 py-1.5 text-xs font-semibold rounded-none border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors'

export type TL = 'green' | 'yellow' | 'red' | null | undefined

export function stepColor(light: TL): 'green' | 'yellow' | 'red' | 'gray' {
  if (light === 'green') return 'green'
  if (light === 'yellow') return 'yellow'
  if (light === 'red') return 'red'
  return 'gray'
}

export function stepLabel(light: TL): string {
  if (light === 'green') return 'VERDE'
  if (light === 'yellow') return 'AMARILLO'
  if (light === 'red') return 'ROJO'
  return 'N/A'
}
