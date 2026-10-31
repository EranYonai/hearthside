import { CATEGORIES, isCategory, type CategorySlug } from '../categories'
import {
  DecisionUnavailable,
  type ChoiceQuestion,
  type DecisionEngine,
  type DecisionRequest,
} from '../decide'
import { normalizeDescription } from '../import/values'
import { matchKeyword } from './keywords'

/** What the categorizer looks at. Only the description and the amount are required. */
export interface CategorizeInput {
  description: string
  /** Integer minor units; negative is money out. */
  amountMinor: number
  currency?: string
  /**
   * The key rules and history are stored under: normalizeDescription(description) or an opaque
   * index of it. Defaults to normalizeDescription(description).
   */
  descriptionKey?: string
  /** 'card' | 'bank' | 'other', as on the account. */
  accountKind?: string
}

/** Where a category came from, strongest first. */
export type CategoryVia = 'rule' | 'history' | 'keyword' | 'model'

export interface CategorySuggestion {
  /** null when nothing was sure enough. */
  category: CategorySlug | null
  via: CategoryVia | null
  /** 0..1. Rules are 1. */
  confidence: number
  /** The model's runner-up options, best first, when the model was asked. */
  alternatives?: readonly { category: CategorySlug; confidence: number }[]
  /** Short, human-readable reason, e.g. the keyword that matched. */
  reason?: string
  /** The model was needed but unavailable: try this entry again later. */
  retry?: true
}

/** One description's past manual choices. */
export interface HistoryEntry {
  category: CategorySlug
  /** How many times it was chosen. */
  count: number
  /** How many manual choices exist for the description, any category. */
  total: number
}

export interface CategorizeContext {
  /** "Always use this" rules: descriptionKey -> category. */
  rules?: ReadonlyMap<string, string>
  /** Past manual choices: descriptionKey -> most chosen category. */
  history?: ReadonlyMap<string, HistoryEntry>
  /** Extra keywords on top of the built-in list. */
  keywords?: Readonly<Record<string, readonly string[]>>
  /** The model. Leave out to run rules, history and keywords only. */
  engine?: DecisionEngine | null
  /** Keep model answers at or above this probability. Default 0.6. */
  minConfidence?: number
  /** Skip steps, e.g. ['model'] for a fast pass during import. */
  skip?: readonly CategoryVia[]
}

const NONE: CategorySuggestion = { category: null, via: null, confidence: 0 }
export const DEFAULT_MIN_CONFIDENCE = 0.6

/** Short descriptions the model sees for each option. */
const DESCRIPTIONS: Record<CategorySlug, string> = {
  groceries: 'supermarket, food shopping, bakery',
  'eating-out': 'restaurants, cafes, takeaway and food delivery',
  home: 'furniture, repairs, home goods, garden',
  bills: 'electricity, water, gas, city tax, phone, internet, insurance',
  car: 'fuel, parking, car service, tolls',
  transport: 'public transport, taxis, ride sharing',
  kids: 'childcare, school, toys, activities for children',
  health: 'pharmacy, doctors, dentist, clinics',
  shopping: 'clothes, electronics, online stores, gifts',
  subscriptions: 'streaming, apps, software, memberships',
  travel: 'flights, hotels, holiday rentals',
  income: 'salary, refunds, benefits received',
  savings: 'money moved to savings or deposits',
  transfer: 'money moved between own accounts or sent to people',
  pension: 'pension and long-term savings funds',
  other: 'anything else',
}

const MONEY_OUT_OPTIONS = CATEGORIES.map((c) => c.slug).filter((s) => s !== 'income')
const MONEY_IN_OPTIONS: CategorySlug[] = ['income', 'transfer', 'savings', 'other']

function options(slugs: readonly CategorySlug[]): Record<string, string> {
  return Object.fromEntries(slugs.map((s) => [s, DESCRIPTIONS[s]]))
}

const QUESTION_OUT: ChoiceQuestion = {
  type: 'choice',
  instructions: 'Which household budget category does this payment belong to?',
  options: options(MONEY_OUT_OPTIONS),
}
const QUESTION_IN: ChoiceQuestion = {
  type: 'choice',
  instructions: 'What kind of money coming in is this?',
  options: options(MONEY_IN_OPTIONS),
}

/** The question the model is asked about one entry, exported so other features can reuse it. */
export function categoryRequest(
  input: CategorizeInput,
): DecisionRequest<{ category: ChoiceQuestion }> {
  const money = (Math.abs(input.amountMinor) / 100).toFixed(2)
  return {
    state: {
      description: input.description.slice(0, 300),
      amount: `${money} ${input.currency ?? 'ILS'}`,
      direction: input.amountMinor < 0 ? 'money out' : 'money in',
      ...(input.accountKind ? { account: input.accountKind } : {}),
    },
    questions: { category: input.amountMinor < 0 ? QUESTION_OUT : QUESTION_IN },
  }
}

