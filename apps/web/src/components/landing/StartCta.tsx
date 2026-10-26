import styles from "./landing.module.css";

/** Sign-up band. Submits the number to the login page, which sends the OTP. */
export function StartCta() {
  return (
    <section id="start" className={styles.ctaWrap}>
      <div className={styles.cta}>
        <div className={styles.ctaCopy}>
          <h2 className={styles.h2}>This month, let every fee get settled.</h2>
          <p className={styles.ctaLead}>Log in with your phone number and send your first reminder today.</p>
        </div>
        <form className={styles.ctaForm} action="/login" method="get">
          <label htmlFor="phone" className={styles.visuallyHidden}>
            Mobile number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            required
            className={styles.phoneInput}
          />
          <button type="submit" className={styles.ctaSubmit}>
            Get OTP
          </button>
        </form>
      </div>
    </section>
  );
}
