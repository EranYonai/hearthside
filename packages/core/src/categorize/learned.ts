import { normalizeDescription } from '../import/values'

/**
 * A small per-household classifier, trained on the household's own manual category picks.
 * Naive Bayes over the words of the description, one model per direction (money in or out).
 * It generalizes past picks to similar descriptions it hasn't seen, e.g. another branch of the
 * same shop. Trained in memory from rows the server already holds; nothing leaves the server.
 */

export interface LearnedExample {
  description: string
  /** Integer minor units; negative is money out. Only the sign is used. */
  amountMinor: number
  category: string
}

export interface LearnedGuess {
  category: string
  /** 0..1, after tempering; never above LEARN_MAX_CONFIDENCE. */
  confidence: number
  /** The known words that pointed at the category, for the UI. */
  words: string[]
}

export interface LearnedModel {
  /** Distinct examples it was trained on. */
  readonly size: number
  /** The best guess for a description, or null when it has nothing to go on. */
  guess(description: string, amountMinor: number): LearnedGuess | null
}

/** Train only once a household has made this many distinct manual picks. */
export const LEARN_MIN_EXAMPLES = 20
/** Keep guesses at or above this. */
export const LEARN_MIN_CONFIDENCE = 0.75
/** A learned guess is never as sure as a past pick of the same description. */
export const LEARN_MAX_CONFIDENCE = 0.9
/** How strongly a category's word rates lean towards the household-wide rate. */
const SMOOTHING = 2

/** The words of a description: letters (any script) and digits, without pure numbers. */
export function descriptionWords(description: string): string[] {
  const words = normalizeDescription(description)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && /\p{L}/u.test(w))
  return [...new Set(words)]
}

interface Side {
  /** Distinct examples per category. */
  docs: Map<string, number>
  /** Per category, how many of its examples contain each word. */
  df: Map<string, Map<string, number>>
  /** How many examples on this side contain each word. */
  all: Map<string, number>
  total: number
}

function emptySide(): Side {
  return { docs: new Map(), df: new Map(), all: new Map(), total: 0 }
}

export function trainLearned(
  examples: readonly LearnedExample[],
  options: { minExamples?: number } = {},
): LearnedModel | null {
  // Each distinct description, direction and category counts once, so a monthly bill picked
  // forty times doesn't drown out everything else.
  const seen = new Set<string>()
  const sides = { in: emptySide(), out: emptySide() }
  for (const e of examples) {
    if (!e.category || e.amountMinor === 0) continue
    const words = descriptionWords(e.description)
    if (words.length === 0) continue
    const dir = e.amountMinor < 0 ? 'out' : 'in'
    const id = `${dir}\u0000${e.category}\u0000${words.join(' ')}`
    if (seen.has(id)) continue
    seen.add(id)
    const side = sides[dir]
    side.total++
    side.docs.set(e.category, (side.docs.get(e.category) ?? 0) + 1)
    let df = side.df.get(e.category)
    if (!df) side.df.set(e.category, (df = new Map()))
    for (const w of words) {
      df.set(w, (df.get(w) ?? 0) + 1)
      side.all.set(w, (side.all.get(w) ?? 0) + 1)
    }
  }
  if (seen.size < (options.minExamples ?? LEARN_MIN_EXAMPLES)) return null

  return {
    size: seen.size,
    guess(description, amountMinor) {
      if (amountMinor === 0) return null
      const side = sides[amountMinor < 0 ? 'out' : 'in']
      // With a single category there is nothing to tell apart.
      if (side.docs.size < 2) return null
      const known = descriptionWords(description).filter((w) => side.all.has(w))
      if (known.length === 0) return null
      const scores: [string, number][] = []
      for (const [category, n] of side.docs) {
        const df = side.df.get(category)!
        let score = Math.log(n / side.total)
        for (const w of known) {
          const rate = side.all.get(w)! / side.total
          score += Math.log(((df.get(w) ?? 0) + SMOOTHING * rate) / (n + SMOOTHING))
        }
        scores.push([category, score])
      }
      // Tempered, so several words that always appear together don't compound into false
      // certainty the way naive Bayes otherwise would.
      const t = Math.sqrt(known.length)
      for (const s of scores) s[1] /= t
      const top = Math.max(...scores.map(([, s]) => s))
      const sum = scores.reduce((t, [, s]) => t + Math.exp(s - top), 0)
      const [category, best] = scores.reduce((a, b) => (b[1] > a[1] ? b : a))
      const df = side.df.get(category)!
      const words = known.filter((w) => df.has(w))
      // Ask for at least two sightings of the category's words before trusting them.
      const support = words.reduce((t, w) => t + df.get(w)!, 0)
      if (support < 2) return null
      const confidence = Math.min(LEARN_MAX_CONFIDENCE, Math.exp(best - top) / sum)
      return { category, confidence, words }
    },
  }
}
