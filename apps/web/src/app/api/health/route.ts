import { dbPinger } from '@/lib/db'
import { checkHealth } from '@/lib/health'
import { appVersion } from '@/lib/version'

export const dynamic = 'force-dynamic'

export async function GET() {
  const health = await checkHealth(dbPinger(), appVersion())
  return Response.json(health, {
    status: health.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
