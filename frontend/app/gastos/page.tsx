export default function GastosPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-emerald-500/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-white mb-3">Gastos y Finanzas</h1>
      <p className="text-zinc-400 text-sm max-w-sm leading-relaxed">
        Este módulo está en desarrollo. Pronto podrás controlar gastos operacionales,
        rendiciones y presupuesto por proyecto.
      </p>
    </div>
  )
}
