# Deployment

The web app is a static Next.js export served by **Cloudflare Workers** (static assets). There is one Worker per environment, and each one is deployed automatically when code lands on its branch.

| Environment | Branch | Worker | URL |
| --- | --- | --- | --- |
| dev | `develop` | `chukta-web-dev` | `https://chukta-web-dev.<subdomain>.workers.dev` |
| sit | `sit` | `chukta-web-sit` | `https://chukta-web-sit.<subdomain>.workers.dev` |
| uat | `uat` | `chukta-web-uat` | `https://chukta-web-uat.<subdomain>.workers.dev` |
| prod | `main` | `chukta-web-prod` | `https://chukta-web-prod.<subdomain>.workers.dev`, later a custom domain |

`<subdomain>` is the account's workers.dev subdomain, chosen once in step 2 below. Each run of the **Deploy** workflow prints its URL, and it also appears on the environment in the repo's **Environments** page.

## Why Cloudflare

- **Free until launch, and free for commercial use.** Requests for static files are free and unlimited, and server code gets 100,000 requests/day. The paid plan starts at $5/month ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)). Vercel's free plan is non-commercial only.
- **Secure by default.** HTTPS, DDoS protection and a global CDN are included. Security headers come from `apps/web/public/_headers`. dev, sit and uat send `X-Robots-Tag: noindex`, so they stay out of search results.
- **Seamless.** No extra service to manage. The existing `Deploy` workflow builds the site and runs `wrangler deploy --env <env>`.

## One-time setup

1. **Create a free Cloudflare account** at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. **Pick the workers.dev subdomain.** Open **Workers & Pages** in the dashboard once and choose a subdomain, for example `chukta`. Deploys from CI fail until this is set.
3. **Copy the Account ID.** It's under **Account home**: open the account's menu (⋯) and choose **Copy account ID**.
4. **Create an API token.** Go to **My Profile › API Tokens › Create Token**, use the **Edit Cloudflare Workers** template, and set **Account Resources** to this account only. Leave the expiry date empty, or set one and calendar a rotation.
5. **Store both as GitHub secrets.** Run this from the repo root. Each command prompts for the value, so it never lands in your shell history:

   ```sh
   gh secret set CLOUDFLARE_API_TOKEN
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```

6. **Deploy dev.** Push to `develop`, or run it by hand:

   ```sh
   gh workflow run deploy.yml --ref develop
   gh run watch
   ```

Until the secrets exist, the Deploy workflow builds the site, skips the upload and shows a warning, so CI does not go red.

## Day to day

Nothing changes. A push to `develop` updates dev. A promotion PR merged into `sit`, `uat` or `main` updates that environment. The `prod` deploy waits for your approval (Settings › Environments › prod).

**Check a production build locally:**

```sh
cd apps/web
npm run preview        # next build + wrangler dev on http://localhost:8787
```

**Roll back:** in the dashboard, open **Workers & Pages › chukta-web-<env> › Deployments** and promote an earlier version. You can also revert the commit on the branch and let the pipeline redeploy.

## Hardening (optional, still free)

- **Lock sit and uat to the team.** Cloudflare Zero Trust is free for up to 50 users. Add an **Access** application for `chukta-web-sit.*` and `chukta-web-uat.*` that allows only your team's emails.
- **Custom domain for prod.** Add the domain to Cloudflare, then set `routes` (or `custom_domain`) under `env.prod` in `apps/web/wrangler.jsonc`.

## Later: API, worker and data

When `apps/api` and `apps/worker` have code, these free tiers fit the same per-environment model:

- **Postgres:** Neon free gives 10 branches per project, one per environment, and pauses when idle ([pricing](https://neon.com/pricing)).
- **Redis:** Upstash free gives 1 database and 500K commands/month ([pricing](https://upstash.com/pricing/redis)). The BullMQ job queue polls Redis constantly, so budget for pay-as-you-go ($0.20 per 100K commands) before prod.

Avoid Render's free Postgres for anything you keep. It is deleted 30 days after creation ([docs](https://render.com/docs/free)).
