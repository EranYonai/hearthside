import { describe, expect, it } from 'vitest'
import { maskFor } from './PrivateAmount'

describe('maskFor', () => {
  it('uses two fewer stars than whole digits', () => {
    expect(maskFor(123_456_00)).toBe('****')
    expect(maskFor(-1_000_00)).toBe('**')
  })
  it('always shows at least one star', () => {
    expect(maskFor(50_00)).toBe('*')
    expect(maskFor(0)).toBe('*')
  })
})
