import { describe, expect, it, vi } from 'vitest'
import { httpEngine } from './http'
import { DECIDE_LIMITS, DecisionUnavailable, type DecisionRequest } from './types'

const q = { pick: { type: 'choice', instructions: 'Which?', options: ['a', 'b'] } } as const
const req = (n: number): DecisionRequest<typeof q>[] =>
  Array.from({ length: n }, (_, i) => ({ state: { i }, questions: q }))
const answer = {
  pick: { type: 'choice', choice: 'a', probabilities: { a: 0.9, b: 0.1 }, confidence: 0.9 },
}

function fakeFetch(handler: (body: { requests: unknown[] }) => Response) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
    handler(JSON.parse(String(init?.body))),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('httpEngine', () => {
  it('posts requests and returns answers in order', async () => {
    const f = fakeFetch((b) => Response.json({ results: b.requests.map(() => answer) }))
    const engine = httpEngine({ url: 'http://decide:8080/', fetch: f })
    const out = await engine.decide(req(2))
    expect(out).toHaveLength(2)
    expect(out[0]!.pick.choice).toBe('a')
    expect(f.mock.calls[0]![0]).toBe('http://decide:8080/v1/decide')
  })

  it('splits big batches into calls the service accepts', async () => {
    const f = fakeFetch((b) => Response.json({ results: b.requests.map(() => answer) }))
    const out = await httpEngine({ url: 'http://x', fetch: f }).decide(
      req(DECIDE_LIMITS.requestsPerCall + 1),
    )
    expect(out).toHaveLength(DECIDE_LIMITS.requestsPerCall + 1)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('makes no call for an empty batch', async () => {
    const f = fakeFetch(() => Response.json({ results: [] }))
    expect(await httpEngine({ url: 'http://x', fetch: f }).decide([])).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })

  it.each([
    ['unreachable', () => Promise.reject(new Error('ECONNREFUSED'))],
    ['loading', () => Promise.resolve(new Response('{}', { status: 503 }))],
    ['server error', () => Promise.resolve(new Response('{}', { status: 500 }))],
    ['malformed', () => Promise.resolve(Response.json({ results: [] }))],
  ])('reports %s as unavailable', async (_, handler) => {
    const engine = httpEngine({ url: 'http://x', fetch: handler as unknown as typeof fetch })
    await expect(engine.decide(req(1))).rejects.toBeInstanceOf(DecisionUnavailable)
  })

  it('surfaces a rejected request as a bug, not an outage', async () => {
    const f = fakeFetch(() =>
      Response.json({ error: 'pick needs 2 to 24 options' }, { status: 400 }),
    )
    await expect(httpEngine({ url: 'http://x', fetch: f }).decide(req(1))).rejects.toThrow(
      /2 to 24 options/,
    )
  })
})
