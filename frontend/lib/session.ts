// Cliente de sesión local: habla con el route handler `/api/session`, que guarda
// el JWT en una cookie httpOnly (ver app/api/session/route.ts). El token se
// mantiene además en memoria (token-store.ts) para adjuntarlo como Bearer a las
// llamadas directas al backend.

export async function saveSession(token: string): Promise<void> {
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export async function loadSessionToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/session', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { token: string | null }
    return data.token
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  try {
    await fetch('/api/session', { method: 'DELETE' })
  } catch {
    // best-effort: si falla, igual limpiamos el estado en memoria y redirigimos
  }
}
