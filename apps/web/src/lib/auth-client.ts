import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

export class FlowError extends Error {}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new FlowError(data.error ?? 'Something went wrong. Please try again.')
  return data
}

/** Turns browser WebAuthn errors into something a person can act on. */
export function explain(err: unknown): string {
  if (err instanceof FlowError) return err.message
  if (err instanceof Error && err.name === 'NotAllowedError') {
    return 'The passkey prompt was closed or timed out. Try again when you’re ready.'
  }
  if (err instanceof Error && err.name === 'InvalidStateError') {
    return 'This device already has a passkey for you here.'
  }
  return 'Something went wrong. Please try again.'
}

export async function registerPasskey<T>(
  kind: 'setup' | 'invite' | 'passkeys',
  details: unknown = {},
): Promise<T> {
  const optionsJSON = await post<Parameters<typeof startRegistration>[0]['optionsJSON']>(
    `/api/auth/${kind}/options`,
    details,
  )
  const response = await startRegistration({ optionsJSON })
  return post<T>(`/api/auth/${kind}/verify`, { response })
}

export async function signInWithPasskey(): Promise<void> {
  const optionsJSON = await post<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
    '/api/auth/login/options',
    {},
  )
  const response = await startAuthentication({ optionsJSON })
  await post('/api/auth/login/verify', { response })
}

export async function submitRecoveryCode(code: string): Promise<void> {
  await post('/api/auth/recover', { code })
}

export async function signOut(): Promise<void> {
  await post('/api/auth/logout', {})
}
