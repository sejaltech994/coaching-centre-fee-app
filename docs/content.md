# App text (CMS)

The words on Chukta's screens are edited in **Sanity**, a hosted CMS, not in code.
Code decides *which* texts exist; editors decide *what they say*.

| Piece | Where |
| --- | --- |
| The list of texts, their editor labels and built-in wording | `packages/content/src/copy.ts` (`CATALOG`) |
| The editor (Sanity Studio) | `apps/studio`, hosted free at `https://chukta.sanity.studio` |
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

## One-time setup

1. Create a free account and project at <https://www.sanity.io/manage>
   (dataset `production`, the default).
2. **Studio:** `cd apps/studio && SANITY_STUDIO_PROJECT_ID=<id> npx sanity login && SANITY_STUDIO_PROJECT_ID=<id> npm run deploy`.
3. **Read token:** in the Sanity project, API › Tokens › add a **Viewer** token.
4. **GitHub:** under Settings › Secrets and variables › Actions, add:
   - the repository **variable** `SANITY_PROJECT_ID`: the project ID;
   - the repository **secret** `SANITY_READ_TOKEN`: the Viewer token.

   dev, sit and uat need the token to read drafts. Without it their build fails
   with a message naming `SANITY_READ_TOKEN`.
5. **CORS:** none needed. Only the build talks to Sanity, never the browser.

To preview CMS text locally:
`SANITY_PROJECT_ID=<id> SANITY_PERSPECTIVE=drafts SANITY_READ_TOKEN=<token> npm run dev -w apps/web`.
