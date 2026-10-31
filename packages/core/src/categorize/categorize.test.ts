import { describe, expect, it, vi } from 'vitest'
import { DecisionUnavailable, type DecisionEngine, type DecisionRequest } from '../decide'
import {
  categorize,
  categorizeFast,
  categorizeMany,
  categoryRequest,
  historyFrom,
} from './categorize'
import { matchKeyword } from './keywords'

// Synthetic entries only: made-up merchants and amounts.
const out = (description: string, amountMinor = -4590) => ({ description, amountMinor })

/** A fake model that answers from a table of description -> [choice, confidence]. */
function fakeEngine(
  table: Record<string, [string, number]>,
): DecisionEngine & { calls: DecisionRequest[][] } {
  const calls: DecisionRequest[][] = []
  return {
    name: 'fake',
    calls,
    async decide(requests) {
      calls.push(requests as unknown as DecisionRequest[])
      return requests.map((r) => {
        const d = (r.state as { description: string }).description
        const [choice, p] = table[d] ?? ['other', 0.3]
        const opts = Object.keys(
          (r.questions as unknown as { category: { options: object } }).category.options,
        )
        const rest = (1 - p) / (opts.length - 1)
        return {
          category: {
            type: 'choice',
            choice,
            confidence: p,
            probabilities: Object.fromEntries(opts.map((o) => [o, o === choice ? p : rest])),
          },
        }
      }) as never
    },
  }
}

describe('categorizeFast', () => {
  it('prefers a rule over everything else', () => {
    const s = categorizeFast(out('Corner Cafe'), {
      rules: new Map([['corner cafe', 'groceries']]),
      history: new Map([['corner cafe', { category: 'shopping', count: 5, total: 5 }]]),
    })
    expect(s).toEqual({ category: 'groceries', via: 'rule', confidence: 1 })
  })

  it('ignores a rule naming an unknown category', () => {
    expect(
      categorizeFast(out('Corner Cafe'), { rules: new Map([['corner cafe', 'nope']]) }).via,
    ).toBe('keyword')
  })

  it('uses past manual choices when they agree', () => {
    const s = categorizeFast(out('Sunny Lane Shop'), {
      history: new Map([['sunny lane shop', { category: 'kids', count: 3, total: 4 }]]),
    })
    expect(s.category).toBe('kids')
    expect(s.via).toBe('history')
    expect(s.confidence).toBeGreaterThan(0.6)
    expect(s.confidence).toBeLessThan(1)
  })

  it('skips history that is split', () => {
    const s = categorizeFast(out('Sunny Lane Shop'), {
      history: new Map([['sunny lane shop', { category: 'kids', count: 1, total: 2 }]]),
    })
    expect(s.category).toBeNull()
  })

  it('falls back to keywords, and skips steps on request', () => {
    expect(categorizeFast(out('Green Leaf Supermarket')).category).toBe('groceries')
    expect(categorizeFast(out('Green Leaf Supermarket'), { skip: ['keyword'] }).category).toBeNull()
  })

  it('returns nothing it can’t place', () => {
    expect(categorizeFast(out('Zorblax 42'))).toEqual({ category: null, via: null, confidence: 0 })
  })
})

describe('matchKeyword', () => {
  it('matches whole Latin words only', () => {
    expect(matchKeyword('the barn', -1)).toBeUndefined()
    expect(matchKeyword('blue bar & grill', -1)?.category).toBe('eating-out')
  })

  it('matches Hebrew with a one-letter prefix and long words running on', () => {
    expect(matchKeyword('בסופרמרקט השכונה', -1)?.category).toBe('groceries')
    expect(matchKeyword('הדלק שלי', -1)?.category).toBe('car')
    // Short words must stand alone: "מים" inside a longer word is not water.
    expect(matchKeyword('שמימי', -1)).toBeUndefined()
  })

  it('keeps money in to money-in categories', () => {
    expect(matchKeyword('salary october', 100000)?.category).toBe('income')
    expect(matchKeyword('supermarket refund', 1000)).toBeUndefined()
    expect(matchKeyword('salary', -100)).toBeUndefined()
  })

  it('prefers the more specific phrase and accepts extra words', () => {
    expect(matchKeyword('north gas station', -1)?.category).toBe('car')
    expect(matchKeyword('acme tutoring', -1, { kids: ['acme tutoring'] })?.category).toBe('kids')
  })
})

