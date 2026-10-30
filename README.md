<p align="center">
  <img src="brand/logo.svg" alt="Hearthside logo" width="120" />
</p>

<h1 align="center">Hearthside</h1>

<p align="center">
  A private, self-hosted finance hub for a household of two.<br/>
  One home, one clear picture.
</p>

---

> **Status:** early development. The plan and design system are in place; the app itself is being built. Expect breaking changes.

## What it is

Hearthside brings a couple's bank accounts and credit cards into one place, so you can see spending, income, recurring expenses and overall financial health without juggling bank apps or spreadsheets. It runs on your own hardware, and your data never leaves it.

It is built first for Israeli households: bank and card data comes from [israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers), with Excel/CSV import as a fallback and for backfilling history.

## Features (planned)

- **Unified dashboard** of all household accounts and cards
- **Automatic daily sync** with Israeli banks and card issuers, plus manual Excel/CSV import
- **Categories and recurring expenses** detected across accounts, with card lump debits treated as transfers so nothing is counted twice
- **Monthly and yearly views** with trends over time
- **Budgets and net worth**, including pension clearing-house imports
- **Private flag** for transactions only one partner should see
- **Installable PWA** for iPhone and Android, with light and dark themes and Hebrew/RTL support

## Security model

Financial data is sensitive, so the design is conservative:

- Self-hosted only. No third-party cloud stores your data.
- Exposed through a Cloudflare Tunnel; no open inbound ports.
- Passkey login (WebAuthn) with recovery codes, limited to the household's two users.
- Bank credentials encrypted at rest with libsodium; the master key is a Docker secret.
- A security audit and self-pentest are planned before any wider release.

Found a security issue? Please report it privately rather than opening a public issue.

## Architecture (proposed)

| Part | Tech |
| --- | --- |
| Web app | React + Vite, PWA |
| API | TypeScript (Fastify or Hono) + Drizzle |
| Worker | Bank sync jobs via israeli-bank-scrapers, scheduled with pg-boss |
| Database | PostgreSQL |
| Deployment | Docker Compose behind Cloudflare Tunnel |

The repo will be a pnpm monorepo: `apps/web`, `apps/api`, `apps/worker`, `packages/core`.

## Getting started

Setup instructions will land here once the first runnable version is in. The target is a single `docker compose up` on a home server.

## Project tracking

Features, tickets and tasks are tracked in [GitHub Issues](https://github.com/EranYonai/hearthside/issues).

## License

[Apache 2.0](LICENSE)
