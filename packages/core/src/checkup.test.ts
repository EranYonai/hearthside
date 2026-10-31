import { describe, expect, it } from 'vitest'
import {
  checkup,
  type CheckupInput,
  cleanInvestSettings,
  DEFAULT_INVEST_SETTINGS,
  investSettings,
  InvestSettingsError,
} from './checkup'

const base: CheckupInput = {
  settings: DEFAULT_INVEST_SETTINGS,
  byClass: { global_stocks: 8000, bonds: 1500, cash: 500 },
  fees: [{ name: 'Test World', fee: 0.1 }],
  securities: 2,
  cashMinor: 700,
  monthlySpendMinor: 100,
  depositDays: ['2026-10-20'],
  today: '2026-10-31',
}

const status = (input: CheckupInput) =>
  Object.fromEntries(checkup(input).map((i) => [i.key, i.status]))

describe('investSettings', () => {
  it('cleans and defaults', () => {
    expect(cleanInvestSettings({ stocksTarget: '60', emergencyMonths: 3 })).toEqual({
      stocksTarget: 60,
      emergencyMonths: 3,
      checkupOn: true,
    })
    expect(
      cleanInvestSettings({ stocksTarget: 100, emergencyMonths: 0, checkupOn: false }),
    ).toMatchObject({ checkupOn: false })
    for (const bad of [
      { stocksTarget: 101, emergencyMonths: 3 },
      { stocksTarget: 'x', emergencyMonths: 3 },
      { stocksTarget: 50.5, emergencyMonths: 3 },
      { stocksTarget: 50, emergencyMonths: 25 },
    ])
      expect(() => cleanInvestSettings(bad)).toThrow(InvestSettingsError)
    expect(investSettings(null)).toEqual(DEFAULT_INVEST_SETTINGS)
    expect(investSettings({ stocksTarget: 70 }).emergencyMonths).toBe(6)
  })
})

describe('checkup', () => {
  it('is quiet when things are on track', () => {
    expect(status(base)).toEqual({
      split: 'ok',
      fees: 'ok',
      home: 'ok',
      emergency: 'ok',
      deposits: 'ok',
    })
    expect(checkup(base).find((i) => i.key === 'fees')!.detail).toContain('1 more has')
  })

  it('nudges gently on drift, fees, home bias and gaps', () => {
    const items = checkup({
      ...base,
      byClass: { local_stocks: 7000, global_stocks: 2000, bonds: 1000 },
      fees: [
        { name: 'Pricey A', fee: 1.2 },
        { name: 'Pricey B', fee: 0.8 },
      ],
      depositDays: ['2026-08-01'],
    })
    expect(Object.fromEntries(items.map((i) => [i.key, i.status]))).toMatchObject({
      split: 'nudge',
      fees: 'nudge',
      home: 'nudge',
      deposits: 'nudge',
    })
    const text = items.map((i) => `${i.title} ${i.detail}`).join(' ')
    expect(text).toContain('heavy on stocks')
    expect(text).toContain('bonds and cash side')
    expect(text).toContain('2 funds')
    expect(text).not.toMatch(/\b(sell|buy) now\b/i)
    expect(checkup({ ...base, byClass: { global_stocks: 5000, bonds: 5000 } })[0]!.title).toContain(
      'light on stocks',
    )
    expect(checkup({ ...base, fees: [{ name: 'One', fee: 2 }] })[1]!.title).toContain('One fund')
  })

  it('explains what it can’t check yet', () => {
    const items = checkup({
      ...base,
      byClass: {},
      fees: [],
      monthlySpendMinor: null,
      depositDays: [],
    })
    expect(Object.fromEntries(items.map((i) => [i.key, i.status]))).toEqual({
      split: 'info',
      fees: 'info',
      emergency: 'info',
      deposits: 'info',
    })
    expect(status({ ...base, securities: 0, fees: [] }).fees).toBeUndefined()
    expect(status({ ...base, cashMinor: 10 }).emergency).toBe('info')
    expect(
      status({ ...base, settings: { ...base.settings, emergencyMonths: 0 } }).emergency,
    ).toBeUndefined()
    expect(checkup({ ...base, depositDays: ['2026-10-31'] }).at(-1)!.detail).toContain('today')
    expect(checkup({ ...base, depositDays: ['2026-10-30'] }).at(-1)!.detail).toContain('yesterday')
  })
})
