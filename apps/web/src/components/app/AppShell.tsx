"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { CentreResponse } from "@/lib/api";
import { signOut } from "@/lib/signOut";
import styles from "./app.module.css";

type Section = "dashboard" | "batches" | "students" | "fees" | "reminders" | "settings";

// The sections of the Batches design canvas.
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
  {
    id: "students",
    label: "Students",
    href: "/students",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c1.6.6 2.6 2 3 5" />
      </>
    ),
  },
  {
    id: "fees",
    label: "Fees",
    href: "/fees",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 10h10M7 14h6" />
      </>
    ),
  },
  {
    id: "reminders",
    label: "Reminders",
    href: "/reminders",
    icon: <path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" />,
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
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
    await signOut();
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
