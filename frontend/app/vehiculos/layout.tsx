import Link from 'next/link'
import { FleetSidebar } from '@/components/FleetSidebar'

export default function VehiculosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-full flex flex-col overflow-hidden">

      {/* ERP Top Nav */}
      <header className="h-12 bg-[#003f7a] flex items-center px-4 gap-3 shrink-0 border-b border-[#002d5a]">
        <Link href="/" className="flex items-center gap-2.5 group mr-3">
          <div className="w-6 h-6 bg-white/20 flex items-center justify-center rounded-sm shrink-0 group-hover:bg-white/30 transition-colors">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span className="text-white text-[11px] font-black tracking-[0.15em]">ACREDITACIONES</span>
        </Link>
        <div className="w-px h-5 bg-white/20" />
        <span className="text-white/80 text-xs font-medium">Flota y Equipos</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-white/50 text-[11px]">Sistema activo</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <FleetSidebar />
        <main className="flex-1 overflow-y-auto bg-[#f4f6f8]">
          {children}
        </main>
      </div>

    </div>
  )
}
