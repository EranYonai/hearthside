import { afterEach, describe, expect, it } from 'vitest'
import {
  blindIndex,
  blindWith,
  decrypt,
  decryptWith,
  encrypt,
  encryptWith,
  KeyError,
  masterKeyId,
  newKey,
  parseMasterKeys,
  sealedKeyId,
  setKeyring,
  unwrapKey,
  wrapKey,
  type Keyring,
} from './crypto'

const ring = (activeId = 1, keys = new Map([[1, newKey()]])): Keyring => ({
  activeId,
  dataKeys: keys,
  indexKey: newKey(),
})

describe('field encryption', () => {
  it('round-trips and never repeats a ciphertext', () => {
    const r = ring()
    const a = encryptWith(r, 'Coffee shop', 'transactions.description')
    const b = encryptWith(r, 'Coffee shop', 'transactions.description')
    expect(a).toMatch(/^hs1:1:/)
    expect(a).not.toBe(b)
    expect(a).not.toContain('Coffee')
    expect(decryptWith(r, a, 'transactions.description')).toBe('Coffee shop')
    expect(decryptWith(r, encryptWith(r, '', 'x'), 'x')).toBe('')
    expect(decryptWith(r, encryptWith(r, 'שלום 🙂', 'x'), 'x')).toBe('שלום 🙂')
  })

  it('binds a value to its column', () => {
    const r = ring()
    const sealed = encryptWith(r, 'Alex', 'members.name')
    expect(() => decryptWith(r, sealed, 'accounts.name')).toThrow()
  })

  it('detects tampering', () => {
    const r = ring()
    const sealed = encryptWith(r, '1234', 'accounts.last4')
    const flipped = sealed.slice(0, -2) + (sealed.at(-2) === 'A' ? 'B' : 'A') + sealed.at(-1)
    expect(() => decryptWith(r, flipped, 'accounts.last4')).toThrow()
    expect(() => decryptWith(r, 'hs1:1:abc', 'accounts.last4')).toThrow(KeyError)
  })

  it('decrypts with older data keys and seals with the active one', () => {
    const old = newKey()
    const r1 = ring(1, new Map([[1, old]]))
    const sealed = encryptWith(r1, 'Sam', 'members.name')
    const r2 = ring(
      2,
      new Map([
        [1, old],
        [2, newKey()],
      ]),
    )
    expect(decryptWith(r2, sealed, 'members.name')).toBe('Sam')
    expect(sealedKeyId(encryptWith(r2, 'Sam', 'members.name'))).toBe(2)
    expect(() => decryptWith(ring(2, new Map([[2, newKey()]])), sealed, 'members.name')).toThrow(
      'Data key 1 is not loaded',
    )
  })

  it('refuses plaintext and a missing active key', () => {
    expect(sealedKeyId('plain')).toBeNull()
    expect(() => decryptWith(ring(), 'plain', 'x')).toThrow('not encrypted')
    expect(() => encryptWith(ring(9), 'x', 'x')).toThrow('active data key')
  })
})

describe('blind index', () => {
  it('is stable per key and reveals nothing readable', () => {
    const r = ring()
    expect(blindWith(r, 'coffee')).toBe(blindWith(r, 'coffee'))
    expect(blindWith(r, 'coffee')).not.toBe(blindWith(r, 'tea'))
    expect(blindWith(r, 'coffee')).not.toBe(blindWith(ring(), 'coffee'))
    expect(blindWith(r, 'coffee')).toMatch(/^hb1:[\w-]{43}$/)
  })
})

describe('master keys', () => {
  const k = () => newKey().toString('base64')

  it('parses one key per line, current first', () => {
    const [a, b] = [k(), k()]
    const keys = parseMasterKeys(`# current\n${a}\n\n${b}\n`)
    expect(keys.map((x) => x.toString('base64'))).toEqual([a, b])
  })

  it('rejects empty files and short keys', () => {
    expect(() => parseMasterKeys('# nothing\n')).toThrow('no keys')
    expect(() => parseMasterKeys('c2hvcnQ=')).toThrow('32 bytes')
  })

  it('wraps data keys per purpose', () => {
    const master = newKey()
    const data = newKey()
    const wrapped = wrapKey(master, data, 'data')
    expect(unwrapKey(master, wrapped, 'data').equals(data)).toBe(true)
    expect(() => unwrapKey(master, wrapped, 'index')).toThrow()
    expect(() => unwrapKey(newKey(), wrapped, 'data')).toThrow()
    expect(masterKeyId(master)).toMatch(/^[0-9a-f]{16}$/)
    expect(masterKeyId(master)).not.toBe(masterKeyId(newKey()))
  })
})

describe('process keyring', () => {
  afterEach(() => setKeyring(undefined))

  it('fails closed until keys are loaded', () => {
    expect(() => encrypt('x', 'y')).toThrow('not loaded')
    expect(() => blindIndex('x')).toThrow('not loaded')
    setKeyring(ring())
    expect(decrypt(encrypt('x', 'y'), 'y')).toBe('x')
  })
})
