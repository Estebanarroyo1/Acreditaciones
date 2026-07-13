import { signIn } from '@/auth'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo + brand */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#003f7a] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-black tracking-[0.15em]">ACREDITACIONES</p>
            <p className="text-zinc-400 text-[11px] tracking-wide">Sistema ERP de Gestión Corporativa</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-zinc-800 border border-zinc-700 p-8">
          <h1 className="text-white text-base font-bold mb-1">Iniciar sesión</h1>
          <p className="text-zinc-400 text-xs mb-6">
            Accede con tu cuenta corporativa de Microsoft 365.
          </p>

          <form
            action={async () => {
              'use server'
              await signIn('microsoft-entra-id', { redirectTo: '/' })
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-[#003f7a] hover:bg-[#005096] text-white text-sm font-semibold transition-colors"
            >
              {/* Microsoft icon */}
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
              Iniciar sesión con Microsoft
            </button>
          </form>
        </div>

        <p className="text-zinc-600 text-[10px] text-center mt-4">
          Solo cuentas autorizadas del tenant corporativo.
        </p>
      </div>
    </div>
  )
}
