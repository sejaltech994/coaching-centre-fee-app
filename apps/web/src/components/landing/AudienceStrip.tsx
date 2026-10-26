import { Fragment } from "react";
import styles from "./landing.module.css";

const audiences = ["Tuition classes", "Coaching centres", "Dance & music academies", "Sports coaches", "20 to 300 students"];

export function AudienceStrip() {
  // The list is rendered twice so the marquee can loop seamlessly at -50%.
  const items = [...audiences, ...audiences];

  return (
    <section aria-label="Who it is for" className={styles.marquee}>
      <p className={styles.visuallyHidden}>
        Made for tuition classes, coaching centres, dance and music academies and sports coaches with 20 to 300 students.
      </p>
      <div className={styles.marqueeTrack} aria-hidden="true">
        {items.map((audience, index) => (
          <Fragment key={index}>
            <span>{audience}</span>
            <span>✦</span>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
