import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Cookie httpOnly que guarda el JWT local del backend. Es la ÚNICA copia
// persistente del token (no se usa localStorage): al no ser legible por JS
// (httpOnly) no queda expuesta a exfiltración trivial vía XSS de document.cookie.
// El cliente rehidrata su copia en memoria (tokenStore) en cada carga vía GET.
const COOKIE = 'acr_session'
// Alineado con ACCESS_TOKEN_EXPIRE_MINUTES del backend (480 min = 8 h).
const MAX_AGE_SECONDS = 60 * 60 * 8

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null
  const token = body?.token
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'token requerido' }, { status: 400 })
  }
  const store = await cookies()
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
  return NextResponse.json({ ok: true })
}

export async function GET(): Promise<NextResponse> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value ?? null
  return NextResponse.json({ token })
}

export async function DELETE(): Promise<NextResponse> {
  const store = await cookies()
  store.delete(COOKIE)
  return NextResponse.json({ ok: true })
}
