import { createFakeGoogleSignIn, createGoogleSignIn, type GoogleSignIn } from "@chukta/integrations";
import type { Config } from "./config";

/** The Google sign-in client for this environment, or null when Google sign-in is off. */
export function googleFromConfig(google: Config["google"]): GoogleSignIn | null {
  if (!google) return null;
  if (google.provider === "fake") return createFakeGoogleSignIn();
  return createGoogleSignIn({ clientId: google.clientId, clientSecret: google.clientSecret });
}
