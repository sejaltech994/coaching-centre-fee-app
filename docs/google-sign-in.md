# Google sign-in

Google is the only way to sign up and sign in. There are no passwords and no
codes; the mobile number an owner gives at sign-up is for WhatsApp reminders and
is confirmed later.

## How it works

1. "Continue with Google" opens `GET /api/v1/auth/google/start`. The API
   creates `state`, `nonce` and a PKCE verifier and keeps them in a signed,
   10-minute cookie. It then sends the browser to Google.
2. Google returns to `GET /api/v1/auth/google/callback`. The API checks
   `state`, swaps the code using the PKCE verifier, and verifies the ID token:
   Google's signature, issuer, audience, expiry, `nonce` and `email_verified`.
   It keeps only Google's account ID (`sub`), email, name and photo. Google's
   own tokens are dropped.
3. Then one of three things happens:
   - **The Google account is already connected:** signed in, sent to the dashboard.
   - **A new Google account:** sent to `/signup/`, "Tell us about your centre",
     with the Google name filled in. `POST /auth/register` then creates the
     owner (email from Google, already confirmed), the centre, the consent and
     the Google link together, and signs them in.
   - **The email belongs to an account from before Google sign-in:** sent back
     to sign-in with `google_error=email_in_use`. A matching email alone never
     connects Google to an account.

The pending Google account waits for up to 15 minutes in a signed cookie
(`chukta_google`). Code: `apps/api/src/modules/auth/google.ts` and
`packages/integrations/src/google/google.ts`.

## Fake Google, for development and tests

With `GOOGLE_PROVIDER=fake`, the API serves its own account chooser at
`/api/v1/auth/google/fake`. You type any email and name. CI's E2E job uses it,
and so can local runs:

```sh
GOOGLE_PROVIDER=fake JWT_SECRET=... DATABASE_URL=pglite:../../.data/dev npm run dev -w apps/api
NEXT_PUBLIC_GOOGLE_SIGN_IN=on npm run dev -w apps/web
```

The API refuses to start with `GOOGLE_PROVIDER=fake` in production.

## Setting up real Google (once per environment)

Each environment has its own OAuth client (TSD), so a dev secret can never sign
anyone into prod.

1. In <https://console.cloud.google.com>, create a project named **Chukta**.
2. Go to **Google Auth Platform › Branding** and fill in the app name (Chukta),
   support email, and links to the privacy policy and terms.
   Under **Audience**, choose **External**. While it says *Testing*, only the
   test users you list can sign in. Click **Publish app** before real owners use
   it. The scopes used (`openid email profile`) need no Google review.
3. Go to **Clients › Create client › Web application**, one per environment,
   with this **authorized redirect URI**:

   | Environment | Redirect URI |
   | --- | --- |
   | dev | `https://chukta-web-dev.chukta.workers.dev/api/v1/auth/google/callback` |
   | sit | `https://chukta-web-sit.chukta.workers.dev/api/v1/auth/google/callback` |
   | uat | `https://chukta-web-uat.chukta.workers.dev/api/v1/auth/google/callback` |
   | prod | `https://chukta-web-prod.chukta.workers.dev/api/v1/auth/google/callback` |

   No JavaScript origins are needed: only the API talks to Google.
4. In GitHub, go to **Settings › Environments › <env>** and add:
   - the variable `GOOGLE_CLIENT_ID`: the client ID;
   - the secret `GOOGLE_CLIENT_SECRET`: the client secret.
5. Re-run that environment's **Deploy**. The build then shows "Continue with
   Google", and the Worker receives both values as secrets.

An environment without these two settings simply has no Google button.
