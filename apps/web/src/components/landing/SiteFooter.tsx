import styles from "./landing.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <span className={styles.footerWord}>Chukta</span>
          <span className={styles.footerHindi} lang="hi">
            चुकता
          </span>
          <span>· Fees, settled.</span>
        </div>
        <nav aria-label="Footer" className={styles.footerNav}>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
