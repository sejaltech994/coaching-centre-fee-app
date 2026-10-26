import styles from "./landing.module.css";
import { delay } from "./motion";

/**
 * A reminder conversation on a parent's phone, played in order on page load:
 * reminder → reply → receipt → the चुकता (settled) stamp.
 */
export function PhonePreview() {
  return (
    <div
      className={styles.heroVisual}
      role="img"
      aria-label="A WhatsApp reminder with a UPI link, the parent paying, a receipt sent back, and the fee stamped settled"
    >
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.phone} style={delay(300)} aria-hidden="true">
        <div className={styles.phoneScreen}>
          <div className={styles.chatHeader}>
            <span className={styles.avatar}>SC</span>
            <span className={styles.chatTitle}>
              Sunrise Classes
              <span className={styles.chatSubtitle}>via Chukta</span>
            </span>
          </div>
          <div className={styles.chatBody}>
            <div className={styles.bubbleIn} style={delay(1100)}>
              <p>
                Namaste Mrs. Sharma, Aarav’s November fee of <b>₹2,500</b> for Class 10 Maths is due on <b>5 Nov</b>.
              </p>
              <p>Pay in one tap by UPI:</p>
              <span className={styles.payLink}>chk.in/pay/8F2K</span>
              <span className={styles.time}>10:02 am</span>
            </div>
            <div className={styles.bubbleOut} style={delay(1600)}>
              Paid, thank you!
            </div>
            <div className={styles.bubbleIn} style={delay(2000)}>
              <b className={styles.received}>Received ₹2,500</b>
              <span>Receipt #SC-0412 attached</span>
              <span className={styles.attachment}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--overdue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                  <path d="M14 3v5h5" />
                </svg>
                Receipt-Nov-Aarav.pdf
              </span>
            </div>
            <div className={styles.stamp}>
              <span className={styles.stampHindi} lang="hi">
                चुकता
              </span>
              <span className={styles.stampLabel}>PAID · 05 NOV</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.statCard} style={delay(1300)} aria-hidden="true">
        <span className={styles.statLabel}>NOVEMBER</span>
        <span className={styles.amount}>₹1,24,500</span>
        <span className={styles.statNote}>collected of ₹1,38,000</span>
        <div className={styles.progress}>
          <div className={styles.progressFill} style={{ width: "90%" }} />
        </div>
      </div>

      <div className={styles.statusStack} aria-hidden="true">
        <span className={`${styles.pillPaid} ${styles.pop}`} style={delay(1700)}>
          Paid · 42
        </span>
        <span className={`${styles.pillPending} ${styles.pop}`} style={delay(1800)}>
          Pending · 5
        </span>
        <span className={`${styles.pillOverdue} ${styles.pop}`} style={delay(1900)}>
          Overdue · 2
        </span>
      </div>
    </div>
  );
}
