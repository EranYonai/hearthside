import { DECIDE_LIMITS as CORE_LIMITS } from '@hearthside/core'
import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BUNDLE_FILES, fromLaya, layaEngine, loadLaya, toLaya, type LayaModel } from './laya.ts'
import { hasBundle } from './fetch-model.ts'
import { decideServer } from './server.ts'
import { DECIDE_LIMITS, type Engine } from './types.ts'
import { parseRequests } from './validate.ts'

const choice = { type: 'choice', instructions: 'Which?', options: { a: 'first', b: null } } as const
const one = { requests: [{ state: 'synthetic', questions: { pick: choice } }] }

describe('limits', () => {
  it('match the client in @hearthside/core', () => {
    expect(DECIDE_LIMITS).toEqual(CORE_LIMITS)
  })
})

describe('parseRequests', () => {
  it('accepts every question type', () => {
    const parsed = parseRequests({
      requests: [
        {
          state: { description: 'x' },
          questions: {
            pick: { type: 'choice', instructions: 'Which?', options: ['a', 'b'] },
            level: { type: 'scale', instructions: 'How much?', levels: ['low', 'high'] },
            yes: { type: 'yesno', instructions: 'Is it?' },
          },
        },
      ],
    })
    expect(Object.keys(parsed[0]!.questions)).toEqual(['pick', 'level', 'yes'])
  })

  const q = (questions: unknown, state: unknown = 's') => ({ requests: [{ state, questions }] })
  it.each([
    ['no body', null],
    ['no requests', { requests: [] }],
    [
      'too many requests',
      { requests: Array(DECIDE_LIMITS.requestsPerCall + 1).fill(one.requests[0]) },
    ],
    ['a non-object request', { requests: [1] }],
    ['no state', q({ pick: choice }, null)],
    ['a long state', q({ pick: choice }, 'x'.repeat(DECIDE_LIMITS.stateChars + 1))],
    ['no questions', q(undefined)],
    ['zero questions', q({})],
    ['a bad question', q({ pick: 1 })],
    ['an unknown type', q({ pick: { type: 'essay', instructions: 'Write' } })],
    ['empty instructions', q({ pick: { type: 'yesno', instructions: ' ' } })],
    ['long instructions', q({ pick: { type: 'yesno', instructions: 'x'.repeat(401) } })],
    ['one option', q({ pick: { type: 'choice', instructions: 'Which?', options: ['a'] } })],
    [
      'repeated options',
      q({ pick: { type: 'choice', instructions: 'Which?', options: ['a', 'a'] } }),
    ],
    ['bad options', q({ pick: { type: 'choice', instructions: 'Which?', options: 'a,b' } })],
    [
      'a bad description',
      q({ pick: { type: 'choice', instructions: 'W', options: { a: 1, b: null } } }),
    ],
    ['bad levels', q({ pick: { type: 'scale', instructions: 'How?', levels: 'low' } })],
    ['one level', q({ pick: { type: 'scale', instructions: 'How?', levels: ['low'] } })],
  ])('rejects %s', (_, body) => {
    expect(() => parseRequests(body)).toThrow(TypeError)
  })
})

describe('Laya mapping', () => {
  it('maps questions to Laya’s shapes and answers back', () => {
    expect(toLaya({ type: 'scale', instructions: 'i', levels: ['l', 'h'] })).toEqual({
      type: 'score',
      instructions: 'i',
      criteria: ['l', 'h'],
    })
    expect(toLaya({ type: 'yesno', instructions: 'i' })).toEqual({
      type: 'noul',
      instructions: 'i',
    })
    expect(
      fromLaya(
        { type: 'scale', instructions: 'i', levels: ['l', 'h'] },
        { type: 'score', score: 0.8, probabilities: { l: 0.2, h: 0.8 }, answer_confidence: 0.8 },
      ),
    ).toEqual({
      type: 'scale',
      score: 0.8,
      level: 'h',
      probabilities: { l: 0.2, h: 0.8 },
      confidence: 0.8,
    })
    expect(
      fromLaya(
        { type: 'yesno', instructions: 'i' },
        { type: 'noul', noul: 0.1, answer_confidence: 0.9 },
      ),
    ).toEqual({ type: 'yesno', yes: 0.1, confidence: 0.9 })
    expect(() =>
      fromLaya(
        { type: 'yesno', instructions: 'i' },
        { type: 'score', score: 1, probabilities: {}, answer_confidence: 1 },
      ),
    ).toThrow(/score to a yesno/)
  })

  it('wraps a model as an engine', async () => {
    const seen: unknown[] = []
    const model: LayaModel = {
      async systemOne(state, questions) {
        seen.push(state, questions)
        return {
          answers: {
            pick: {
              type: 'choice',
              choice: 'a',
              probabilities: { a: 0.7, b: 0.3 },
              answer_confidence: 0.7,
            },
          },
        }
      },
      close: async () => {},
    }
    const engine = layaEngine(model)
    expect(await engine.decide({ state: 's', questions: { pick: choice } })).toEqual({
      pick: { type: 'choice', choice: 'a', probabilities: { a: 0.7, b: 0.3 }, confidence: 0.7 },
    })
    expect(seen[1]).toEqual({
      pick: { type: 'choice', instructions: 'Which?', criteria: choice.options },
    })
  })
})

