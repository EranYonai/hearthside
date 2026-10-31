import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { Engine } from './types.ts'
import { parseRequests } from './validate.ts'

export interface ServerOptions {
  /** Resolves when the model is loaded. Until then /v1/decide answers 503. */
  engine: Promise<Engine>
  log?: (level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>) => void
  maxBodyBytes?: number
}

class TooLarge extends Error {}

async function readBody(req: IncomingMessage, max: number): Promise<string> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > max) throw new TooLarge()
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * POST /v1/decide { requests: [{ state, questions }] } -> { results: [answers] }
 * GET /health -> { status: 'ok' | 'loading' | 'failed' }
 *
 * One model, one request at a time: calls queue so a big batch can't starve memory.
 * Request bodies are never logged.
 */
export function decideServer({
  engine,
  log = () => {},
  maxBodyBytes = 512 * 1024,
}: ServerOptions): Server {
  let ready: Engine | undefined
  let failed = false
  engine.then(
    (e) => {
      ready = e
      log('info', 'model loaded', { engine: e.name })
    },
    (err: unknown) => {
      failed = true
      log('error', 'model failed to load', {
        err: err instanceof Error ? err.message : String(err),
      })
    },
  )
  let queue: Promise<unknown> = Promise.resolve()

  return createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'GET' && req.url === '/health')
      return send(200, { status: ready ? 'ok' : failed ? 'failed' : 'loading' })
    if (req.url !== '/v1/decide') return send(404, { error: 'not found' })
    if (req.method !== 'POST') return send(405, { error: 'use POST' })
    if (!ready) return send(503, { error: failed ? 'model failed to load' : 'model is loading' })

    let requests
    try {
      requests = parseRequests(JSON.parse(await readBody(req, maxBodyBytes)))
    } catch (e) {
      if (e instanceof TooLarge) return send(413, { error: 'body too large' })
      return send(400, { error: e instanceof Error ? e.message : 'bad request' })
    }
    const model = ready
    const started = Date.now()
    const job = queue.then(async () => {
      const results = []
      for (const r of requests) results.push(await model.decide(r))
      return results
    })
    queue = job.catch(() => undefined)
    try {
      const results = await job
      log('info', 'decided', { requests: requests.length, ms: Date.now() - started })
      send(200, { results })
    } catch (err) {
      log('error', 'decide failed', { err: err instanceof Error ? err.message : String(err) })
      send(500, { error: 'model error' })
    }
  })
}
