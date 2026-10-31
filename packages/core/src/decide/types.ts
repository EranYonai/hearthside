/**
 * A small, engine-neutral way to ask a model typed questions about a piece of state.
 *
 * Categorization is the first user. Hints and insights ask their own questions through the same
 * shape, so the engine behind it (a local model today) can change without touching callers.
 */

/** Pick one option. `options` maps each option to a short description, or lists bare names. */
export interface ChoiceQuestion {
  type: 'choice'
  instructions: string
  options: Readonly<Record<string, string | null>> | readonly string[]
}

/** Place the state on an ordered scale. `levels[0]` is the lowest. */
export interface ScaleQuestion {
  type: 'scale'
  instructions: string
  levels: readonly string[]
}

/** A yes/no statement about the state. */
export interface YesNoQuestion {
  type: 'yesno'
  instructions: string
}

export type Question = ChoiceQuestion | ScaleQuestion | YesNoQuestion
export type Questions = Readonly<Record<string, Question>>

export interface ChoiceAnswer {
  type: 'choice'
  choice: string
  /** Every option's probability; they sum to about 1. */
  probabilities: Readonly<Record<string, number>>
  /** Probability of `choice`. */
  confidence: number
}

export interface ScaleAnswer {
  type: 'scale'
  /** Expected level, from 0 to levels.length - 1. */
  score: number
  /** The most likely level. */
  level: string
  probabilities: Readonly<Record<string, number>>
  /** Probability of `level`. */
  confidence: number
}

export interface YesNoAnswer {
  type: 'yesno'
  /** P(yes). */
  yes: number
  /** max(yes, 1 - yes). */
  confidence: number
}

export type Answer = ChoiceAnswer | ScaleAnswer | YesNoAnswer

export type AnswerFor<Q extends Question> = Q extends ChoiceQuestion
  ? ChoiceAnswer
  : Q extends ScaleQuestion
    ? ScaleAnswer
    : YesNoAnswer

export type Answers<Q extends Questions> = { [K in keyof Q]: AnswerFor<Q[K]> }

/** One piece of state with the questions to ask about it. */
export interface DecisionRequest<Q extends Questions = Questions> {
  /** A string or a JSON-serializable object. Keep it short: engines truncate long state. */
  state: unknown
  questions: Q
}

/**
 * Something that answers questions. Implementations must keep data on this server: the only
 * engine today talks to the local model container.
 */
export interface DecisionEngine {
  readonly name: string
  /** Answer each request; results line up with `requests`. */
  decide<Q extends Questions>(requests: readonly DecisionRequest<Q>[]): Promise<Answers<Q>[]>
}

/** The engine is missing, still loading or failed. Callers fall back to rules. */
export class DecisionUnavailable extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DecisionUnavailable'
  }
}

/** Limits shared by the client and the model service. */
export const DECIDE_LIMITS = {
  requestsPerCall: 64,
  questionsPerRequest: 8,
  optionsPerQuestion: 24,
  stateChars: 2000,
  textChars: 400,
} as const
