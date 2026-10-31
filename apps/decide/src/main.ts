import { loadLaya } from './laya.ts'
import { decideServer } from './server.ts'

const log = (level: string, msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ level, name: 'decide', msg, ...extra }))

const modelDir = process.env.MODEL_DIR ?? '/models/laya'
const threads = Number(process.env.MODEL_THREADS) || undefined
const port = Number(process.env.PORT ?? 8080)

const server = decideServer({ engine: loadLaya(modelDir, threads), log })
server.listen(port, () => log('info', 'listening', { port }))

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    log('info', 'shutting down', { signal })
    server.close(() => process.exit(0))
  })
