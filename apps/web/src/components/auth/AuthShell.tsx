import Link from "next/link";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import styles from "./auth.module.css";

/**
 * The sign-up and login frame from the design: the night-ledger panel with the
 * promise on one side, the form on paper on the other. Stacks on phones.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.aside}>
        <Link href="/" className={styles.brand}>
          <span className={styles.coin} aria-hidden="true" />
          Chukta
          <span className={styles.brandHindi} lang="hi">
            चुकता
          </span>
        </Link>
        <div className={styles.pitch}>
          <p className={styles.promise}>{copy.auth.promise}</p>
          <p className={styles.pitchLead}>{copy.auth.pitch}</p>
        </div>
        <div className={styles.coins} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </aside>
      <main className={styles.main}>
        <div className={styles.panel}>{children}</div>
      </main>
    </div>
  );
}
