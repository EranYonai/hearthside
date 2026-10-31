import {
  DECIDE_LIMITS,
  DecisionUnavailable,
  type Answers,
  type DecisionEngine,
  type DecisionRequest,
  type Questions,
} from './types'

export interface HttpEngineOptions {
  /** Base URL of the model service on the private network, e.g. http://decide:8080 */
  url: string
  /** Per call. Model calls are slow on CPU; keep the default unless batches are tiny. */
  timeoutMs?: number
  fetch?: typeof fetch
}

/** Talks to the model service (apps/decide). Splits big batches into calls the service accepts. */
export function httpEngine(opts: HttpEngineOptions): DecisionEngine {
  const base = opts.url.replace(/\/+$/, '')
  const doFetch = opts.fetch ?? fetch
  const timeoutMs = opts.timeoutMs ?? 120_000

  async function call(requests: readonly DecisionRequest[]): Promise<unknown[]> {
    let res: Response
    try {
      res = await doFetch(`${base}/v1/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requests }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (cause) {
      throw new DecisionUnavailable('model service is unreachable', { cause })
    }
    if (res.status === 503) throw new DecisionUnavailable('model is still loading')
    // A 400 is our bug, not an outage: surface the service's reason.
    if (res.status === 400) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new TypeError(`model service rejected the request: ${body.error ?? 'bad request'}`)
    }
    if (!res.ok) throw new DecisionUnavailable(`model service answered ${res.status}`)
    const body = (await res.json()) as { results?: unknown }
    if (!Array.isArray(body.results) || body.results.length !== requests.length)
      throw new DecisionUnavailable('model service sent a malformed answer')
    return body.results
  }

  return {
    name: 'http',
    async decide<Q extends Questions>(requests: readonly DecisionRequest<Q>[]) {
      if (requests.length === 0) return []
      const out: unknown[] = []
      for (let i = 0; i < requests.length; i += DECIDE_LIMITS.requestsPerCall) {
        out.push(...(await call(requests.slice(i, i + DECIDE_LIMITS.requestsPerCall))))
      }
      return out as Answers<Q>[]
    },
  }
}
