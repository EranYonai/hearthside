import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          include: ['packages/{core,db}/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          include: ['packages/ui/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          include: ['apps/web/src/server/**/*.test.ts'],
          exclude: ['**/*.int.test.ts'],
          environment: 'node',
        },
      },
      {
        // Needs Postgres: TEST_DATABASE_URL (compose.test.yml exposes one on 5433).
        extends: true,
        test: {
          name: 'integration',
          include: ['**/src/**/*.int.test.ts'],
          exclude: ['**/node_modules/**'],
          environment: 'node',
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
          exclude: ['apps/web/src/server/**'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        test: { name: 'worker', include: ['apps/worker/src/**/*.test.ts'], environment: 'node' },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: [
        '**/*.test.*',
        '**/index.ts',
        'apps/worker/src/main.ts',
        // Pages, route handlers and browser glue are covered by the Playwright suite.
        'apps/web/src/app/**',
        'apps/web/src/components/**',
        'apps/web/src/instrumentation.ts',
        'apps/web/src/lib/{auth-client,db}.ts',
        'apps/web/src/server/{session,route,migrate}.ts',
        'packages/db/src/schema.ts',
      ],
      thresholds: {
        lines: 75,
        'packages/core/src/**': { lines: 90, functions: 90, branches: 85 },
      },
    },
  },
})
