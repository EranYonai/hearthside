import {
  DecisionUnavailable,
  type DecisionEngine,
  type DecisionRequest,
  type YesNoQuestion,
} from '../decide'
import { normalizeDescription } from '../import/values'

/**
 * Alerts flag entries worth a second look. They sit next to the category: a fee is still
 * filed under Bills, and an odd charge still has a category.
 *
 * - fee: the description names a fee, interest, a fine or a reversal
 * - spike: much bigger than this description usually is
 * - model: the local model thinks it looks unusual
 */
export type AlertReason = 'fee' | 'spike' | 'model'

export interface AlertSignal {
  reason: AlertReason
  /** 0..1 */
  confidence: number
}

export interface AlertInput {
  description: string
  amountMinor: number
  currency?: string
  /** Same key as for categories: normalizeDescription(description) or an index of it. */
  descriptionKey?: string
  accountKind?: string
}

export interface AlertContext {
  /** Past amounts (minor units) per description key, for the spike check. */
  amounts?: ReadonlyMap<string, readonly number[]>
  engine?: DecisionEngine | null
  /** Keep model alerts at or above this. Default 0.75. */
  minConfidence?: number
}

export interface AlertResult {
  alert: AlertSignal | null
  /** The model was needed but unavailable: try again later. */
  retry?: true
}

// prettier-ignore
const FEE_WORDS = [
  'fee', 'fees', 'commission', 'interest', 'penalty', 'fine', 'late charge', 'overdraft',
  'chargeback', 'reversal', 'returned', 'bounced',
  'עמלה', 'עמלת', 'ריבית', 'קנס', 'דמי ניהול', 'דמי כרטיס', 'החזרה', 'ביטול עסקה', 'חיוב חוזר',
]
const HEBREW = /[֐-׿]/
const FEE_RES = FEE_WORDS.map((w) =>
  HEBREW.test(w)
    ? new RegExp(`(?:^|(?<=[^\\p{L}]))[הובלמשכ]?${w}`, 'u')
    : new RegExp(`(?:^|(?<=[^\\p{L}\\p{N}]))${w}(?=$|[^\\p{L}\\p{N}])`, 'u'),
)

export function feeAlert(description: string): AlertSignal | undefined {
  const text = normalizeDescription(description)
  return FEE_RES.some((re) => re.test(text)) ? { reason: 'fee', confidence: 0.8 } : undefined
}

function median(values: readonly number[]) {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Money out at least 3× the usual for this description, with 3+ past entries to compare. */
export function spikeAlert(
  amountMinor: number,
  past: readonly number[] = [],
): AlertSignal | undefined {
  if (amountMinor >= 0) return undefined
  const out = past.filter((a) => a < 0).map(Math.abs)
  if (out.length < 3) return undefined
  const usual = median(out)
  const now = Math.abs(amountMinor)
  // Ignore small sums: 3× a coffee is still a coffee.
  if (usual <= 0 || now < 5000 || now < usual * 3) return undefined
  return { reason: 'spike', confidence: Math.min(0.95, 0.6 + 0.05 * (now / usual)) }
}

export const ALERT_QUESTION: YesNoQuestion = {
  type: 'yesno',
  instructions:
    'Is this payment unusual or worth double-checking, such as a fee, a fine, a duplicate, an unexpected charge or something that looks like fraud?',
}

export function alertRequest(input: AlertInput): DecisionRequest<{ alert: YesNoQuestion }> {
  return {
    state: {
      description: input.description.slice(0, 300),
      amount: `${(Math.abs(input.amountMinor) / 100).toFixed(2)} ${input.currency ?? 'ILS'}`,
      direction: input.amountMinor < 0 ? 'money out' : 'money in',
      ...(input.accountKind ? { account: input.accountKind } : {}),
    },
    questions: { alert: ALERT_QUESTION },
  }
}

const keyOf = (i: AlertInput) => i.descriptionKey ?? normalizeDescription(i.description)

/** Cheap checks only. */
export function alertFast(input: AlertInput, ctx: AlertContext = {}): AlertSignal | null {
  return (
    feeAlert(input.description) ??
    spikeAlert(input.amountMinor, ctx.amounts?.get(keyOf(input))) ??
    null
  )
}

/**
 * Check entries for alerts: cheap checks first, then the model for the rest of the money out.
 * Entries with the same description share one model question.
 */
export async function checkAlerts(
  inputs: readonly AlertInput[],
  ctx: AlertContext = {},
): Promise<AlertResult[]> {
  const out: AlertResult[] = inputs.map((i) => ({ alert: alertFast(i, ctx) }))
  if (!ctx.engine) return out
  const groups = new Map<string, number[]>()
  inputs.forEach((input, i) => {
    if (out[i]!.alert || input.amountMinor >= 0) return
    const k = keyOf(input)
    const list = groups.get(k)
    if (list) list.push(i)
    else groups.set(k, [i])
  })
  if (groups.size === 0) return out
  const lists = [...groups.values()]
  let answers
  try {
    answers = await ctx.engine.decide(lists.map((idx) => alertRequest(inputs[idx[0]!]!)))
  } catch (e) {
    if (!(e instanceof DecisionUnavailable)) throw e
    for (const idx of lists) for (const i of idx) out[i] = { alert: null, retry: true }
    return out
  }
  const min = ctx.minConfidence ?? 0.75
  lists.forEach((idx, g) => {
    const yes = answers[g]?.alert?.yes ?? 0
    const alert = yes >= min ? { reason: 'model' as const, confidence: yes } : null
    for (const i of idx) out[i] = { alert }
  })
  return out
}

export const ALERT_LABELS: Record<AlertReason, string> = {
  fee: 'Fee or charge',
  spike: 'Bigger than usual',
  model: 'Looks unusual',
}
