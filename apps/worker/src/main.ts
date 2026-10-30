import { pino } from 'pino'
import { startHeartbeat } from './heartbeat.ts'

const logger = pino({ name: 'worker', level: process.env.LOG_LEVEL ?? 'info' })

const stop = startHeartbeat({
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
  intervalMs: Number(process.env.HEARTBEAT_MS ?? 60_000),
  logger,
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down')
    stop()
    process.exit(0)
  })
}

logger.info('worker started')
