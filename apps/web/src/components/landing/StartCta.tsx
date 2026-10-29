import Link from "next/link";
import styles from "./landing.module.css";

/** Sign-up band: on to sign-in, where Google creates the account. */
export function StartCta() {
  return (
    <section id="start" className={styles.cta}>
      <span className={styles.watermark} lang="hi" aria-hidden="true">
        चुकता
      </span>
      <div className={styles.ctaInner}>
        <h2 className={styles.ctaTitle}>
          This month, let every fee get <span className={styles.accent}>settled.</span>
        </h2>
        <p className={styles.ctaLead}>Sign in with Google and send your first reminder today.</p>
        <Link href="/login" className={styles.ctaSubmit}>
          Continue with Google
        </Link>
      </div>
    </section>
  );
}
