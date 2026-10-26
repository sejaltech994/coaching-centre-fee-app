"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { logout, type CentreResponse } from "@/lib/api";
import { clearSession } from "@/lib/session";
import styles from "./app.module.css";

type Section = "dashboard" | "batches";

// Only sections that exist are listed; Students, Fees, Reminders and Settings
// join as they are built (see the Batches design canvas).
const SECTIONS: { id: Section; label: string; href: string; icon: ReactNode }[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  },
  {
    id: "batches",
    label: "Batches",
    href: "/batches",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="5" rx="1.5" />
        <rect x="3" y="11" width="18" height="9" rx="1.5" />
      </>
    ),
  },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

/** Signed-in layout from the design: sidebar on wide screens, bottom navigation on phones. */
export function AppShell({
  current,
  centre,
  children,
}: {
  current: Section;
  centre: CentreResponse["centre"] | null;
  children: ReactNode;
}) {
  const router = useRouter();

  async function logOut() {
    await logout().catch(() => undefined);
    clearSession();
    router.replace("/login");
  }

  const centreName = centre?.name ?? "Your centre";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>
          <span className={styles.coin} aria-hidden="true" />
          Chukta
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          {SECTIONS.map((section) => (
            <Link
              key={section.id}
              href={section.href}
              className={styles.navLink}
              aria-current={section.id === current ? "page" : undefined}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {section.icon}
              </svg>
              {section.label}
            </Link>
          ))}
        </nav>
        <div className={styles.account}>
          {centre && (
            <>
              <span className={styles.avatar} aria-hidden="true">
                {initials(centreName)}
              </span>
              <span className={styles.accountText}>
                <span className={styles.accountName}>{centreName}</span>
                <span className={styles.accountPlan}>{centre.plan === "pro" ? "Pro plan" : "Free plan"}</span>
              </span>
            </>
          )}
          <button type="button" className={styles.logout} onClick={logOut}>
            Log out
          </button>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
