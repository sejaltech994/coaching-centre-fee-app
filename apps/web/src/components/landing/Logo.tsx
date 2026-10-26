import styles from "./landing.module.css";

export function Logo() {
  return (
    <a href="#top" className={styles.logo}>
      <span className={styles.coin} style={{ width: 22, height: 22 }} aria-hidden="true" />
      <span className={styles.logoWord}>Chukta</span>
    </a>
  );
}
