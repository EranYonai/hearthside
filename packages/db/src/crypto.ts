import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Field encryption for private columns.
 *
 * A master key (from a secret file, never in the database or the repo) wraps the data keys,
 * which live in the encryption_keys table. Values are sealed with AES-256-GCM under the active
 * data key; the column name is the associated data, so a value can't be moved to another column.
 * Exact-match lookups use a keyed hash (HMAC-SHA-256) under a separate index key.
 *
 *   ciphertext   hs1:<data key id>:<base64url(iv | ciphertext | tag)>
 *   blind index  hb1:<base64url(hmac)>
 */

export const CIPHER_PREFIX = 'hs1:'
export const BLIND_PREFIX = 'hb1:'

const IV_BYTES = 12
const TAG_BYTES = 16
export const KEY_BYTES = 32

export class KeyError extends Error {
  override name = 'KeyError'
}

export interface Keyring {
  /** Id of the data key new values are sealed with. */
  activeId: number
  dataKeys: ReadonlyMap<number, Buffer>
  indexKey: Buffer
}

function b64(buf: Buffer): string {
  return buf.toString('base64url')
}

export function seal(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad))
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return b64(Buffer.concat([iv, body, cipher.getAuthTag()]))
}

export function open(key: Buffer, sealed: string, aad: string): string {
  const raw = Buffer.from(sealed, 'base64url')
  if (raw.length < IV_BYTES + TAG_BYTES) throw new KeyError('Ciphertext is too short')
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES))
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES))
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8')
}

export function encryptWith(ring: Keyring, plaintext: string, aad: string): string {
  const key = ring.dataKeys.get(ring.activeId)
  if (!key) throw new KeyError('The active data key is missing')
  return `${CIPHER_PREFIX}${ring.activeId}:${seal(key, plaintext, aad)}`
}

/** The data key id a stored value was sealed with, or null for plaintext. */
export function sealedKeyId(stored: string): number | null {
  if (!stored.startsWith(CIPHER_PREFIX)) return null
  const id = Number(stored.slice(CIPHER_PREFIX.length, stored.indexOf(':', CIPHER_PREFIX.length)))
  return Number.isInteger(id) ? id : null
}

export function decryptWith(ring: Keyring, stored: string, aad: string): string {
  const id = sealedKeyId(stored)
  if (id === null) throw new KeyError('Value is not encrypted')
  const key = ring.dataKeys.get(id)
  if (!key) throw new KeyError(`Data key ${id} is not loaded`)
  return open(key, stored.slice(stored.indexOf(':', CIPHER_PREFIX.length) + 1), aad)
}

export function blindWith(ring: Keyring, value: string): string {
  return BLIND_PREFIX + b64(createHmac('sha256', ring.indexKey).update(value, 'utf8').digest())
}

// ---------- Master keys ----------

/**
 * Parse the master key file: one base64 key of 32 bytes per line, current key first. Older keys
 * stay listed during a rotation, until startup has rewrapped the data keys under the new one.
 */
export function parseMasterKeys(text: string): Buffer[] {
  const keys = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l, i) => {
      const key = Buffer.from(l, 'base64')
      if (key.length !== KEY_BYTES)
        throw new KeyError(`Master key on line ${i + 1} must be ${KEY_BYTES} bytes of base64`)
      return key
    })
  if (keys.length === 0) throw new KeyError('The master key file has no keys')
  return keys
}

/** Short public fingerprint, so the database records which master key wrapped a data key. */
export function masterKeyId(key: Buffer): string {
  return createHmac('sha256', key).update('hearthside master key id').digest('hex').slice(0, 16)
}

export function wrapKey(master: Buffer, key: Buffer, purpose: string): string {
  return seal(master, key.toString('base64'), `encryption_keys.${purpose}`)
}

export function unwrapKey(master: Buffer, wrapped: string, purpose: string): Buffer {
  const key = Buffer.from(open(master, wrapped, `encryption_keys.${purpose}`), 'base64')
  if (key.length !== KEY_BYTES) throw new KeyError('Unwrapped key has the wrong length')
  return key
}

export function newKey(): Buffer {
  return randomBytes(KEY_BYTES)
}

export function sameKey(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

// ---------- Process-wide keyring ----------

// Kept on globalThis: Next bundles instrumentation and routes separately, and both must see it.
const SLOT = Symbol.for('hearthside.keyring')
type Slot = { [SLOT]?: Keyring }

export function setKeyring(ring: Keyring | undefined): void {
  ;(globalThis as Slot)[SLOT] = ring
}

export function getKeyring(): Keyring {
  const ring = (globalThis as Slot)[SLOT]
  if (!ring) throw new KeyError('Encryption keys are not loaded')
  return ring
}

export function hasKeyring(): boolean {
  return !!(globalThis as Slot)[SLOT]
}

export function encrypt(plaintext: string, aad: string): string {
  return encryptWith(getKeyring(), plaintext, aad)
}

export function decrypt(stored: string, aad: string): string {
  return decryptWith(getKeyring(), stored, aad)
}

/** Keyed hash for exact-match lookups (dedup, rules) without storing the value. */
export function blindIndex(value: string): string {
  return blindWith(getKeyring(), value)
}
