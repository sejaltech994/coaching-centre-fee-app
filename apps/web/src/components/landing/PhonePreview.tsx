import styles from "./landing.module.css";

/** Illustration of a reminder conversation on a parent's phone, with the owner's month summary around it. */
export function PhonePreview() {
  return (
    <div className={styles.heroVisual} role="img" aria-label="A WhatsApp reminder with a UPI link, the parent paying, and a receipt being sent back">
      <div className={styles.phone} aria-hidden="true">
        <div className={styles.phoneScreen}>
          <div className={styles.chatHeader}>
            <span className={styles.avatar}>SC</span>
            <span className={styles.chatTitle}>
              Sunrise Classes
              <span className={styles.chatSubtitle}>via Chukta</span>
            </span>
          </div>
          <div className={styles.chatBody}>
            <div className={styles.bubbleIn}>
              <p>
                Namaste Mrs. Sharma, Aarav’s November fee of <b>₹2,500</b> for Class 10 Maths is due on <b>5 Nov</b>.
              </p>
              <p>Pay in one tap by UPI:</p>
              <span className={styles.payLink}>chk.in/pay/8F2K</span>
              <span className={styles.time}>10:02 am</span>
            </div>
            <div className={styles.bubbleOut}>Paid, thank you!</div>
            <div className={styles.bubbleIn}>
              <span className={styles.received}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M7.5 12.5l3 3 6-6.5" />
                </svg>
                Received ₹2,500
              </span>
              <span>Receipt #SC-0412 attached</span>
              <span className={styles.attachment}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--overdue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                  <path d="M14 3v5h5" />
                </svg>
                Receipt-Nov-Aarav.pdf
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.statCard} aria-hidden="true">
        <span className={styles.statLabel}>NOVEMBER</span>
        <span className={styles.amount}>₹1,24,500</span>
        <span className={styles.caption}>collected of ₹1,38,000</span>
        <div className={styles.progress}>
          <div className={styles.progressFill} style={{ width: "90%" }} />
        </div>
      </div>

      <div className={styles.statusStack} aria-hidden="true">
        <span className={styles.pillPaid}>Paid · 42</span>
        <span className={styles.pillPending}>Pending · 5</span>
        <span className={styles.pillOverdue}>Overdue · 2</span>
      </div>
    </div>
  );
}
