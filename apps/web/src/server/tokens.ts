import { createHash, randomBytes, randomInt } from 'node:crypto'

/** URL-safe random token with `bytes` of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

// Crockford-style alphabet: no 0/O, 1/I/L, U, so codes survive being read aloud or written down.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

/** A recovery code like `K7PQ-M2XD-9RTA` (about 59 bits). */
export function recoveryCode(): string {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)])
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join('')).join('-')
}

/** Accept lower case, spaces and missing dashes. */
export function normalizeRecoveryCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return raw.length === 12 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}` : raw
}

export const RECOVERY_CODE_COUNT = 10
