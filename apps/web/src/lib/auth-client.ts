import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

export class FlowError extends Error {
  constructor(
    message: string,
    readonly data: { unknownPasskey?: boolean } = {},
  ) {
    super(message)
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string
    unknownPasskey?: boolean
  }
  if (!res.ok) throw new FlowError(data.error ?? 'Something went wrong. Please try again.', data)
  return data
}

type SignalingCredential = {
  signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void>
}

/** Asks the passkey manager (where supported) to delete a passkey this site no longer knows. */
async function forgetStalePasskey(rpId: string | undefined, credentialId: string) {
  const pkc = (globalThis as { PublicKeyCredential?: SignalingCredential }).PublicKeyCredential
  await pkc
    ?.signalUnknownCredential?.({ rpId: rpId ?? location.hostname, credentialId })
    .catch(() => {})
}

function isApple(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh/.test(navigator.userAgent)
}

/** Turns browser WebAuthn errors into something a person can act on. */
export function explain(err: unknown, action: 'create' | 'signin' = 'create'): string {
  if (err instanceof FlowError) return err.message
  if (err instanceof Error && err.name === 'NotAllowedError') {
    if (action === 'signin') {
      return 'No passkey was used. New here? You need an invite link to create an account.'
    }
    return isApple()
      ? 'The passkey wasn’t saved. Check that Passwords (iCloud Keychain) is on in Settings, then try again.'
      : 'The passkey prompt was closed or timed out. Try again when you’re ready.'
  }
  if (err instanceof Error && err.name === 'InvalidStateError') {
    return 'This device already has a passkey for you here.'
  }
  return 'Something went wrong. Please try again.'
}

export async function registerPasskey<T>(
  kind: 'setup' | 'invite' | 'join' | 'passkeys',
  details: unknown = {},
): Promise<T> {
  const optionsJSON = await post<Parameters<typeof startRegistration>[0]['optionsJSON']>(
    `/api/auth/${kind}/options`,
    details,
  )
  const response = await startRegistration({ optionsJSON })
  try {
    return await post<T>(`/api/auth/${kind}/verify`, { response })
  } catch (err) {
    // The phone saved a passkey the server didn't keep: ask it to drop that one, or it
    // comes up first at every sign-in and fails.
    await forgetStalePasskey(optionsJSON.rp.id, response.id)
    throw err
  }
}

export async function signInWithPasskey(): Promise<void> {
  const optionsJSON = await post<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
    '/api/auth/login/options',
    {},
  )
  const response = await startAuthentication({ optionsJSON })
  try {
    await post('/api/auth/login/verify', { response })
  } catch (err) {
    if (err instanceof FlowError && err.data.unknownPasskey)
      await forgetStalePasskey(optionsJSON.rpId, response.id)
    throw err
  }
}

export async function submitRecoveryCode(code: string): Promise<void> {
  await post('/api/auth/recover', { code })
}

export async function signOut(): Promise<void> {
  await post('/api/auth/logout', {})
}
