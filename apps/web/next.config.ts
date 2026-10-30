import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const root = new URL('../../', import.meta.url)
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
  version: string
}

const config: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_GIT_SHA: process.env.GIT_SHA || 'dev',
  },
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(root),
  transpilePackages: ['@hearthside/ui', '@hearthside/core', '@hearthside/db'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default config
