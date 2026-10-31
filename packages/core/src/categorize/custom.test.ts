import { describe, expect, it } from 'vitest'
import { categorySet, type CustomCategory } from '../categories'
import type { DecisionEngine } from '../decide'
import { categorizeFast, categorizeMany, categoryQuestion, historyFrom } from './categorize'

// Synthetic household categories.
const pets: CustomCategory = {
  slug: 'c-pets1',
  label: 'Pets',
  icon: 'pets',
  direction: 'out',
  keywords: ['vet clinic', 'pet food'],
}
const rent: CustomCategory = {
  slug: 'c-rent1',
  label: 'Rent received',
  icon: 'home',
  direction: 'in',
  keywords: ['tenant'],
}

describe('categorySet', () => {
  it('adds household categories before "Other" and looks them up', () => {
    const set = categorySet([pets])
    expect(set.all.at(-1)!.slug).toBe('other')
    expect(set.all.at(-2)).toEqual({ slug: 'c-pets1', label: 'Pets', icon: 'pets', custom: true })
    expect(set.has('c-pets1')).toBe(true)
    expect(set.has('c-nope')).toBe(false)
    expect(set.label('c-pets1')).toBe('Pets')
    expect(set.label(null)).toBe('Uncategorized')
    expect(set.icon('c-pets1')).toBe('pets')
    expect(set.icon('groceries')).toBe('groceries')
    expect(set.icon('c-nope')).toBe('other')
  })
})

describe('household categories in the categorizer', () => {
  it('matches their keywords, honoring the direction', () => {
    const ctx = { custom: [pets, rent] }
    expect(
      categorizeFast({ description: 'Sunny Vet Clinic', amountMinor: -9000 }, ctx),
    ).toMatchObject({
      category: 'c-pets1',
      via: 'keyword',
    })
    expect(categorizeFast({ description: 'Tenant July', amountMinor: 450000 }, ctx).category).toBe(
      'c-rent1',
    )
    expect(
      categorizeFast({ description: 'Tenant July', amountMinor: -100 }, ctx).category,
    ).toBeNull()
  })

  it('accepts rules and history that point at them, and drops ones that point nowhere', () => {
    const entry = { description: 'Fluffy Things', amountMinor: -500 }
    expect(
      categorizeFast(entry, { custom: [pets], rules: new Map([['fluffy things', 'c-pets1']]) }).via,
    ).toBe('rule')
    expect(
      categorizeFast(entry, { rules: new Map([['fluffy things', 'c-gone']]) }).category,
    ).toBeNull()
    const history = historyFrom(
      [{ descriptionKey: 'fluffy things', category: 'c-pets1', count: 2 }],
      categorySet([pets]),
    )
    expect(categorizeFast(entry, { custom: [pets], history }).category).toBe('c-pets1')
  })

  it('offers them to the model by name and maps the answer back', async () => {
    const { question, slugOf } = categoryQuestion('out', categorySet([pets, rent]))
    expect(Object.keys(question.options)).toContain('Pets')
    expect(Object.keys(question.options)).not.toContain('Rent received')
    expect(slugOf.get('Pets')).toBe('c-pets1')
    const engine: DecisionEngine = {
      name: 'fake',
      decide: async (reqs) =>
        reqs.map(() => ({
          category: {
            type: 'choice',
            choice: 'Pets',
            confidence: 0.9,
            probabilities: { Pets: 0.9, Shopping: 0.1 },
          },
        })) as never,
    }
    const [r] = await categorizeMany([{ description: 'Zorblax 42', amountMinor: -100 }], {
      engine,
      custom: [pets],
    })
    expect(r).toMatchObject({ category: 'c-pets1', via: 'model' })
    expect(r!.alternatives).toEqual([{ category: 'shopping', confidence: 0.1 }])
  })

  it('drops option hints when many categories would not fit the model', () => {
    const many = Array.from({ length: 16 }, (_, i): CustomCategory => ({
      slug: `c-${i}`,
      label: `Household category number ${i}`,
      icon: 'other',
      direction: 'out',
      keywords: ['some long keyword', 'another long keyword'],
    }))
    const small = categoryQuestion('out').question.options as Record<string, string | null>
    expect(small['Groceries']).toBeTruthy()
    const big = categoryQuestion('out', categorySet(many)).question.options as Record<
      string,
      string | null
    >
    expect(Object.keys(big)).toHaveLength(31)
    expect(Object.values(big).every((v) => v === null)).toBe(true)
  })
})
