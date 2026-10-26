"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import styles from "@/components/auth/auth.module.css";
import { getCentre, logout, type CentreResponse } from "@/lib/api";
import { clearSession, ensureAccessToken } from "@/lib/session";

/** Signed-in home. The real dashboard (collected vs pending) arrives in the Launch phase. */
export default function DashboardPage() {
  const router = useRouter();
  const routerRef = useRef(router);
  const [centre, setCentre] = useState<CentreResponse["centre"] | null>(null);

  // Load once on mount. Reading the router through a ref keeps a re-render from
  // re-running this (a second load could overwrite the first with stale data).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await ensureAccessToken();
      if (!token) return routerRef.current.replace("/login");
      try {
        const result = await getCentre(token);
        if (!cancelled) setCentre(result.centre);
      } catch {
        clearSession();
        routerRef.current.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function logOut() {
    await logout().catch(() => undefined);
    clearSession();
    router.replace("/login");
  }

  return (
    <AuthShell>
      {centre ? (
        <div className={styles.form}>
          <p className={styles.meta}>{centre.plan === "pro" ? "Pro plan" : "Free plan"}</p>
          <h1 className={styles.title}>{centre.name ?? "Welcome to Chukta"}</h1>
          <p className={styles.lead}>
            {centre.name
              ? "You're logged in. Students, batches and fee plans come next."
              : "You're in. Next, name your centre so it appears on reminders and receipts."}
          </p>
          <button className={styles.primary} type="button" onClick={logOut}>
            Log out
          </button>
        </div>
      ) : (
        <p className={styles.lead} aria-live="polite">
          Loading…
        </p>
      )}
    </AuthShell>
  );
}
