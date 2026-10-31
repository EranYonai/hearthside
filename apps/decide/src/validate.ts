import { DECIDE_LIMITS, type DecisionRequest, type Question } from './types.ts'

function text(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new TypeError(`${what} must be text`)
  if (v.length > DECIDE_LIMITS.textChars) throw new TypeError(`${what} is too long`)
  return v
}

function question(v: unknown, id: string): Question {
  if (!v || typeof v !== 'object') throw new TypeError(`question ${id} must be an object`)
  const q = v as Record<string, unknown>
  const instructions = text(q.instructions, `${id}.instructions`)
  switch (q.type) {
    case 'choice': {
      const raw = q.options
      let options: Record<string, string | null> | string[]
      if (Array.isArray(raw)) {
        options = raw.map((o, i) => text(o, `${id}.options[${i}]`))
        if (new Set(options).size !== options.length)
          throw new TypeError(`${id}.options repeat a name`)
      } else if (raw && typeof raw === 'object') {
        options = {}
        for (const [k, d] of Object.entries(raw)) {
          text(k, `${id} option name`)
          options[k] = d === null ? null : text(d, `${id}.options.${k}`)
        }
      } else throw new TypeError(`${id}.options must be a list or an object`)
      const n = Array.isArray(options) ? options.length : Object.keys(options).length
      if (n < 2 || n > DECIDE_LIMITS.optionsPerQuestion)
        throw new TypeError(`${id} needs 2 to ${DECIDE_LIMITS.optionsPerQuestion} options`)
      return { type: 'choice', instructions, options }
    }
    case 'scale': {
      if (!Array.isArray(q.levels)) throw new TypeError(`${id}.levels must be a list`)
      const levels = q.levels.map((l, i) => text(l, `${id}.levels[${i}]`))
      if (levels.length < 2 || levels.length > DECIDE_LIMITS.optionsPerQuestion)
        throw new TypeError(`${id} needs 2 to ${DECIDE_LIMITS.optionsPerQuestion} levels`)
      return { type: 'scale', instructions, levels }
    }
    case 'yesno':
      return { type: 'yesno', instructions }
    default:
      throw new TypeError(`question ${id} has an unknown type`)
  }
}

/** Check untrusted input against the shape and the limits. Throws TypeError with a reason. */
export function parseRequests(body: unknown): DecisionRequest[] {
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { requests?: unknown }).requests)
  )
    throw new TypeError('body must be { requests: [...] }')
  const list = (body as { requests: unknown[] }).requests
  if (list.length === 0 || list.length > DECIDE_LIMITS.requestsPerCall)
    throw new TypeError(`send 1 to ${DECIDE_LIMITS.requestsPerCall} requests`)
  return list.map((r, i) => {
    if (!r || typeof r !== 'object') throw new TypeError(`requests[${i}] must be an object`)
    const { state, questions } = r as { state?: unknown; questions?: unknown }
    if (state === undefined || state === null)
      throw new TypeError(`requests[${i}].state is missing`)
    const size = typeof state === 'string' ? state.length : JSON.stringify(state).length
    if (size > DECIDE_LIMITS.stateChars) throw new TypeError(`requests[${i}].state is too long`)
    if (!questions || typeof questions !== 'object')
      throw new TypeError(`requests[${i}].questions must be an object`)
    const ids = Object.keys(questions)
    if (ids.length === 0 || ids.length > DECIDE_LIMITS.questionsPerRequest)
      throw new TypeError(
        `requests[${i}] needs 1 to ${DECIDE_LIMITS.questionsPerRequest} questions`,
      )
    const parsed: Record<string, Question> = {}
    for (const id of ids) parsed[id] = question((questions as Record<string, unknown>)[id], id)
    return { state, questions: parsed }
  })
}
