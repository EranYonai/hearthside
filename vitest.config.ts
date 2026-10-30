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
          name: 'web',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
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
        'apps/web/src/app/**/page.tsx',
        'apps/web/src/app/**/layout.tsx',
        'apps/worker/src/main.ts',
      ],
      thresholds: {
        lines: 75,
        'packages/core/src/**': { lines: 90, functions: 90, branches: 85 },
      },
    },
  },
})
