/**
 * The wire format of /v1/decide. It mirrors @hearthside/core's decide types; this service runs
 * its .ts files directly with Node, so it keeps its own copy instead of importing the package.
 * A test checks the two stay in step.
 */
export interface ChoiceQuestion {
  type: 'choice'
  instructions: string
  options: Record<string, string | null> | string[]
}
export interface ScaleQuestion {
  type: 'scale'
  instructions: string
  levels: string[]
}
export interface YesNoQuestion {
  type: 'yesno'
  instructions: string
}
export type Question = ChoiceQuestion | ScaleQuestion | YesNoQuestion

export interface DecisionRequest {
  state: unknown
  questions: Record<string, Question>
}

export type Answer =
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | {
      type: 'scale'
      score: number
      level: string
      probabilities: Record<string, number>
      confidence: number
    }
  | { type: 'yesno'; yes: number; confidence: number }

export interface Engine {
  readonly name: string
  decide(request: DecisionRequest): Promise<Record<string, Answer>>
  close?(): Promise<void>
}

export const DECIDE_LIMITS = {
  requestsPerCall: 64,
  questionsPerRequest: 8,
  optionsPerQuestion: 24,
  stateChars: 2000,
  textChars: 400,
} as const
