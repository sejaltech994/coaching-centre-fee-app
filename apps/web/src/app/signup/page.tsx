"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { copy } from "@/lib/copy";
import { setAccessToken } from "@/lib/session";

/** Where the API's Google callback sends a Google account with no Chukta account yet. */
export default function SignUpPage() {
  const router = useRouter();
  const expired = useCallback(() => router.replace("/login/?google_error=expired"), [router]);
  return (
    <AuthShell promise={copy.profile.promise} pitch={copy.profile.pitch}>
      <SignUpForm
        onExpired={expired}
        onSignedUp={(session) => {
          setAccessToken(session.accessToken);
          // A new centre has nothing to show yet: its first job is adding batches.
          router.replace("/batches");
        }}
      />
    </AuthShell>
  );
}
