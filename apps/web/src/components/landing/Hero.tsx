import { PhonePreview } from "./PhonePreview";
import styles from "./landing.module.css";
import { delay } from "./motion";

export function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={`${styles.eyebrow} ${styles.rise}`} style={delay(100)}>
          <span className={styles.eyebrowDash} aria-hidden="true" />
          For tuition classes &amp; coaching centres
        </p>
        <h1 className={styles.h1}>
          <span className={styles.h1Line} style={delay(200)}>
            Stop chasing fees.
          </span>
          <span className={styles.h1Line} style={delay(340)}>
            Get them <span className={styles.settled}>settled.</span>
          </span>
        </h1>
        <p className={`${styles.lead} ${styles.rise}`} style={delay(480)}>
          Chukta sends parents a polite WhatsApp reminder with a UPI link, then marks the fee paid the moment the money
          lands. No notebook, no awkward calls.
        </p>
        <div className={`${styles.actions} ${styles.rise}`} style={delay(600)}>
          <a href="#start" className={`${styles.btnPrimary} ${styles.btnLarge}`}>
            Start free — up to 25 students
          </a>
          <a href="#how" className={`${styles.btnGhost} ${styles.btnLarge}`}>
            See how it works
          </a>
        </div>
        <p className={`${styles.caption} ${styles.rise}`} style={delay(700)}>
          Phone OTP login · no card · live in 15 minutes
        </p>
      </div>
      <PhonePreview />
    </section>
  );
}
