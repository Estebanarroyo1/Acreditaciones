import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Gate de sesión (convenio Proxy de Next 16, ex-middleware). Comprueba la
// PRESENCIA de la cookie httpOnly de sesión local (`acr_session`, seteada por el
// route handler /api/session). No valida el JWT aquí (eso lo hace el backend en
// get_current_user); solo redirige a /login si no hay cookie. Ver frontend/AGENTS.md.
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has('acr_session')

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

// El matcher excluye /login (necesario para autenticarse), todas las rutas /api
// (incluida /api/session, que gestiona su propia sesión) y los assets estáticos.
// /cambiar-contrasena NO se excluye: requiere sesión (el guard del cliente fuerza
// ahí a quien tenga must_change_password=true).
export const config = {
  matcher: ['/((?!api|login|_next/static|_next/image|favicon\\.ico|public).*)'],
}
