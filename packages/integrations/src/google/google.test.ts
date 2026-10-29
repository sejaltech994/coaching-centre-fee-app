import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createFakeGoogleSignIn, createGoogleSignIn, fakeGoogleCode, GoogleSignInError } from "./google";

const CLIENT_ID = "client-123.apps.googleusercontent.com";
const REDIRECT_URI = "https://chukta-web-dev.chukta.workers.dev/api/v1/auth/google/callback";
const NOW = Math.floor(Date.UTC(2026, 9, 27, 10) / 1000);

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

let privateKey: PrivateKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

function idToken(claims: Record<string, unknown> = {}, { key = privateKey }: { key?: PrivateKey } = {}) {
  return new SignJWT({ email: "asha@example.com", email_verified: true, name: "Asha Sharma", picture: "https://lh3.example/a.png", nonce: "n-1", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer((claims.iss as string) ?? "https://accounts.google.com")
    .setAudience((claims.aud as string) ?? CLIENT_ID)
    .setSubject("1234567890")
    .setIssuedAt(NOW - 10)
    .setExpirationTime((claims.exp as number) ?? NOW + 3600)
    .sign(key);
}

function google(tokenResponse: () => Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(tokenResponse);
  const signIn = createGoogleSignIn({ clientId: CLIENT_ID, clientSecret: "secret-xyz", fetch, jwks, now: () => NOW });
  return { signIn, fetch };
}

const exchange = (signIn: ReturnType<typeof createGoogleSignIn>) =>
  signIn.exchange({ code: "auth-code", codeVerifier: "verifier-abc", redirectUri: REDIRECT_URI, nonce: "n-1" });

const ok = async (token: string) => new Response(JSON.stringify({ id_token: token, access_token: "ya29" }), { status: 200 });

describe("createGoogleSignIn", () => {
  it("builds Google's authorisation URL with PKCE, state, nonce and only the scopes it needs", () => {
    const { signIn } = google(() => ok(""));

    const url = new URL(
      signIn.authorizationUrl({ redirectUri: REDIRECT_URI, state: "s-1", nonce: "n-1", codeChallenge: "c".repeat(43) }),
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile",
      state: "s-1",
      nonce: "n-1",
      code_challenge: "c".repeat(43),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  });

  it("exchanges the code with the PKCE verifier and returns the verified profile", async () => {
    const token = await idToken();
    const { signIn, fetch } = google(() => ok(token));

    expect(await exchange(signIn)).toEqual({
      sub: "1234567890",
      email: "asha@example.com",
      name: "Asha Sharma",
      picture: "https://lh3.example/a.png",
    });

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(new URLSearchParams(String(init!.body)))).toEqual({
      grant_type: "authorization_code",
      code: "auth-code",
      code_verifier: "verifier-abc",
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: "secret-xyz",
    });
  });

  it("lower-cases the email", async () => {
    const { signIn } = google(async () => ok(await idToken({ email: "Asha@Example.COM" })));
    expect((await exchange(signIn)).email).toBe("asha@example.com");
  });

  it.each([
    ["a different nonce", { nonce: "someone-else" }],
    ["another app's audience", { aud: "other-app.apps.googleusercontent.com" }],
    ["a different issuer", { iss: "https://evil.example" }],
    ["an expired token", { exp: NOW - 60 }],
  ])("refuses an ID token with %s", async (_label, claims) => {
    const { signIn } = google(async () => ok(await idToken(claims)));
    await expect(exchange(signIn)).rejects.toMatchObject({ reason: "failed" });
  });

  it("refuses an ID token signed by anyone but Google", async () => {
    const stranger = await generateKeyPair("RS256");
    const { signIn } = google(async () => ok(await idToken({}, { key: stranger.privateKey })));
    await expect(exchange(signIn)).rejects.toMatchObject({ reason: "failed" });
  });

  it("refuses an email Google hasn't verified", async () => {
    const { signIn } = google(async () => ok(await idToken({ email_verified: false })));
    await expect(exchange(signIn)).rejects.toEqual(new GoogleSignInError("email_unverified"));
  });

  it("keeps a missing name or photo as empty", async () => {
    const { signIn } = google(async () => ok(await idToken({ name: undefined, picture: undefined })));
    expect(await exchange(signIn)).toMatchObject({ name: null, picture: null });
  });

  it.each([
    ["no ID token", async () => new Response(JSON.stringify({ access_token: "ya29" }), { status: 200 })],
    ["no connection", async () => Promise.reject(new TypeError("fetch failed"))],
  ])("reports %s as a failure", async (_label, response) => {
    const { signIn } = google(response);
    await expect(exchange(signIn)).rejects.toMatchObject({ reason: "failed" });
  });

  it("reports a refused code exchange as a failure", async () => {
    const { signIn } = google(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(exchange(signIn)).rejects.toMatchObject({ reason: "failed" });
  });
});

describe("createFakeGoogleSignIn (never in production)", () => {
  it("sends the browser to the API's own fake account chooser with the same parameters", () => {
    const url = new URL(
      createFakeGoogleSignIn().authorizationUrl({ redirectUri: REDIRECT_URI, state: "s-1", nonce: "n-1", codeChallenge: "c".repeat(43) }),
    );

    expect(url.origin + url.pathname).toBe("https://chukta-web-dev.chukta.workers.dev/api/v1/auth/google/fake");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe("s-1");
    expect(url.searchParams.get("nonce")).toBe("n-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("turns a code from the chooser into a profile, checking the nonce", async () => {
    const fake = createFakeGoogleSignIn();
    const code = fakeGoogleCode({ email: "Asha@Example.com", name: "Asha Sharma", nonce: "n-1" });

    expect(await fake.exchange({ code, codeVerifier: "v", redirectUri: REDIRECT_URI, nonce: "n-1" })).toEqual({
      sub: "fake:asha@example.com",
      email: "asha@example.com",
      name: "Asha Sharma",
      picture: null,
    });
    await expect(fake.exchange({ code, codeVerifier: "v", redirectUri: REDIRECT_URI, nonce: "other" })).rejects.toMatchObject({
      reason: "failed",
    });
    await expect(fake.exchange({ code: "garbage", codeVerifier: "v", redirectUri: REDIRECT_URI, nonce: "n-1" })).rejects.toMatchObject({
      reason: "failed",
    });
  });

  it("keeps a blank name as empty, and refuses a choice without an email", async () => {
    const fake = createFakeGoogleSignIn();
    const blankName = fakeGoogleCode({ email: "a@example.com", name: " ", nonce: "n-1" });
    expect(await fake.exchange({ code: blankName, codeVerifier: "v", redirectUri: REDIRECT_URI, nonce: "n-1" })).toMatchObject({
      name: null,
    });
    const noEmail = fakeGoogleCode({ email: "", name: "A", nonce: "n-1" });
    await expect(fake.exchange({ code: noEmail, codeVerifier: "v", redirectUri: REDIRECT_URI, nonce: "n-1" })).rejects.toMatchObject({
      reason: "failed",
    });
  });
});
