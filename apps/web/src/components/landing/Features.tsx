import type { ReactNode } from "react";
import { SectionHeading } from "./SectionHeading";
import styles from "./landing.module.css";

const iconProps = {
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const features: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Automatic WhatsApp reminders",
    body: "Polite, scheduled messages with a UPI link. SMS as a backup when WhatsApp fails.",
    icon: (
      <svg {...iconProps}>
        <path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.4L3 20.5l1.6-5.3A8.5 8.5 0 1 1 21 11.5z" />
      </svg>
    ),
  },
  {
    title: "Auto-marked paid, with receipts",
    body: "No manual entry. Every payment gets a numbered PDF receipt. Cash can be recorded too.",
    icon: (
      <svg {...iconProps}>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
        <path d="M9 8h6M9 12h6" />
      </svg>
    ),
  },
  {
    title: "Students, batches, fee plans",
    body: "Monthly, quarterly or one-time plans, discounts per student, CSV import.",
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c1.6.6 2.6 2 3 5" />
      </svg>
    ),
  },
  {
    title: "Quick attendance",
    body: "Tick off a batch in seconds. Optionally tell parents when their child is absent.",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="M3 9h18M8 2v4M16 2v4M8 14l2.5 2.5L16 12" />
      </svg>
    ),
  },
];

const overdueSample = [
  { name: "Ishita Rao", detail: "Class 8 Science · due 1 Nov", amount: "₹1,800" },
  { name: "Kabir Mehta", detail: "Kathak juniors · due 3 Nov", amount: "₹1,200" },
];

export function Features() {
  return (
    <section id="features" className={`${styles.container} ${styles.section}`}>
      <SectionHeading eyebrow="Features" title="Everything a small centre needs. Nothing it doesn’t." />
      <div className={styles.features}>
        <div className={styles.featureHero}>
          <h3 className={styles.h3}>Dashboard at a glance</h3>
          <p className={styles.muted}>Collected vs pending this month, a defaulters list, and one tap to remind them all.</p>
          <div className={styles.miniDashboard} role="img" aria-label="Example: two overdue students with a Remind all button">
            <div className={styles.miniRow} aria-hidden="true">
              <span className={styles.miniTitle}>Overdue this month</span>
              <span className={styles.miniAction}>Remind all</span>
            </div>
            {overdueSample.map((student) => (
              <div key={student.name} className={styles.miniRowDivided} aria-hidden="true">
                <span className={styles.miniStudent}>
                  {student.name}
                  <span className={styles.caption}>{student.detail}</span>
                </span>
                <span className={styles.pillOverdue}>{student.amount}</span>
              </div>
            ))}
          </div>
        </div>

        {features.map((feature) => (
          <div key={feature.title} className={styles.featureCard}>
            <span className={styles.featureIcon}>{feature.icon}</span>
            <h3 className={styles.h3}>{feature.title}</h3>
            <p className={styles.muted}>{feature.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
