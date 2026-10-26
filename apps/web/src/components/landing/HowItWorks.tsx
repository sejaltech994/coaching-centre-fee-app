import { SectionHeading } from "./SectionHeading";
import styles from "./landing.module.css";

const steps = [
  {
    title: "Add your students",
    body: "Type them in or import a CSV. Put each one in a batch and pick a fee plan: monthly, quarterly or one-time.",
  },
  {
    title: "Reminders go out",
    body: "Parents get a WhatsApp message 3 days before the due date, on the day, and after, each with a UPI payment link.",
  },
  {
    title: "Marked paid, receipt sent",
    body: "When a parent pays, the fee is marked paid automatically and a PDF receipt goes to them on WhatsApp.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className={styles.band}>
      <div className={`${styles.container} ${styles.section}`}>
        <SectionHeading eyebrow="How it works" title="Three steps. Then it runs itself." />
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              <h3 className={styles.h3}>{step.title}</h3>
              <p className={styles.muted}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
