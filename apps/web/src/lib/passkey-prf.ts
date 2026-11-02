'use client'

import { BACKUP_PRF_SALT } from './backup-key'

const b64url = {
  encode(bytes: ArrayBuffer): string {
    let s = ''
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(text: string): Uint8Array<ArrayBuffer> {
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(s, (c) => c.charCodeAt(0))
  },
}

export class PrfUnsupported extends Error {}

/**
 * Asks a passkey for its backup secret (Face ID or PIN). With a credential id, only that
 * passkey is offered. Nothing is sent to the server: this is not a sign-in.
 */
export async function passkeyBackupSecret(
  credentialId?: string,
): Promise<{ secret: Uint8Array; credentialId: string }> {
  if (!window.PublicKeyCredential) throw new PrfUnsupported('This browser has no passkeys')
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      userVerification: 'required',
      ...(credentialId
        ? { allowCredentials: [{ type: 'public-key', id: b64url.decode(credentialId) }] }
        : {}),
      extensions: { prf: { eval: { first: BACKUP_PRF_SALT } } },
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('No passkey was chosen')
  const first = (
    cred.getClientExtensionResults() as { prf?: { results?: { first?: BufferSource } } }
  ).prf?.results?.first
  if (!first)
    throw new PrfUnsupported(
      'This passkey can’t make encryption keys. Try a passkey saved in iCloud Keychain or Google Password Manager.',
    )
  const bytes =
    first instanceof ArrayBuffer
      ? new Uint8Array(first)
      : new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
  if (bytes.length < 32) throw new PrfUnsupported('This passkey gave a short key')
  return { secret: bytes.slice(0, 32), credentialId: b64url.encode(cred.rawId) }
}