describe('hasBundle', () => {
  it('needs every bundle file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bundle-'))
    expect(await hasBundle(dir)).toBe(false)
    for (const f of BUNDLE_FILES) {
      await mkdir(path.dirname(path.join(dir, f)), { recursive: true })
      await writeFile(path.join(dir, f), '')
    }
    expect(await hasBundle(dir)).toBe(true)
  })
})

describe('decideServer', () => {
  let close: (() => void) | undefined
  afterEach(() => close?.())

  async function start(engine: Promise<Engine>) {
    const server = decideServer({ engine, maxBodyBytes: 4096 })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    close = () => server.close()
    const { port } = server.address() as AddressInfo
    return `http://127.0.0.1:${port}`
  }
  const post = (url: string, body: unknown) =>
    fetch(`${url}/v1/decide`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })

  const echo: Engine = {
    name: 'echo',
    decide: async (r) => ({
      pick: { type: 'choice', choice: String(r.state), probabilities: {}, confidence: 1 },
    }),
  }

  it('answers requests in order once loaded', async () => {
    const url = await start(Promise.resolve(echo))
    await new Promise((r) => setTimeout(r, 0))
    expect(await (await fetch(`${url}/health`)).json()).toEqual({ status: 'ok' })
    const res = await post(url, {
      requests: [
        { state: 'one', questions: { pick: choice } },
        { state: 'two', questions: { pick: choice } },
      ],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { results: { pick: { choice: string } }[] }
    expect(body.results.map((r) => r.pick.choice)).toEqual(['one', 'two'])
  })

  it('answers 503 while loading and after a failed load', async () => {
    const url = await start(new Promise(() => {}))
    expect((await post(url, one)).status).toBe(503)
    expect(await (await fetch(`${url}/health`)).json()).toEqual({ status: 'loading' })
    close!()
    const failed = await start(Promise.reject(new Error('no files')))
    await new Promise((r) => setTimeout(r, 0))
    expect(await (await fetch(`${failed}/health`)).json()).toEqual({ status: 'failed' })
    expect((await post(failed, one)).status).toBe(503)
  })

  it('rejects bad input, big bodies, other routes and methods', async () => {
    const url = await start(Promise.resolve(echo))
    await new Promise((r) => setTimeout(r, 0))
    expect((await post(url, 'not json')).status).toBe(400)
    expect((await post(url, { requests: [] })).status).toBe(400)
    expect((await post(url, 'x'.repeat(5000))).status).toBe(413)
    expect((await fetch(`${url}/v1/decide`)).status).toBe(405)
    expect((await fetch(`${url}/nope`)).status).toBe(404)
  })

  it('answers 500 when the model throws, and keeps serving', async () => {
    let fail = true
    const flaky: Engine = {
      name: 'flaky',
      decide: async (r) => {
        if (fail) throw new Error('boom')
        return echo.decide(r)
      },
    }
    const url = await start(Promise.resolve(flaky))
    await new Promise((r) => setTimeout(r, 0))
    expect((await post(url, one)).status).toBe(500)
    fail = false
    expect((await post(url, one)).status).toBe(200)
  })
})

// The real model is 1.7 GB, so this runs only where a bundle is present.
describe.skipIf(!process.env.LAYA_MODEL_DIR)('Laya model', () => {
  it('picks a sensible category for a synthetic entry', async () => {
    const { categoryRequest } = await import('@hearthside/core')
    const engine = await loadLaya(process.env.LAYA_MODEL_DIR!)
    const req = categoryRequest({ description: 'Green Leaf Pizza Delivery', amountMinor: -6200 })
    const answers = await engine.decide(req as never)
    expect((answers.category as { choice: string }).choice).toBe('eating-out')
    await engine.close?.()
  }, 120_000)
})
