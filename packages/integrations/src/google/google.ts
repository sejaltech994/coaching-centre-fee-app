import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Google sign-in: OAuth 2.0 authorisation code flow with PKCE (TSD: Registration,
 * login and profile). Only the verified profile is kept; Google's access and
 * refresh tokens are dropped.
 */

export type GoogleProfile = {
  /** Google's stable account id. Emails can change; this can't. */
  sub: string;
  /** Lower-cased and verified by Google. */
  email: string;
  name: string | null;
  picture: string | null;
};

export type AuthorizationRequest = {
  redirectUri: string;
  state: string;
  nonce: string;
  /** base64url(SHA-256(code verifier)). */
  codeChallenge: string;
};

export type ExchangeRequest = { code: string; codeVerifier: string; redirectUri: string; nonce: string };

export interface GoogleSignIn {
  authorizationUrl(request: AuthorizationRequest): string;
  /** Swaps the code for an ID token and verifies it. Throws GoogleSignInError. */
  exchange(request: ExchangeRequest): Promise<GoogleProfile>;
}

export class GoogleSignInError extends Error {
  constructor(readonly reason: "failed" | "email_unverified") {
    super(`Google sign-in ${reason}`);
    this.name = "GoogleSignInError";
  }
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const authorizationParams = (clientId: string, r: AuthorizationRequest) => ({
  client_id: clientId,
  redirect_uri: r.redirectUri,
  response_type: "code",
  scope: "openid email profile",
  state: r.state,
  nonce: r.nonce,
  code_challenge: r.codeChallenge,
  code_challenge_method: "S256",
  // Always show the account chooser, so a shared computer doesn't pick the last account.
  prompt: "select_account",
});

export function createGoogleSignIn(options: {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  /** Google's signing keys; injectable for tests. */
  jwks?: JWTVerifyGetKey;
  /** Seconds since the epoch; injectable for tests. */
  now?: () => number;
}): GoogleSignIn {
  const { clientId, clientSecret } = options;
  const fetchImpl = options.fetch ?? fetch;
  const jwks = options.jwks ?? createRemoteJWKSet(new URL(CERTS_URL));

  return {
    authorizationUrl(request) {
      return `${AUTH_URL}?${new URLSearchParams(authorizationParams(clientId, request))}`;
    },

    async exchange({ code, codeVerifier, redirectUri, nonce }) {
      const res = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      }).catch(() => null);
      if (!res?.ok) throw new GoogleSignInError("failed");
      const { id_token: idToken } = (await res.json()) as { id_token?: string };
      if (!idToken) throw new GoogleSignInError("failed");

      let claims;
      try {
        ({ payload: claims } = await jwtVerify(idToken, jwks, {
          issuer: ISSUERS,
          audience: clientId,
          currentDate: options.now ? new Date(options.now() * 1000) : undefined,
        }));
      } catch {
        throw new GoogleSignInError("failed");
      }
      if (claims.nonce !== nonce || typeof claims.sub !== "string" || typeof claims.email !== "string") {
        throw new GoogleSignInError("failed");
      }
      if (claims.email_verified !== true) throw new GoogleSignInError("email_unverified");

      return {
        sub: claims.sub,
        email: claims.email.toLowerCase(),
        name: typeof claims.name === "string" ? claims.name : null,
        picture: typeof claims.picture === "string" ? claims.picture : null,
      };
    },
  };
}

// --- Fake Google, for local development and automated tests. Never production. ---

type FakeChoice = { email: string; name: string; nonce: string };

/** The code the fake account chooser hands back: the chosen account, readable by exchange(). */
export function fakeGoogleCode(choice: FakeChoice): string {
  return `fake.${Buffer.from(JSON.stringify(choice)).toString("base64url")}`;
}

export function createFakeGoogleSignIn(): GoogleSignIn {
  return {
    authorizationUrl(request) {
      // The API serves the chooser on its own origin (see the auth routes).
      const chooser = new URL("/api/v1/auth/google/fake", request.redirectUri);
      chooser.search = new URLSearchParams(authorizationParams("fake", request)).toString();
      return chooser.toString();
    },

    async exchange({ code, nonce }) {
      let choice: Partial<FakeChoice>;
      try {
        if (!code.startsWith("fake.")) throw new Error("not a fake code");
        choice = JSON.parse(Buffer.from(code.slice(5), "base64url").toString());
      } catch {
        throw new GoogleSignInError("failed");
      }
      if (choice.nonce !== nonce || !choice.email) throw new GoogleSignInError("failed");
      const email = choice.email.trim().toLowerCase();
      return { sub: `fake:${email}`, email, name: choice.name?.trim() || null, picture: null };
    },
  };
}
