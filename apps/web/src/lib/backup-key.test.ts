import { Decrypter, Encrypter } from 'age-encryption'
import { describe, expect, it } from 'vitest'
import { identityFromSecret, isRecipient, recipientFromSecret } from './backup-key'

const secret = new Uint8Array(32).map((_, i) => i * 7)

describe('backup key from a passkey secret', () => {
  it('derives the same key every time', async () => {
    const a = await recipientFromSecret(secret)
    expect(a).toBe(await recipientFromSecret(secret.slice()))
    expect(isRecipient(a)).toBe(true)
    expect(identityFromSecret(secret)).toMatch(/^AGE-SECRET-KEY-1[0-9A-Z]+$/)
  })

  it('opens what was encrypted to it, alongside another key', async () => {
    const other = await recipientFromSecret(new Uint8Array(32).fill(9))
    const e = new Encrypter()
    e.addRecipient(await recipientFromSecret(secret))
    e.addRecipient(other)
    const file = await e.encrypt('dump bytes')
    const d = new Decrypter()
    d.addIdentity(identityFromSecret(secret))
    expect(await d.decrypt(file, 'text')).toBe('dump bytes')
  })

  it('rejects anything that is not a recipient', () => {
    expect(isRecipient('age1abc')).toBe(false)
    expect(isRecipient('AGE-SECRET-KEY-1XYZ')).toBe(false)
    expect(isRecipient(42)).toBe(false)
  })
})
