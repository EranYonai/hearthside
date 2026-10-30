# Architecture

Hearthside is a TypeScript monorepo managed with pnpm.

| Path            | Role                                                            |
| --------------- | --------------------------------------------------------------- |
| `apps/web`      | Next.js app (UI, API routes, sign-in). Installable as a PWA.    |
| `apps/worker`   | Background jobs that run outside requests.                      |
| `packages/core` | Domain logic with no framework ties, such as parsing and rules. |
| `packages/db`   | Postgres schema and queries.                                    |
| `packages/ui`   | Shared components and design tokens.                            |

## Runtime

Docker Compose runs three services: `web`, `worker` and Postgres. The web app is the only
service exposed, and it binds to loopback unless configured otherwise.

## Sign-in and households

Users sign in with passkeys. Each household has members with a role (owner, adult or viewer)
that decides what they can see and change.

## Observability

The app writes structured JSON logs. Owners see health details on a System page; there are no
push alerts.
