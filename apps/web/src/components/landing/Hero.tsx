import { PhonePreview } from "./PhonePreview";
import styles from "./landing.module.css";

export function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>For tuition classes &amp; coaching centres</p>
        <h1 className={styles.h1}>
          Stop chasing fees. Get them <span className={styles.highlight}>settled.</span>
        </h1>
        <p className={styles.lead}>
          Chukta sends parents a polite WhatsApp reminder with a UPI link, then marks the fee paid the moment the money
          lands. No notebook, no awkward calls.
        </p>
        <div className={styles.actions}>
          <a href="#start" className={`${styles.btnPrimary} ${styles.btnLarge}`}>
            Start free — up to 25 students
          </a>
          <a href="#how" className={`${styles.btnSecondary} ${styles.btnLarge}`}>
            See how it works
          </a>
        </div>
        <p className={styles.caption}>Phone OTP login · no card needed · set up in under 15 minutes</p>
      </div>
      <PhonePreview />
    </section>
  );
}
