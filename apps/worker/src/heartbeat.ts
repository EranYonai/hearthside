import type { Logger } from 'pino'

export interface HeartbeatOptions {
  webUrl: string
  intervalMs: number
  logger: Pick<Logger, 'info' | 'warn'>
  fetch?: typeof globalThis.fetch
}

/**
 * The worker never talks to the database. For now it only checks that it can reach
 * the web app's API, which is the channel later jobs will use.
 */
export async function beat({
  webUrl,
  logger,
  fetch = globalThis.fetch,
}: HeartbeatOptions): Promise<boolean> {
  try {
    const res = await fetch(new URL('/api/health', webUrl), { signal: AbortSignal.timeout(5000) })
    const body = (await res.json()) as { status?: string }
    if (res.ok && body.status === 'ok') {
      logger.info({ web: 'ok' }, 'heartbeat')
      return true
    }
    logger.warn({ web: body.status ?? res.status }, 'web app unhealthy')
    return false
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'web app unreachable')
    return false
  }
}

export function startHeartbeat(options: HeartbeatOptions): () => void {
  void beat(options)
  const timer = setInterval(() => void beat(options), options.intervalMs)
  return () => clearInterval(timer)
}
