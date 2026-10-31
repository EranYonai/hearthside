import {
  CATEGORIES,
  categorySet,
  type CategorySet,
  type CategorySlug,
  type CustomCategory,
} from '../categories'
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
  category: string | null
  via: CategoryVia | null
  /** 0..1. Rules are 1. */
  confidence: number
  /** The model's runner-up options, best first, when the model was asked. */
  alternatives?: readonly { category: string; confidence: number }[]
  /** Short, human-readable reason, e.g. the keyword that matched. */
  reason?: string
  /** The model was needed but unavailable: try this entry again later. */
  retry?: true
}

/** One description's past manual choices. */
export interface HistoryEntry {
  category: string
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
  /** The household's own categories; their keywords join the built-in list. */
  custom?: readonly CustomCategory[]
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
  groceries: 'supermarket, food',
  'eating-out': 'restaurants, cafes, delivery',
  home: 'furniture, repairs',
  bills: 'utilities, phone, insurance',
  car: 'fuel, parking',
  transport: 'buses, trains, taxis',
  kids: 'childcare, school, toys',
  health: 'pharmacy, doctors',
  shopping: 'clothes, online stores',
  subscriptions: 'streaming, apps',
  travel: 'flights, hotels',
  income: 'salary, refunds',
  savings: 'to savings',
  transfer: 'between accounts, to people',
  pension: 'pension funds',
  other: 'anything else',
}

const MONEY_IN_BUILTIN = new Set<string>(['income', 'transfer', 'savings', 'other'])

/** Rough token count; the model fits all of a question's options in 192 tokens. */
const OPTION_BUDGET_CHARS = 480

/**
 * The model sees category names, not slugs, plus short descriptions when they fit.
 * Returns the question and a map from the names it may answer back to slugs.
 */
export function categoryQuestion(
  direction: 'in' | 'out',
  set: CategorySet = categorySet(),
): { question: ChoiceQuestion; slugOf: Map<string, string> } {
  const builtIn = CATEGORIES.filter((c) =>
    direction === 'in' ? MONEY_IN_BUILTIN.has(c.slug) : c.slug !== 'income',
  ).map((c) => ({
    slug: c.slug as string,
    label: c.label as string,
    hint: DESCRIPTIONS[c.slug] as string | null,
  }))
  const custom = set.custom
    .filter((c) => c.direction === direction)
    .map((c) => ({ slug: c.slug, label: c.label, hint: c.keywords.slice(0, 4).join(', ') || null }))
  const all = [...builtIn, ...custom]
  const size = all.reduce((n, o) => n + o.label.length + (o.hint?.length ?? 0) + 4, 0)
  const withHints = size <= OPTION_BUDGET_CHARS
  return {
    question: {
      type: 'choice',
      instructions:
        direction === 'out'
          ? 'Which household budget category does this payment belong to?'
          : 'What kind of money coming in is this?',
      options: Object.fromEntries(all.map((o) => [o.label, withHints ? o.hint : null])),
    },
    slugOf: new Map(all.map((o) => [o.label, o.slug])),
  }
}

/** The question the model is asked about one entry, exported so other features can reuse it. */
export function categoryRequest(
  input: CategorizeInput,
  set: CategorySet = categorySet(),
): DecisionRequest<{ category: ChoiceQuestion }> {
  const money = (Math.abs(input.amountMinor) / 100).toFixed(2)
  return {
    state: {
      description: input.description.slice(0, 300),
      amount: `${money} ${input.currency ?? 'ILS'}`,
      direction: input.amountMinor < 0 ? 'money out' : 'money in',
      ...(input.accountKind ? { account: input.accountKind } : {}),
    },
    questions: { category: categoryQuestion(input.amountMinor < 0 ? 'out' : 'in', set).question },
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
  const set = categorySet(ctx.custom)
  const rule = !skip.has('rule') ? ctx.rules?.get(key) : undefined
  if (rule && set.has(rule)) return { category: rule, via: 'rule', confidence: 1 }
  const past = !skip.has('history') ? ctx.history?.get(key) : undefined
  if (past && set.has(past.category) && past.total > 0 && past.count / past.total >= 0.6)
    return {
      category: past.category,
      via: 'history',
      // Never as sure as a rule, and more sure the more often it was picked.
      confidence: Math.min(0.95, 0.7 + 0.05 * past.count) * (past.count / past.total),
      reason: `picked ${past.count} of ${past.total} times before`,
    }
  if (!skip.has('keyword')) {
    // The key may be an opaque index, so keywords always read the description itself.
    const hit = matchKeyword(normalizeDescription(input.description), input.amountMinor, ctx.custom)
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

  const set = categorySet(ctx.custom)
  const slugs = {
    in: categoryQuestion('in', set).slugOf,
    out: categoryQuestion('out', set).slugOf,
  }
  const firsts = [...groups.values()].map((idx) => idx[0]!)
  let answers
  try {
    answers = await engine.decide(firsts.map((i) => categoryRequest(inputs[i]!, set)))
  } catch (e) {
    if (!(e instanceof DecisionUnavailable)) throw e
    for (const idx of groups.values()) for (const i of idx) out[i] = { ...NONE, retry: true }
    return out
  }
  const min = ctx.minConfidence ?? DEFAULT_MIN_CONFIDENCE
  ;[...groups.values()].forEach((idx, g) => {
    const a = answers[g]?.category
    const slugOf = inputs[idx[0]!]!.amountMinor < 0 ? slugs.out : slugs.in
    const choice = a && slugOf.get(a.choice)
    if (!a || !choice) return
    const ranked = Object.entries(a.probabilities)
      .flatMap(([name, p]) => {
        const slug = slugOf.get(name)
        return slug ? [[slug, p] as const] : []
      })
      .sort((x, y) => y[1] - x[1])
    const suggestion: CategorySuggestion =
      a.confidence >= min
        ? {
            category: choice,
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
  set: CategorySet = categorySet(),
): Map<string, HistoryEntry> {
  const totals = new Map<string, number>()
  const best = new Map<string, { category: string; count: number }>()
  for (const r of rows) {
    if (!set.has(r.category)) continue
    totals.set(r.descriptionKey, (totals.get(r.descriptionKey) ?? 0) + r.count)
    const b = best.get(r.descriptionKey)
    if (!b || r.count > b.count)
      best.set(r.descriptionKey, { category: r.category, count: r.count })
  }
  const out = new Map<string, HistoryEntry>()
  for (const [k, b] of best) out.set(k, { ...b, total: totals.get(k)! })
  return out
}
