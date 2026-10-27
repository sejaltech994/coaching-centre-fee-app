"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginFlow } from "@/components/auth/LoginFlow";

function LoginScreen() {
  const router = useRouter();
  // The landing page's "Get OTP" form sends ?phone=…
  const phone = useSearchParams().get("phone") ?? "";
  return (
    <LoginFlow
      initialPhone={phone}
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
