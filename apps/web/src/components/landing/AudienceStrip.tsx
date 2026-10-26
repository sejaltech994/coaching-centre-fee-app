import styles from "./landing.module.css";

const audiences = ["Tuition classes", "Coaching centres", "Dance & music academies", "Sports coaches"];

export function AudienceStrip() {
  return (
    <section aria-label="Who it is for" className={styles.bandSunk}>
      <div className={styles.audience}>
        <strong>Made for teachers with 20 to 300 students</strong>
        {audiences.map((audience) => (
          <span key={audience}>{audience}</span>
        ))}
      </div>
    </section>
  );
}
