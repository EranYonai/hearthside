# Development

## Requirements

- Node.js 26 (see `.node-version`) and pnpm 12 (`npm i -g pnpm@12`)
- Docker with Compose

## Layout

| Path            | What                                                                |
| --------------- | ------------------------------------------------------------------- |
| `apps/web`      | Next.js app: UI and API                                             |
| `apps/worker`   | Background worker. Talks to the web API only, never to the database |
| `packages/core` | Domain logic: money formatting, household roles, sync state         |
| `packages/db`   | Database client                                                     |
| `packages/ui`   | Design tokens and React components                                  |

## Everyday commands

```sh
pnpm install
docker compose -f compose.test.yml up -d db     # Postgres on 127.0.0.1:5433
DATABASE_URL=postgres://hearthside:hearthside@localhost:5433/hearthside pnpm dev
```

The component gallery lives at `/design`.

| Command                     | Does                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm typecheck`            | TypeScript across the workspace                                                             |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                                                           |
| `pnpm test`                 | Unit tests (Vitest)                                                                         |
| `pnpm test:coverage`        | Unit tests with coverage gates (90% on `packages/core`, 75% overall)                        |
| `pnpm test:e2e`             | Playwright. Builds and starts the app itself, or set `E2E_BASE_URL` to test a running stack |
| `pnpm tokens`               | Regenerate `packages/ui/src/theme.css` from `tokens.json`                                   |

To run e2e the way CI does:

```sh
docker compose -f compose.test.yml up -d --build --wait
E2E_BASE_URL=http://localhost:3300 E2E_EXPECT_DB=1 pnpm test:e2e
docker compose -f compose.test.yml down -v
```

## Design tokens

`packages/ui/src/tokens.json` is the design system export. `pnpm tokens` turns it into
CSS variables for both themes plus Tailwind `@theme` entries, so classes like `bg-surface-1`,
`text-ink-muted`, `text-amount-hero` and `rounded-pill` follow the tokens. A unit test fails
if the generated file drifts. The theme follows the system setting, and `data-theme` on
`<html>` overrides it.

## TypeScript 7 and linting

`tsc` and `next build` use TypeScript 7. typescript-eslint still needs the TypeScript 6 API,
so `.pnpmfile.cjs` gives the lint packages their own TypeScript 6 copy.
