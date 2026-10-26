# Coaching Centre Fee App

Fee management for coaching centres: enrol students, bill fees, send automatic WhatsApp reminders with UPI payment links, and mark payments paid by gateway webhook.

Design: [Technical Design Specification](https://claude.ai/artifact/JVdM6Ebn8UtWd3PZbN92Cr)

## Layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js frontend for centre owners |
| `apps/api` | JSON REST API under `/api/v1`, one folder per module in `src/modules` |
| `apps/worker` | BullMQ worker; one file per scheduled or queued job in `src/jobs` |
| `packages/db` | PostgreSQL migrations and seed data |
| `packages/integrations` | Adapters: `PaymentGateway` (Razorpay), `MessagingProvider` (WhatsApp), `SmsProvider`, file storage |
| `packages/shared` | Types and validation shared by web, api and worker |
| `docs` | Design notes and decisions |

## Local development

```sh
cp .env.example .env
docker compose up -d   # Postgres and Redis
```
