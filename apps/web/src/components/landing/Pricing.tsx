import { SectionHeading } from "./SectionHeading";
import styles from "./landing.module.css";

export function Pricing() {
  return (
    <section id="pricing" className={styles.paperSunk}>
      <div className={`${styles.container} ${styles.section}`}>
        <SectionHeading eyebrow="Pricing" title="Pays for itself with one recovered fee." centered />
        <div className={styles.plans}>
          <div className={styles.receipt}>
            <div className={styles.receiptHead}>
              <span>RECEIPT · FREE</span>
              <span>NO. 0000</span>
            </div>
            <p className={styles.price}>
              <span className={styles.priceValue}>₹0</span>
              <span className={styles.priceUnit}>forever</span>
            </p>
            <ul className={styles.planList}>
              <li>Up to 25 students</li>
              <li>Batches, fee plans, attendance</li>
              <li>Send reminders by hand</li>
            </ul>
            <a href="#start" className={styles.btnOutline}>
              Start free
            </a>
          </div>

          <div className={styles.receiptPro}>
            <div className={styles.receiptHead}>
              <span>RECEIPT · PRO</span>
              <span className={styles.badge}>MOST CENTRES</span>
            </div>
            <p className={styles.price}>
              <span className={styles.priceValue}>₹499</span>
              <span className={styles.priceUnit}>/ month</span>
            </p>
            <ul className={styles.planList}>
              <li>Unlimited students</li>
              <li>Automatic WhatsApp reminders</li>
              <li>Auto-marked payments and PDF receipts</li>
              <li>Monthly reports</li>
            </ul>
            <a href="#start" className={styles.btnPrimary}>
              Go Pro
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
