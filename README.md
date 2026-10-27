# Coaching Centre Fee App

Fee management for coaching centres: enrol students, bill fees, send automatic WhatsApp reminders with UPI payment links, and mark payments paid by gateway webhook.

Design: [Technical Design Specification](https://claude.ai/artifact/JVdM6Ebn8UtWd3PZbN92Cr)

## Layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js frontend for centre owners: landing page, `/login`, `/dashboard` |
| `apps/api` | JSON REST API under `/api/v1` (Hono), one folder per module in `src/modules` |
| `apps/worker` | BullMQ worker; one file per scheduled or queued job in `src/jobs` |
| `packages/db` | PostgreSQL schema (Drizzle), SQL migrations, test database helper |
| `packages/integrations` | Adapters: `PaymentGateway` (Razorpay), `MessagingProvider` (WhatsApp), `SmsProvider`, file storage |
| `packages/shared` | Code shared by web, api and worker (phone number rules, …) |
| `docs` | Design notes and decisions |
| `.github/workflows` | CI, promotion guard and deploy pipelines |
| `scripts` | One-off repo and tooling scripts |

## Branches and environments

| Env | Branch | Gets code by |
| --- | --- | --- |
| dev | `develop` | PR from a work branch + pipeline |
| sit | `sit` | PR from `develop` + pipeline |
| uat | `uat` | PR from `sit` + pipeline |
| prod | `main` | PR from `uat` + pipeline + approval |

Details, hotfixes and setup: [docs/branching-and-environments.md](docs/branching-and-environments.md). Hosting (Cloudflare Workers, one per env): [docs/deployment.md](docs/deployment.md). PR checks, the 80% coverage minimum and the deploy pipeline: [docs/ci-cd.md](docs/ci-cd.md). App text, edited in Sanity: [docs/content.md](docs/content.md).

## Local development

Needs Node 22.13+. No Docker or Postgres install: the API uses an embedded Postgres saved in `.data/`.

```sh
npm install                       # once, from the repo root (npm workspaces)
cp .env.example .env              # then set JWT_SECRET: openssl rand -base64 48
npm run dev -w apps/api           # API on http://localhost:8787/api/v1
npm run dev -w apps/web           # web on http://localhost:3000 (second terminal)
```

Open http://localhost:3000/login, enter any Indian mobile number, and copy the 6-digit code from the **API terminal** (`[sms:console] Chukta login code …`). Codes are printed only in development; production refuses to start with the console SMS provider.

Browse the database: stop the API (only one process can open the embedded database), then run `npm run db:studio -w packages/db` and open https://local.drizzle.studio. Set `DATABASE_URL` to a `postgres://` URL to browse a real server instead.

Checks (same as CI): `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`.
