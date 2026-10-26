import styles from "./landing.module.css";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  centered?: boolean;
  /** "night" for dark sections (marigold eyebrow), "paper" for ledger-paper sections (red eyebrow). */
  tone?: "night" | "paper";
};

export function SectionHeading({ eyebrow, title, centered = false, tone = "paper" }: SectionHeadingProps) {
  return (
    <div className={centered ? styles.headingCentered : styles.heading}>
      <p className={tone === "night" ? styles.eyebrow : styles.eyebrowInk}>{eyebrow}</p>
      <h2 className={styles.h2}>{title}</h2>
    </div>
  );
}
