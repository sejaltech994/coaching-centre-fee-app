"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignIn } from "@/components/auth/SignIn";

function SignInScreen() {
  const params = useSearchParams();
  return (
    <SignIn
      // Inlined at build time: on where the environment has a Google OAuth client.
      googleEnabled={process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === "on"}
      // The API's Google callback, or an expired sign-up, sends ?google_error=…
      googleError={params.get("google_error") ?? undefined}
      // A signed-in page sends ?session=required (not logged in) or expired (the login ended).
      session={params.get("session") ?? undefined}
    />
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      {/* useSearchParams needs a Suspense boundary in a statically exported page. */}
      <Suspense fallback={null}>
        <SignInScreen />
      </Suspense>
    </AuthShell>
  );
}
