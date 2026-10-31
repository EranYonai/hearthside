import { describe, expect, it } from 'vitest'
import { DecisionUnavailable, type DecisionEngine, type DecisionRequest } from '../decide'
import { alertFast, alertRequest, checkAlerts, feeAlert, spikeAlert } from './alerts'

// Synthetic entries only.
function engine(yes: Record<string, number>): DecisionEngine & { asked: DecisionRequest[] } {
  const asked: DecisionRequest[] = []
  return {
    name: 'fake',
    asked,
    decide: async (reqs) => {
      asked.push(...(reqs as unknown as DecisionRequest[]))
      return reqs.map((r) => {
        const p = yes[(r.state as { description: string }).description] ?? 0.1
        return { alert: { type: 'yesno', yes: p, confidence: Math.max(p, 1 - p) } }
      }) as never
    },
  }
}

describe('feeAlert', () => {
  it.each([
    'Card annual fee',
    'Overdraft interest',
    'Late charge',
    'עמלת משיכה',
    'ריבית חובה',
    'בקנס חניה',
  ])('flags %s', (d) => expect(feeAlert(d)?.reason).toBe('fee'))

  it.each(['Coffee', 'Feed store', 'Fiesta', 'מכולת השכונה'])('leaves %s alone', (d) =>
    expect(feeAlert(d)).toBeUndefined(),
  )
})

describe('spikeAlert', () => {
  const usual = [-10000, -12000, -11000]
  it('flags money out at 3× the usual or more', () => {
    expect(spikeAlert(-40000, usual)?.reason).toBe('spike')
    expect(spikeAlert(-30000, usual)).toBeUndefined()
  })
  it('needs three past entries, money out and a real sum', () => {
    expect(spikeAlert(-40000, usual.slice(0, 2))).toBeUndefined()
    expect(spikeAlert(40000, usual)).toBeUndefined()
    expect(spikeAlert(-4000, [-500, -500, -500])).toBeUndefined()
  })
})

describe('checkAlerts', () => {
  const amounts = new Map([['grid power', [-10000, -10000, -10000]]])

  it('uses cheap checks first and asks the model once per description about the rest', async () => {
    const e = engine({ 'Zorblax 42': 0.9 })
    const results = await checkAlerts(
      [
        { description: 'Card annual fee', amountMinor: -2500 },
        { description: 'Grid Power', amountMinor: -50000 },
        { description: 'Zorblax 42', amountMinor: -1000 },
        { description: 'Zorblax 42', amountMinor: -1200 },
        { description: 'Quindle Ltd', amountMinor: -900 },
        { description: 'Salary', amountMinor: 900000 },
      ],
      { amounts, engine: e },
    )
    expect(results.map((r) => r.alert?.reason ?? null)).toEqual([
      'fee',
      'spike',
      'model',
      'model',
      null,
      null,
    ])
    expect(e.asked).toHaveLength(2)
  })

  it('works without the model, and marks entries to retry when it is down', async () => {
    expect((await checkAlerts([{ description: 'Zorblax 42', amountMinor: -1 }]))[0]).toEqual({
      alert: null,
    })
    const down: DecisionEngine = {
      name: 'down',
      decide: () => Promise.reject(new DecisionUnavailable('down')),
    }
    expect(
      (await checkAlerts([{ description: 'Zorblax 42', amountMinor: -1 }], { engine: down }))[0],
    ).toEqual({ alert: null, retry: true })
    const bug: DecisionEngine = { name: 'bug', decide: () => Promise.reject(new Error('bug')) }
    await expect(
      checkAlerts([{ description: 'Zorblax 42', amountMinor: -1 }], { engine: bug }),
    ).rejects.toThrow('bug')
  })

  it('builds a yes/no question and checks cheap signals alone', () => {
    const req = alertRequest({ description: 'Zorblax 42', amountMinor: -1234, accountKind: 'card' })
    expect(req.questions.alert.type).toBe('yesno')
    expect(req.state).toMatchObject({
      amount: '12.34 ILS',
      direction: 'money out',
      account: 'card',
    })
    expect(alertFast({ description: 'Grid Power', amountMinor: -50000 }, { amounts })?.reason).toBe(
      'spike',
    )
  })
})
