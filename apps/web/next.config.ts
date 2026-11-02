import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const dev = process.env.NODE_ENV !== 'production'

// Next inlines its bootstrap scripts and styles, so those need 'unsafe-inline'.
// Everything else loads from this origin only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? ' ws:' : ''}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
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
  // pdf.js loads its worker module at runtime; keep it out of the bundle.
  serverExternalPackages: ['pdfjs-dist'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default config
