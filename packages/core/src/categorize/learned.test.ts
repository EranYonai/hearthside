import { describe, expect, it } from 'vitest'
import { categorizeFast } from './categorize'
import {
  descriptionWords,
  LEARN_MAX_CONFIDENCE,
  LEARN_MIN_EXAMPLES,
  trainLearned,
  type LearnedExample,
} from './learned'

// Synthetic picks only: made-up merchants and amounts.
const pick = (description: string, category: string, amountMinor = -2500): LearnedExample => ({
  description,
  category,
  amountMinor,
})

/** A household that files every Plimbo branch as kids and every Vexor as car. */
function household(): LearnedExample[] {
  const towns = ['North', 'South', 'East', 'West', 'Harbor', 'Hill']
  return [
    ...towns.map((t) => pick(`Plimbo Wumble ${t}`, 'kids')),
    ...towns.map((t) => pick(`Vexor Fuel ${t} 12`, 'car')),
    ...towns.map((t) => pick(`Quarrow Bistro ${t}`, 'eating-out')),
    pick('Dabbit Gym', 'health'),
    pick('Dabbit Gym Annual', 'health'),
    pick('Salary Grommet Ltd', 'income', 900000),
    pick('Refund Grommet Ltd', 'income', 1200),
    pick('From Savings Pot', 'transfer', 50000),
  ]
}

describe('descriptionWords', () => {
  it('keeps words in any script and drops numbers and one-letter bits', () => {
    expect(descriptionWords('  Plimbo-Toys  #123 / A  ')).toEqual(['plimbo', 'toys'])
    expect(descriptionWords('סופר גלים 12')).toEqual(['סופר', 'גלים'])
    expect(descriptionWords('Shop 4u Shop')).toEqual(['shop', '4u'])
  })
})

describe('trainLearned', () => {
  it('waits for enough distinct picks', () => {
    const few = household().slice(0, 10)
    expect(trainLearned(few)).toBeNull()
    // Repeats of one description count once.
    expect(trainLearned(Array.from({ length: 40 }, () => pick('Plimbo Wumble', 'kids')))).toBeNull()
    expect(trainLearned(household())?.size).toBeGreaterThanOrEqual(LEARN_MIN_EXAMPLES)
  })

  it('files unseen but similar descriptions with the household’s choice', () => {
    const model = trainLearned(household())!
    const kids = model.guess('PLIMBO WUMBLE CENTRAL MALL', -4000)
    expect(kids).toMatchObject({ category: 'kids' })
    expect(kids!.confidence).toBeGreaterThanOrEqual(0.75)
    expect(kids!.confidence).toBeLessThanOrEqual(LEARN_MAX_CONFIDENCE)
    expect(kids!.words).toContain('plimbo')
    expect(model.guess('Vexor Fuel Airport 7', -18000)?.category).toBe('car')
    expect(model.guess('Quarrow Bistro Downtown', -9000)?.category).toBe('eating-out')
  })

  it('knows nothing about words it has never seen, or seen only once', () => {
    const model = trainLearned([...household(), pick('Zibble Corner', 'shopping')])!
    expect(model.guess('Totally New Merchant', -1000)).toBeNull()
    expect(model.guess('Zibble Plaza', -1000)).toBeNull()
    expect(model.guess('Plimbo Wumble', 0)).toBeNull()
  })

  it('keeps money in and money out apart', () => {
    const model = trainLearned(household())!
    // Money in has income and transfer; Grommet was always income.
    expect(model.guess('Grommet Ltd Bonus', 30000)?.category).toBe('income')
    // The same words as money out don't borrow from money in.
    expect(model.guess('Grommet Ltd Bonus', -30000)).toBeNull()
  })

  it('is unsure when a word points both ways', () => {
    const model = trainLearned([
      ...household(),
      ...['North', 'South', 'East'].map((t) => pick(`Plimbo Snacks ${t}`, 'groceries')),
    ])!
    const g = model.guess('Plimbo Outlet', -1000)
    expect(g === null || g.confidence < 0.75).toBe(true)
  })
})

describe('categorizeFast with a learned model', () => {
  const learned = trainLearned(household())!

  it('comes after rules, past picks and keywords', () => {
    const entry = { description: 'Plimbo Wumble Central', amountMinor: -4000 }
    expect(categorizeFast(entry, { learned })).toMatchObject({ category: 'kids', via: 'learned' })
    expect(
      categorizeFast(entry, { learned, rules: new Map([['plimbo wumble central', 'shopping']]) }),
    ).toMatchObject({ category: 'shopping', via: 'rule' })
    expect(
      categorizeFast(entry, {
        learned,
        history: new Map([['plimbo wumble central', { category: 'home', count: 2, total: 2 }]]),
      }),
    ).toMatchObject({ category: 'home', via: 'history' })
    // A keyword the built-in list knows still answers first.
    expect(
      categorizeFast({ description: 'Plimbo Wumble Supermarket', amountMinor: -4000 }, { learned }),
    ).toMatchObject({ via: 'keyword' })
  })

  it('can be skipped, and respects the threshold and the category list', () => {
    const entry = { description: 'Plimbo Wumble Central', amountMinor: -4000 }
    expect(categorizeFast(entry, { learned, skip: ['learned'] }).category).toBeNull()
    expect(categorizeFast(entry, { learned, minLearnedConfidence: 0.99 }).category).toBeNull()
    // A household category that was deleted since is never suggested.
    const gone = trainLearned(
      household().map((e) => (e.category === 'kids' ? { ...e, category: 'pets-old' } : e)),
    )!
    expect(categorizeFast(entry, { learned: gone }).category).toBeNull()
  })
})
