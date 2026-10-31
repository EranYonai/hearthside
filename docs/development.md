# Development

## Requirements

- Node.js 26 (see `.node-version`) and pnpm 12 (`npm i -g pnpm@12`)
- Docker with Compose

## Layout

| Path            | What                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| `apps/web`      | Next.js app: UI and API                                                |
| `apps/worker`   | Background worker. Talks to the web API only, never to the database    |
| `apps/decide`   | Local model service. Answers typed questions; no database, no internet |
| `packages/core` | Domain logic: money, roles, import, categorizing, the `decide` client  |
| `packages/db`   | Database client                                                        |
| `packages/ui`   | Design tokens and React components                                     |

## Everyday commands

```sh
pnpm install
docker compose -f compose.test.yml up -d db     # Postgres on 127.0.0.1:5433
DATABASE_URL=postgres://hearthside:hearthside@localhost:5433/hearthside pnpm dev
```

Migrations run when the app starts. Passkeys need a secure context, which `localhost`
counts as, so sign-in works on `http://localhost:3000` without HTTPS.

The component gallery lives at `/design`.

| Command                     | Does                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm typecheck`            | TypeScript across the workspace                                                             |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                                                           |
| `pnpm test`                 | Unit tests (Vitest)                                                                         |
| `pnpm test:coverage`        | Unit tests with coverage gates (90% on `packages/core`, 75% overall)                        |
| `pnpm test:e2e`             | Playwright. Builds and starts the app itself, or set `E2E_BASE_URL` to test a running stack |
| `pnpm db:generate`          | Write a new SQL migration after changing `packages/db/src/schema.ts`                        |
| `pnpm tokens`               | Regenerate `packages/ui/src/theme.css` from `tokens.json`                                   |

Database tests (`*.int.test.ts`) run against a real Postgres and are skipped unless
`TEST_DATABASE_URL` is set:

```sh
docker compose -f compose.test.yml up -d db --wait
TEST_DATABASE_URL=postgres://hearthside:hearthside@localhost:5433/hearthside pnpm test
```

To run e2e the way CI does (start from a fresh database, since a home can only be set up once):

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

## Versions and releases

The app version is `version` in the root `package.json` (semver). See [Releases](releases.md).

The version and the short commit are baked into the web image at build time. They show at the
bottom of the app and in `/api/health`. `pnpm stack` builds and starts the stack with the current
commit filled in.

## Statement import

`packages/core/src/import` reads uploaded files in memory: `.xlsx` (unzipped and parsed
directly), `.csv` (UTF-8 or Windows Hebrew), HTML tables saved as `.xls`, and text PDFs (words
placed into columns by position, via pdf.js). It finds header rows by their labels, so
preambles, several tables per sheet and totals rows are fine. Duplicates are matched per
account by a hash of date, amount, description and installment (or the reference number when
the file has one). Test fixtures are synthetic; never commit a real export.

## Asking the model

`@hearthside/core` exposes a general decision API, so features beyond categories (hints,
insights) can ask the local model typed questions without knowing which model runs:

```ts
import { httpEngine } from '@hearthside/core'

const engine = httpEngine({ url: process.env.DECIDE_URL! })
const [answers] = await engine.decide([
  {
    state: { description: 'Example entry', amount: '12.00 ILS' },
    questions: {
      kind: { type: 'choice', instructions: 'Which?', options: { a: 'first', b: 'second' } },
      size: { type: 'scale', instructions: 'How big?', levels: ['small', 'medium', 'large'] },
      odd: { type: 'yesno', instructions: 'Is this unusual?' },
    },
  },
])
answers.kind.choice // 'a', with answers.kind.confidence and .probabilities
```

A missing or loading model throws `DecisionUnavailable`; callers should fall back, not fail.
Categorizing is built on this: `categorize(entry, ctx)`, `categorizeMany(entries, ctx)` and
`categorizeFast` (no model) in core, and `categorizePending`, `recategorize` and
`scheduleCategorize` in `apps/web/src/server/categorize.ts`.

Without `DECIDE_URL` (the default in development and CI) the model step is skipped. Tests
use fake engines. To run the real-model test, point `LAYA_MODEL_DIR` at a downloaded bundle:

```sh
MODEL_DIR=./.models/laya node apps/decide/src/fetch-model.ts
LAYA_MODEL_DIR=./.models/laya pnpm vitest run --project decide
```

## QA checklist for a PR

1. `pnpm install`, then `pnpm lint`, `pnpm typecheck` and `pnpm test`.
2. `pnpm test:e2e` for flows that touch the UI.
3. `pnpm stack` and check the change in a browser, on desktop and phone widths.
4. Add a line to `CHANGELOG.md` under Unreleased (see [Releases](releases.md)).
