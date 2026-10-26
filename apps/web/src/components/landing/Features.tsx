import { SectionHeading } from "./SectionHeading";
import styles from "./landing.module.css";

const features = [
  {
    code: "F—02",
    title: "Automatic WhatsApp reminders",
    body: "Polite, scheduled messages with a UPI link. SMS as a backup when WhatsApp fails.",
  },
  {
    code: "F—03",
    title: "Auto-marked paid, with receipts",
    body: "No manual entry. Every payment gets a numbered PDF receipt. Cash can be recorded too.",
  },
  {
    code: "F—04",
    title: "Students, batches, fee plans",
    body: "Monthly, quarterly or one-time plans, discounts per student, CSV import.",
  },
  {
    code: "F—05",
    title: "Quick attendance",
    body: "Tick off a batch in seconds. Optionally tell parents when their child is absent.",
  },
];

const overdueSample = [
  { name: "Ishita Rao", detail: "Class 8 Science · due 1 Nov", amount: "₹1,800" },
  { name: "Kabir Mehta", detail: "Kathak juniors · due 3 Nov", amount: "₹1,200" },
];

export function Features() {
  return (
    <section id="features" className={styles.paperRuled}>
      <div className={`${styles.container} ${styles.section}`}>
        <SectionHeading eyebrow="Features" title="Everything a small centre needs. Nothing it doesn’t." />
        <div className={styles.features}>
          <div className={styles.featureHero}>
            <span className={styles.code}>F—01</span>
            <h3 className={styles.featureHeroTitle}>Dashboard at a glance</h3>
            <p className={styles.stepBody}>Collected vs pending this month, a defaulters list, and one tap to remind them all.</p>
            <div className={styles.miniDashboard} role="img" aria-label="Example: two overdue students with a Remind all button">
              <div className={styles.miniRow} aria-hidden="true">
                <span className={styles.miniTitle}>Overdue this month</span>
                <span className={styles.miniAction}>Remind all</span>
              </div>
              {overdueSample.map((student) => (
                <div key={student.name} className={styles.miniRowDivided} aria-hidden="true">
                  <span className={styles.miniStudent}>
                    {student.name}
                    <span className={styles.miniDetail}>{student.detail}</span>
                  </span>
                  <span className={styles.amountPill}>{student.amount}</span>
                </div>
              ))}
            </div>
          </div>

          {features.map((feature) => (
            <div key={feature.title} className={styles.featureCard}>
              <span className={styles.code}>{feature.code}</span>
              <h3 className={styles.h3}>{feature.title}</h3>
              <p className={styles.muted}>{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
