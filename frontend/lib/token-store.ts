let _token: string | null = null

export const tokenStore = {
  get: (): string | null => _token,
  set: (t: string | null): void => { _token = t },
}
