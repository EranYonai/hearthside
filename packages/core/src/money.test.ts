import { describe, expect, it } from 'vitest'
import { MINUS, direction, formatMoney, moneyLabel } from './money'

describe('formatMoney', () => {
  it('uses a true minus sign for money out', () => {
    expect(formatMoney(-41230)).toBe(`${MINUS}₪412.30`)
  })

  it('adds a plus when signed and positive', () => {
    expect(formatMoney(1620000, { signed: true, whole: true })).toBe('+₪16,200')
  })

  it('leaves zero and unsigned positives plain', () => {
    expect(formatMoney(0, { signed: true })).toBe('₪0.00')
    expect(formatMoney(682000, { whole: true })).toBe('₪6,820')
  })

  it('rounds whole amounts', () => {
    expect(formatMoney(682050, { whole: true })).toBe('₪6,821')
  })

  it('formats other currencies', () => {
    expect(formatMoney(4800, { currency: 'USD' })).toBe('$48.00')
  })

  it('formats Hebrew locale', () => {
    expect(formatMoney(123450, { locale: 'he-IL' })).toContain('1,234.50')
  })

  it('rejects non-integer minor units', () => {
    expect(() => formatMoney(1.5)).toThrow(TypeError)
  })
})

describe('direction and labels', () => {
  it('derives direction', () => {
    expect(direction(-1)).toBe('out')
    expect(direction(5)).toBe('in')
  })

  it('states direction for screen readers', () => {
    expect(moneyLabel(-41230)).toBe('spent 412 shekels 30')
    expect(moneyLabel(100)).toBe('received 1 shekel')
    expect(moneyLabel(1620000)).toBe('received 16200 shekels')
    expect(moneyLabel(-4800, 'USD')).toBe('spent $48.00')
  })
})
