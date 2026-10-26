import styles from "./landing.module.css";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  centered?: boolean;
};

export function SectionHeading({ eyebrow, title, centered = false }: SectionHeadingProps) {
  return (
    <div className={centered ? styles.headingCentered : styles.heading}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 className={styles.h2}>{title}</h2>
    </div>
  );
}
