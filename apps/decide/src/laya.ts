import type { Answer, DecisionRequest, Engine, Question } from './types.ts'

/** Files the bundle needs; the same list as @receptron/laya's BUNDLE_FILES. */
export const BUNDLE_FILES = [
  'laya.onnx',
  'laya.onnx.data',
  'laya_config.json',
  'tokenizer/tokenizer.json',
  'tokenizer/tokenizer_config.json',
] as const

type LayaQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> | string[] }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'noul'; instructions: string }

type LayaAnswer =
  | {
      type: 'choice'
      choice: string
      probabilities: Record<string, number>
      answer_confidence: number
    }
  | {
      type: 'score'
      score: number
      probabilities: Record<string, number>
      answer_confidence: number
    }
  | { type: 'noul'; noul: number; answer_confidence: number }

/** The part of the Laya class this service uses. */
export interface LayaModel {
  systemOne(
    state: unknown,
    questions: Record<string, LayaQuestion>,
  ): Promise<{ answers: Record<string, LayaAnswer> }>
  close(): Promise<void>
}

export function toLaya(q: Question): LayaQuestion {
  switch (q.type) {
    case 'choice':
      return { type: 'choice', instructions: q.instructions, criteria: q.options }
    case 'scale':
      return { type: 'score', instructions: q.instructions, criteria: q.levels }
    case 'yesno':
      return { type: 'noul', instructions: q.instructions }
  }
}

export function fromLaya(q: Question, a: LayaAnswer): Answer {
  if (q.type === 'choice' && a.type === 'choice')
    return {
      type: 'choice',
      choice: a.choice,
      probabilities: a.probabilities,
      confidence: a.answer_confidence,
    }
  if (q.type === 'scale' && a.type === 'score') {
    const best = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1])[0]
    return {
      type: 'scale',
      score: a.score,
      level: best?.[0] ?? q.levels[Math.round(a.score)]!,
      probabilities: a.probabilities,
      confidence: a.answer_confidence,
    }
  }
  if (q.type === 'yesno' && a.type === 'noul')
    return { type: 'yesno', yes: a.noul, confidence: a.answer_confidence }
  throw new Error(`model answered ${a.type} to a ${q.type} question`)
}

export function layaEngine(model: LayaModel): Engine {
  return {
    name: 'laya',
    async decide(req: DecisionRequest) {
      const questions = Object.fromEntries(
        Object.entries(req.questions).map(([id, q]) => [id, toLaya(q)]),
      )
      const { answers } = await model.systemOne(req.state, questions)
      return Object.fromEntries(
        Object.entries(req.questions).map(([id, q]) => [id, fromLaya(q, answers[id]!)]),
      )
    },
    close: () => model.close(),
  }
}

/**
 * Load the model from a local folder only. Nothing is downloaded here: the service runs on a
 * network with no way out, and the folder is filled once by fetch-model.ts.
 */
export async function loadLaya(modelDir: string, threads?: number): Promise<Engine> {
  const { Laya } = await import('@receptron/laya')
  const model = await Laya.load({
    modelDir,
    ...(threads ? { sessionOptions: { intraOpNumThreads: threads } } : {}),
  })
  return layaEngine(model as unknown as LayaModel)
}
