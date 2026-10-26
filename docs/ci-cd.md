# CI/CD

Every change reaches an environment the same way: a pull request runs the full check suite, the merge reruns it, and only then does the deploy start. A smoke test checks the live site after every deploy.

```mermaid
flowchart LR
    PR["Pull request"] --> CI["CI suite<br/>Lint · Typecheck · Unit tests ≥80%<br/>Build · Dependency review · CodeQL"]
    CI -->|all green| Merge["Merge into<br/>develop / sit / uat / main"]
    Merge --> Gate["Deploy workflow:<br/>CI suite again"]
    Gate -->|green| Deploy["wrangler deploy<br/>to the branch's environment"]
    Deploy --> Smoke["Smoke test<br/>live URL"]
```

## Pull request checks

All of these are **required status checks**: GitHub blocks the merge until each one passes, for admins too.

| Check | Workflow | What fails it |
| --- | --- | --- |
| **Lint** | `ci.yml` | Any ESLint error **or warning** (`next/core-web-vitals` + TypeScript rules) |
| **Typecheck** | `ci.yml` | Any TypeScript error (`tsc --noEmit`) |
| **Unit tests** | `ci.yml` | A failing test, or coverage below the minimum (below) |
| **Build web** | `ci.yml` | `next build` fails to produce the static site |
| **Dependency review** | `ci.yml` | The PR adds a dependency with a known **high or critical** vulnerability, or under AGPL-3.0, GPL-3.0 or SSPL-1.0 |
| **CodeQL** | `codeql.yml` | Code scanning (`security-extended` queries) finds a new security issue |
| **Promotion source** | `promotion-guard.yml` | Into `sit`/`uat`/`main` only: the PR doesn't come from the previous environment or a `hotfix/*` branch |

The unit-test job writes a coverage table to the run's summary page and uploads the full HTML report as the `coverage-web` artifact, kept for 14 days.

## Test coverage requirements

| Metric | Minimum |
| --- | --- |
| Lines | 80% |
| Statements | 80% |
| Functions | 80% |
| Branches | 80% |

- **Where it's set:** `thresholds` in `apps/web/vitest.config.mts`. Vitest exits with an error when any metric is below its minimum, so **Unit tests** fails.
- **What counts:** everything under `apps/web/src`, except test files and `src/app/layout.tsx`, which only wires up `next/font` and runs only inside the Next.js compiler.
- **Raising the bar:** raise a threshold once coverage sits comfortably above it. Never lower one to get a PR through. Add tests instead.
- **New code** should come with tests for its behaviour (what the user sees and does), not its markup. See `src/components/landing/SiteHeader.test.tsx` for interaction tests and `src/app/page.test.tsx` for page content.
- **As `apps/api` and `apps/worker` gain code,** give each its own Vitest config with the same 80% thresholds, add a job per app to `ci.yml`, and add the job names to the required checks.

## Run the checks locally

Needs Node 22.13 or newer (`.nvmrc` says 22; `nvm use` or `fnm use` picks it up).

```sh
cd apps/web
npm run lint
npm run typecheck
npm run test:coverage     # or: npm run test:watch while you work
npm run build
```

## Deployment

`deploy.yml` runs on every push to `develop`, `sit`, `uat` and `main`, which in practice means every merged PR:

1. **Checks:** calls `ci.yml` and reruns the whole suite on the merged code.
2. **Deploy:** only if the checks pass. Builds the site, marks non-prod as `noindex`, and runs `wrangler deploy --env <env>`. Prod waits for a reviewer on the `prod` environment.
3. **Smoke test:** the live URL must return 200, serve the landing page, send the security headers, and return 404 for unknown paths. Otherwise the run fails.

Hosting, URLs, secrets and rollback are in [deployment.md](deployment.md).

## Keeping dependencies current

Dependabot (`.github/dependabot.yml`) opens PRs into `develop` every Monday:

- npm packages in `apps/web`, with minor and patch updates grouped into one PR
- GitHub Actions versions

They pass the same checks as any other PR. Major upgrades arrive one per PR, so they can be reviewed on their own.

## Changing the required checks

The list lives in `CHECKS` at the top of `scripts/setup-github-branches.sh`. After renaming or adding a CI job, update that list and rerun the script, or edit **Settings › Branches** for each of the four branches.
