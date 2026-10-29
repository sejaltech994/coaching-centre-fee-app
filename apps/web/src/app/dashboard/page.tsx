"use client";

import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import app from "@/components/app/app.module.css";
import { useSession } from "@/lib/useSession";

/** Signed-in home. The real dashboard (collected vs pending) arrives in the Launch phase. */
export default function DashboardPage() {
  const { centre } = useSession();

  return (
    <AppShell current="dashboard" centre={centre}>
      {centre ? (
        <>
          <div className={app.titleGroup}>
            <h1 className={app.title}>{centre.name ?? "Welcome to Chukta"}</h1>
            <p className={app.subtitle}>
              {centre.name
                ? "Set up your batches, then students and fee plans."
                : "You're in. Start with your batches; you'll be able to name your centre in settings."}
            </p>
          </div>
          <div>
            <Link href="/batches" className={app.primaryButton}>
              Set up batches
            </Link>
          </div>
        </>
      ) : (
        <p className={app.muted} aria-live="polite">
          Loading…
        </p>
      )}
    </AppShell>
  );
}
