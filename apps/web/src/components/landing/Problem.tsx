import { SectionHeading } from "./SectionHeading";
import styles from "./landing.module.css";

const today = [
  "Fees written in a notebook or an Excel sheet",
  "One WhatsApp message at a time, every month",
  "Awkward calls to parents you see every day",
  "A few fees quietly never get paid",
];

const withChukta = [
  "Every student, batch and fee plan in one place",
  "Reminders go out on their own, before and after the due date",
  "Parents pay by UPI from the message",
  "Recover one or two missed fees and the app has paid for itself",
];

export function Problem() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <SectionHeading eyebrow="The problem" title="You teach. You shouldn’t also be a collection agent." />
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p className={styles.labelOverdue}>TODAY</p>
          <ul className={`${styles.list} ${styles.muted}`}>
            {today.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className={styles.cardDeep}>
          <p className={styles.labelAccent}>WITH CHUKTA</p>
          <ul className={styles.list}>
            {withChukta.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
