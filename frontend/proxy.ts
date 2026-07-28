import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Gate de sesión optimista (convenio Proxy de Next 16, ex-middleware).
// Solo comprueba la PRESENCIA de la cookie de sesión de NextAuth; nunca la
// valida aquí porque auth() no corre de forma fiable en el edge runtime.
// La validación real la hacen el backend (get_current_user) y NextAuth en las
// rutas server. Ver frontend/AGENTS.md (middleware → proxy).
export function proxy(req: NextRequest) {
  const hasSession =
    req.cookies.has('authjs.session-token') ||
    req.cookies.has('__Secure-authjs.session-token')

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

// El matcher ya excluye /login y api/auth (rutas públicas necesarias para
// autenticarse) además de los assets estáticos.
export const config = {
  matcher: [
    '/((?!api/auth|login|_next/static|_next/image|favicon\\.ico|public).*)',
  ],
}
