import styles from "./landing.module.css";

export function Logo() {
  return (
    <a href="#top" className={styles.logo}>
      <span className={styles.coin} style={{ width: 20, height: 20 }} aria-hidden="true" />
      <span className={styles.logoWord}>Chukta</span>
      <span className={styles.logoHindi} lang="hi">
        चुकता
      </span>
    </a>
  );
}