describe('categorizeMany', () => {
  it('asks the model only about what is left, once per description', async () => {
    const engine = fakeEngine({ 'Zorblax 42': ['shopping', 0.82] })
    const result = await categorizeMany(
      [out('Zorblax 42'), out('Green Leaf Supermarket'), out('Zorblax 42', -100)],
      { engine },
    )
    expect(result.map((r) => [r.category, r.via])).toEqual([
      ['shopping', 'model'],
      ['groceries', 'keyword'],
      ['shopping', 'model'],
    ])
    expect(engine.calls).toHaveLength(1)
    expect(engine.calls[0]).toHaveLength(1)
    expect(result[0]!.alternatives).toHaveLength(2)
  })

  it('keeps unsure model answers as suggestions only', async () => {
    const engine = fakeEngine({ 'Zorblax 42': ['shopping', 0.4] })
    const [r] = await categorizeMany([out('Zorblax 42')], { engine })
    expect(r!.category).toBeNull()
    expect(r!.alternatives?.[0]?.category).toBe('shopping')
    const [lower] = await categorizeMany([out('Zorblax 42')], { engine, minConfidence: 0.3 })
    expect(lower!.category).toBe('shopping')
  })

  it('ignores answers outside the category list', async () => {
    const engine = fakeEngine({ 'Zorblax 42': ['made-up', 0.99] })
    expect((await categorize(out('Zorblax 42'), { engine })).category).toBeNull()
  })

  it('marks entries to retry when the model is unavailable', async () => {
    const engine: DecisionEngine = {
      name: 'down',
      decide: () => Promise.reject(new DecisionUnavailable('down')),
    }
    const r = await categorizeMany([out('Zorblax 42'), out('Supermarket')], { engine })
    expect(r[0]).toMatchObject({ category: null, retry: true })
    expect(r[1]!.category).toBe('groceries')
  })

  it('rethrows other errors', async () => {
    const engine: DecisionEngine = { name: 'bug', decide: () => Promise.reject(new Error('bug')) }
    await expect(categorizeMany([out('Zorblax 42')], { engine })).rejects.toThrow('bug')
  })

  it('skips the model on request, and for zero amounts', async () => {
    const engine = { name: 'spy', decide: vi.fn() }
    await categorizeMany([out('Zorblax 42')], { engine, skip: ['model'] })
    await categorizeMany([out('Zorblax 42', 0)], { engine })
    expect(engine.decide).not.toHaveBeenCalled()
  })
})

describe('categoryRequest', () => {
  it('offers spending categories for money out and income ones for money in', () => {
    const spend = categoryRequest({ ...out('Zorblax 42'), accountKind: 'card' })
    expect(Object.keys(spend.questions.category.options)).not.toContain('income')
    expect(spend.state).toMatchObject({
      amount: '45.90 ILS',
      direction: 'money out',
      account: 'card',
    })
    const income = categoryRequest({
      description: 'Acme Ltd',
      amountMinor: 120000,
      currency: 'EUR',
    })
    expect(Object.keys(income.questions.category.options)).toContain('income')
    expect(income.state).toMatchObject({ amount: '1200.00 EUR', direction: 'money in' })
  })
})

describe('historyFrom', () => {
  it('keeps the most chosen category and the total', () => {
    const h = historyFrom([
      { descriptionKey: 'a', category: 'kids', count: 3 },
      { descriptionKey: 'a', category: 'shopping', count: 1 },
      { descriptionKey: 'b', category: 'not-a-category', count: 9 },
    ])
    expect(h.get('a')).toEqual({ category: 'kids', count: 3, total: 4 })
    expect(h.has('b')).toBe(false)
  })
})