function keyOf(input: CategorizeInput) {
  return input.descriptionKey ?? normalizeDescription(input.description)
}

/** Everything but the model: synchronous and cheap. */
export function categorizeFast(
  input: CategorizeInput,
  ctx: CategorizeContext = {},
): CategorySuggestion {
  const key = keyOf(input)
  const skip = new Set(ctx.skip)
  const rule = !skip.has('rule') ? ctx.rules?.get(key) : undefined
  if (rule && isCategory(rule)) return { category: rule, via: 'rule', confidence: 1 }
  const past = !skip.has('history') ? ctx.history?.get(key) : undefined
  if (past && past.total > 0 && past.count / past.total >= 0.6)
    return {
      category: past.category,
      via: 'history',
      // Never as sure as a rule, and more sure the more often it was picked.
      confidence: Math.min(0.95, 0.7 + 0.05 * past.count) * (past.count / past.total),
      reason: `picked ${past.count} of ${past.total} times before`,
    }
  if (!skip.has('keyword')) {
    // The key may be an opaque index, so keywords always read the description itself.
    const hit = matchKeyword(
      normalizeDescription(input.description),
      input.amountMinor,
      ctx.keywords,
    )
    if (hit)
      return { category: hit.category, via: 'keyword', confidence: 0.8, reason: `“${hit.word}”` }
  }
  return NONE
}

/** Categorize one entry. The model is asked only when nothing cheaper answers. */
export async function categorize(input: CategorizeInput, ctx: CategorizeContext = {}) {
  const [one] = await categorizeMany([input], ctx)
  return one!
}

/**
 * Categorize many entries. Entries with the same description and direction share one model
 * question. If the model is unavailable, those entries come back uncategorized; other errors throw.
 */
export async function categorizeMany(
  inputs: readonly CategorizeInput[],
  ctx: CategorizeContext = {},
): Promise<CategorySuggestion[]> {
  const out = inputs.map((i) => categorizeFast(i, ctx))
  const engine = ctx.skip?.includes('model') ? null : ctx.engine
  if (!engine) return out

  const groups = new Map<string, number[]>()
  inputs.forEach((input, i) => {
    if (out[i]!.category || input.amountMinor === 0) return
    const g = `${input.amountMinor < 0 ? '-' : '+'}${keyOf(input)}`
    const list = groups.get(g)
    if (list) list.push(i)
    else groups.set(g, [i])
  })
  if (groups.size === 0) return out

  const firsts = [...groups.values()].map((idx) => idx[0]!)
  let answers
  try {
    answers = await engine.decide(firsts.map((i) => categoryRequest(inputs[i]!)))
  } catch (e) {
    if (!(e instanceof DecisionUnavailable)) throw e
    for (const idx of groups.values()) for (const i of idx) out[i] = { ...NONE, retry: true }
    return out
  }
  const min = ctx.minConfidence ?? DEFAULT_MIN_CONFIDENCE
  ;[...groups.values()].forEach((idx, g) => {
    const a = answers[g]?.category
    if (!a || !isCategory(a.choice)) return
    const ranked = Object.entries(a.probabilities)
      .filter((e): e is [CategorySlug, number] => isCategory(e[0]))
      .sort((x, y) => y[1] - x[1])
    const suggestion: CategorySuggestion =
      a.confidence >= min
        ? {
            category: a.choice,
            via: 'model',
            confidence: a.confidence,
            alternatives: ranked
              .slice(1, 3)
              .map(([category, confidence]) => ({ category, confidence })),
          }
        : {
            ...NONE,
            // Not sure enough to file it, but the guesses are useful to show as suggestions.
            alternatives: ranked
              .slice(0, 3)
              .map(([category, confidence]) => ({ category, confidence })),
          }
    for (const i of idx) out[i] = suggestion
  })
  return out
}

/** Build the history map from rows of past manual choices. */
export function historyFrom(
  rows: readonly { descriptionKey: string; category: string; count: number }[],
): Map<string, HistoryEntry> {
  const totals = new Map<string, number>()
  const best = new Map<string, { category: CategorySlug; count: number }>()
  for (const r of rows) {
    if (!isCategory(r.category)) continue
    totals.set(r.descriptionKey, (totals.get(r.descriptionKey) ?? 0) + r.count)
    const b = best.get(r.descriptionKey)
    if (!b || r.count > b.count)
      best.set(r.descriptionKey, { category: r.category, count: r.count })
  }
  const out = new Map<string, HistoryEntry>()
  for (const [k, b] of best) out.set(k, { ...b, total: totals.get(k)! })
  return out
}
