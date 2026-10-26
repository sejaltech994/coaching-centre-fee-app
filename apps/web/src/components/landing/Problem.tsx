import { SectionHeading } from "./SectionHeading";
import styles from "./landing.module.css";

// Each notebook habit, and what replaces it once the fee is settled.
const ledger = [
  { before: "Fees written in a notebook or an Excel sheet", after: "Every student, batch and fee plan in one place" },
  { before: "One WhatsApp message at a time, every month", after: "Reminders go out on their own, before and after the due date" },
  { before: "Awkward calls to parents you see every day", after: "Parents pay by UPI from the message" },
  { before: "A few fees quietly never get paid", after: "Recover one or two missed fees and the app has paid for itself" },
];

export function Problem() {
  return (
    <section className={styles.paperLedger}>
      <div className={`${styles.container} ${styles.section}`}>
        <SectionHeading eyebrow="The problem" title="You teach. You shouldn’t also be a collection agent." />
        <div className={styles.ledger} role="table" aria-label="Before and after Chukta">
          <div className={styles.ledgerHead} role="row">
            <span className={styles.headBefore} role="columnheader">
              BEFORE — THE NOTEBOOK
            </span>
            <span className={styles.headAfter} role="columnheader">
              AFTER — CHUKTA
            </span>
          </div>
          {ledger.map((row) => (
            <div key={row.before} className={styles.ledgerRow} role="row">
              <span className={styles.before} role="cell">
                {row.before}
              </span>
              <span className={styles.after} role="cell">
                <svg className={styles.tick} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                {row.after}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
