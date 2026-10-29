# App text (CMS)

The words on Chukta's screens are edited in **Sanity**, a hosted CMS, not in code.
Code decides *which* texts exist; editors decide *what they say*.

| Piece | Where |
| --- | --- |
| The list of texts, their editor labels and built-in wording | `packages/content/src/copy.ts` (`CATALOG`) |
| The editor (Sanity Studio) | `apps/studio`, hosted free at <https://chukta.sanity.studio> |
| Reading the text at build time | `packages/content/src/build.ts`, called from `apps/web/next.config.ts` |
| Using it in screens | `copy`, `fill`, `withParts`, `errorMessage` from `apps/web/src/lib/copy.tsx` |

Not here on purpose: **SMS and WhatsApp messages** live in the database, because
they must match the DLT- or Meta-approved wording exactly (see the TSD).

## How a change goes live

1. Edit text in the Studio. Each area (Sign up and login, Profile setup, Error
   messages) is one page of fields, pre-filled with today's wording.
2. **dev, sit and uat** show unpublished drafts, so a change can be reviewed
   there first. **prod** shows only published text.
3. Text is baked into the site when it is built, so a change appears on the
   next deploy of that environment. To publish text without a code change, run
   the **Deploy** workflow (Actions › Deploy › Run workflow) on the branch for
   that environment. prod still needs its reviewer's approval.

## Safety

- Every text has built-in wording. Missing text never breaks a screen.
- Some texts have `{placeholders}` that the app fills in, such as `{tries}` or
  `{phone}`. The Studio won't publish an edit that drops or invents one. If one
  slips through, the build keeps the built-in text and shows a warning.
- If Sanity is configured but can't be read, the **build fails**, so the live
  site keeps its last good text instead of silently reverting to the built-in text.
- Without `SANITY_PROJECT_ID` (local development, pull-request CI) the
  built-in text is used and nothing is fetched.

## Adding a text (developers)

1. Add an entry to the right area in `CATALOG`: `{ label, text }`, plus
   `multiline: true` for paragraphs.
2. Use it: `copy.<area>.<key>`, with `fill()` for placeholders or `withParts()`
   for links inside a sentence.
3. Merge as usual. The Studio picks up the new field once it is redeployed
   (`npm run deploy -w apps/studio`).

Renaming or deleting an entry orphans its text in Sanity. The build lists it as
"not used by the app" and otherwise ignores it.

## Setup

Done on 2026-10-27:

- **Organization** Chukta (`owok9ut92`) and **project** Chukta, ID `hshda1j7`.
  The dataset `production` is **private**: nothing can be read without a token.
- **Studio** deployed to <https://chukta.sanity.studio>. Redeploy after catalog
  changes: `npm run deploy -w apps/studio` (needs `npx sanity login` once).

Still to do, by the project owner:

1. **Read token:** go to <https://www.sanity.io/manage/project/hshda1j7>, then
   API › Tokens › Add API token. Name it `GitHub Actions builds`, with **Viewer** permissions.
2. **GitHub:** under Settings › Secrets and variables › Actions, add:
   - the repository **variable** `SANITY_PROJECT_ID` = `hshda1j7`;
   - the repository **secret** `CMS_SANITY` = the token (the build reads it as `SANITY_READ_TOKEN`).

   Every environment needs the token, because the dataset is private. A build with the
   project ID but no token fails, rather than quietly using the built-in text.
3. **CORS:** none needed. Only the build talks to Sanity, never the browser.

To preview CMS text locally:
`SANITY_PROJECT_ID=hshda1j7 SANITY_READ_TOKEN=<token> SANITY_PERSPECTIVE=drafts npm run dev -w apps/web`.

## Security overrides

`package.json` `overrides` force patched versions of three packages deep inside
the Sanity CLI's tooling: js-yaml 3.15.2 and smol-toml 1.9.1 (under
`@vercel/frameworks`), and undici 7.30.1 (under `@module-federation/dts-plugin`).
They fix high-severity advisories that failed the Dependency review check.
Remove each one once Sanity ships a release that depends on a fixed version
(check with `npm audit`).

