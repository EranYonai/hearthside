import { bech32 } from '@scure/base'
import { identityToRecipient } from 'age-encryption'

/**
 * Backups can be opened with the owner's passkey. The passkey's PRF extension turns this
 * fixed salt into a secret only that passkey can produce (after Face ID or a PIN). The
 * secret is an age X25519 identity; the server only ever sees its public recipient.
 */
export const BACKUP_PRF_SALT = new TextEncoder().encode('hearthside backup key v1')

const RECIPIENT = /^age1[02-9ac-hj-np-z]{58}$/

export function isRecipient(value: unknown): value is string {
  return typeof value === 'string' && RECIPIENT.test(value)
}

/** The age identity (AGE-SECRET-KEY-1…) for a 32-byte PRF output. */
export function identityFromSecret(secret: Uint8Array): string {
  if (secret.length !== 32) throw new Error('Expected a 32-byte secret')
  return bech32.encodeFromBytes('AGE-SECRET-KEY-', secret).toUpperCase()
}

export async function recipientFromSecret(secret: Uint8Array): Promise<string> {
  return identityToRecipient(identityFromSecret(secret))
}
