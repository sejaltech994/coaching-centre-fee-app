import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./auth.module.css";

/** The night-ledger backdrop and brand mark shared by the login and signed-in screens. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.shell}>
      <Link href="/" className={styles.brand}>
        <span className={styles.coin} aria-hidden="true" />
        Chukta
        <span className={styles.brandHindi} lang="hi">
          चुकता
        </span>
      </Link>
      <div className={styles.card}>{children}</div>
    </main>
  );
}
