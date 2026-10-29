"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import app from "@/components/app/app.module.css";
import { Settings } from "@/components/settings/Settings";
import type { CentreResponse } from "@/lib/api";
import { navigate } from "@/lib/navigate";
import { clearSession, setCachedCentre } from "@/lib/session";
import { signOut } from "@/lib/signOut";
import { useSession } from "@/lib/useSession";

/** Profile and account. */
export default function SettingsPage() {
  const router = useRouter();
  const session = useSession();
  // A centre changed here, shown in the shell at once.
  const [renamed, setRenamed] = useState<CentreResponse["centre"] | null>(null);

  return (
    <AppShell current="settings" centre={renamed ?? session.centre}>
      {session.token ? (
        <Settings
          token={session.token}
          onCentreChanged={({ id, name, plan, timezone }) => {
            const centre = { id, name, plan, timezone };
            setCachedCentre(centre);
            setRenamed(centre);
          }}
          onSignOut={async () => {
            await signOut();
            router.replace("/login");
          }}
          onDeleted={() => {
            // The API has signed every device out already.
            clearSession();
            navigate("/login/?session=deleted");
          }}
        />
      ) : (
        <p className={app.muted} aria-live="polite">
          Loading…
        </p>
      )}
    </AppShell>
  );
}
