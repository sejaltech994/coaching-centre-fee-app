"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginFlow } from "@/components/auth/LoginFlow";

function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <LoginFlow
      // The landing page's sign-up form sends ?phone=…
      initialPhone={params.get("phone") ?? ""}
      // The API's Google callback sends ?via=google[&hint=…] or ?google_error=…
      via={params.get("via") ?? undefined}
      hint={params.get("hint") ?? undefined}
      googleError={params.get("google_error") ?? undefined}
      // Inlined at build time: on where the environment has a Google OAuth client.
      googleEnabled={process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === "on"}
      // A new centre has nothing to show yet: its first job is adding batches.
      onSignedIn={(session) => router.replace(session.isNewAccount ? "/batches" : "/dashboard")}
    />
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      {/* useSearchParams needs a Suspense boundary in a statically exported page. */}
      <Suspense fallback={null}>
        <LoginScreen />
      </Suspense>
    </AuthShell>
  );
}
