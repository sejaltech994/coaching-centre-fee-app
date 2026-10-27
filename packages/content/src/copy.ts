/**
 * Every piece of app text that editors manage in the CMS (Sanity), with the
 * built-in wording used when the CMS has none. The code owns which texts exist
 * and which {placeholders} each may use; editors own the words.
 */

export type Entry = {
  /** What editors see beside the field in the CMS. */
  label: string;
  /** The built-in wording. Its {placeholders} are the ones edits must keep. */
  text: string;
  /** A paragraph rather than one line. */
  multiline?: boolean;
};

export type Catalog = Record<string, { title: string; entries: Record<string, Entry> }>;

export type CopyOf<C extends Catalog> = { [A in keyof C]: { [K in keyof C[A]["entries"]]: string } };

export const CATALOG = {
  auth: {
    title: "Sign up and login",
    entries: {
      promise: { label: "Side panel: headline", text: "Fees, settled." },
      pitch: {
        label: "Side panel: line under the headline",
        text: "Batches, reminders with UPI links, and receipts for your coaching centre.",
        multiline: true,
      },
      welcomeTitle: { label: "Welcome: heading", text: "Welcome to Chukta" },
      welcomeLead: {
        label: "Welcome: text under the heading",
        text: "Sign up or log in with the same steps. New here? We’ll set up your centre next.",
        multiline: true,
      },
      continueWithGoogle: { label: "Welcome: Google button", text: "Continue with Google" },
      continueWithMobile: { label: "Welcome: mobile button", text: "Continue with mobile number" },
      googlePhoneTitle: { label: "After Google: heading", text: "Verify your mobile number" },
      googlePhoneLead: {
        label: "After Google: text under the heading",
        text: "Signed in with Google as {email}. Add your mobile number: reminders, receipts and account recovery use it.",
        multiline: true,
      },
      googleEmailInUse: {
        label: "After Google: the email already has an account",
        text: "This email already has a Chukta account. Verify its mobile number to connect Google.",
        multiline: true,
      },
      legalNotice: {
        label: "Legal line under the buttons ({terms} and {privacy} become links)",
        text: "By continuing you agree to Chukta’s {terms} and {privacy}.",
      },
      termsLink: { label: "Link text: Terms", text: "Terms" },
      privacyLink: { label: "Link text: Privacy notice", text: "Privacy notice" },
      back: { label: "Back button", text: "Back" },
      phoneTitle: { label: "Mobile number: heading", text: "Your mobile number" },
      phoneLead: { label: "Mobile number: text under the heading", text: "We’ll send a 6-digit code by SMS." },
      phoneLabel: { label: "Mobile number: field label", text: "Mobile number" },
      phoneHint: { label: "Mobile number: hint under the field", text: "Indian numbers only for now." },
      phoneInvalid: { label: "Mobile number: not a valid number", text: "Enter a 10-digit Indian mobile number." },
      sendCode: { label: "Mobile number: button", text: "Send code" },
      codeTitle: { label: "Code: heading", text: "Enter the code" },
      codeSentTo: { label: "Code: where it was sent", text: "Sent by SMS to {phone}." },
      changeNumber: { label: "Code: change number link", text: "Change number" },
      codeLabel: { label: "Code: label above the boxes", text: "6-digit code" },
      digitLabel: { label: "Code: screen-reader name of each box", text: "Digit {n}" },
      codeIncomplete: { label: "Code: fewer than 6 digits entered", text: "Enter the 6-digit code." },
      resendIn: { label: "Code: resend countdown", text: "Resend code in {time}" },
      resend: { label: "Code: resend button", text: "Resend code" },
      codeValidity: { label: "Code: how long it lasts", text: "Valid for 5 minutes" },
      verify: { label: "Code: button", text: "Verify" },
    },
  },
  profile: {
    title: "Profile setup",
    entries: {
      title: { label: "Heading", text: "Set up your centre" },
      lead: {
        label: "Text under the heading",
        text: "{phone} is verified. Tell us about your centre to finish signing up.",
        multiline: true,
      },
      fullName: { label: "Field: owner's name", text: "Your name" },
      centreName: { label: "Field: centre name", text: "Centre name" },
      city: { label: "Field: city", text: "City" },
      centreType: { label: "Field: type of centre", text: "Type of centre" },
      chooseOne: { label: "Type of centre: empty choice", text: "Choose one" },
      typeTuition: { label: "Type of centre: tuition", text: "Tuition" },
      typeCoaching: { label: "Type of centre: coaching", text: "Coaching" },
      typeDance: { label: "Type of centre: dance", text: "Dance" },
      typeMusic: { label: "Type of centre: music", text: "Music" },
      typeSports: { label: "Type of centre: sports", text: "Sports" },
      typeOther: { label: "Type of centre: other", text: "Other" },
      email: { label: "Field: email", text: "Email (optional)" },
      terms: {
        label: "Terms checkbox ({terms} and {privacy} become links)",
        text: "I agree to Chukta’s {terms} and {privacy}.",
      },
      submit: { label: "Button", text: "Create my centre" },
      startOver: { label: "Button when the sign-up expired", text: "Verify my number again" },
    },
  },
  errors: {
    title: "Error messages",
    entries: {
      network: { label: "No connection", text: "Can't reach Chukta. Check your connection and try again." },
      generic: { label: "Anything unexpected", text: "Something went wrong. Try again." },
      invalidOtp: { label: "Wrong code, several tries left", text: "That code didn’t match. {tries} tries left." },
      invalidOtpLastTry: { label: "Wrong code, one try left", text: "That code didn’t match. 1 try left." },
      tooManyAttempts: { label: "Code locked after 5 wrong tries", text: "Too many wrong codes. Request a new one." },
      otpExpired: { label: "Code expired or already used", text: "This code has expired. Request a new one." },
      resendTooSoon: { label: "New code asked for too soon", text: "Wait {seconds} seconds before asking for a new code." },
      rateLimited: { label: "Hourly code limit reached", text: "Too many codes requested. Try again later." },
      smsUnavailable: { label: "SMS could not be sent", text: "We couldn't send the SMS. Try again in a moment." },
      signupExpired: { label: "Sign-up took longer than 15 minutes", text: "Your sign-up has expired. Verify your number again." },
      accountExists: { label: "Number already has an account", text: "This number already has an account. Log in instead." },
      googleCancelled: {
        label: "Google: cancelled",
        text: "Google sign-in was cancelled. Try again, or continue with your mobile number.",
      },
      googleUnavailable: {
        label: "Google: not set up",
        text: "Google sign-in isn’t available right now. Continue with your mobile number.",
      },
      googleEmailUnverified: {
        label: "Google: email not verified by Google",
        text: "Google hasn’t verified this email. Use another Google account or your mobile number.",
      },
      googleFailed: { label: "Google: anything else", text: "Google sign-in didn’t work. Try again, or continue with your mobile number." },
      googleExpired: { label: "Google: took longer than 15 minutes", text: "Your Google sign-in has expired. Continue with Google again." },
      googleAlreadyLinked: {
        label: "Google: account has a different Google account",
        text: "This account is already connected to a different Google account.",
      },
      googleInUse: {
        label: "Google: Google account belongs to another account",
        text: "This Google account is connected to another Chukta account.",
      },
      emailTaken: {
        label: "Email used by another account",
        text: "Another account uses this email. Use a different one or leave it blank.",
      },
    },
  },
} satisfies Catalog;

export type Copy = CopyOf<typeof CATALOG>;

/** {name} placeholders in order of first appearance. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))];
}

/** true, or why `value` can't replace this entry's text: the CMS shows it, the build logs it. */
export function checkEntry(entry: Entry, value: string): true | string {
  const allowed = placeholdersIn(entry.text);
  const used = placeholdersIn(value);
  const missing = allowed.find((name) => !used.includes(name));
  if (missing) return `must include {${missing}}`;
  const extra = used.find((name) => !allowed.includes(name));
  if (extra) return `{${extra}} can't be filled in here`;
  return true;
}

export function defaultCopy<C extends Catalog>(catalog: C): CopyOf<C> {
  return Object.fromEntries(
    Object.entries(catalog).map(([area, { entries }]) => [
      area,
      Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, entry.text])),
    ]),
  ) as CopyOf<C>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Merges text from the CMS over the built-in wording. An entry the CMS gets
 * wrong (not text, a lost placeholder) keeps its built-in text; every such case
 * is listed in `problems` so the build can report it.
 */
export function resolveCopy<C extends Catalog = typeof CATALOG>(
  raw: unknown,
  catalog: C = CATALOG as unknown as C,
): { copy: CopyOf<C>; problems: string[] } {
  const copy = defaultCopy(catalog) as Record<string, Record<string, string>>;
  const problems: string[] = [];
  if (!isRecord(raw)) return { copy: copy as CopyOf<C>, problems };

  for (const [area, values] of Object.entries(raw)) {
    const known = catalog[area];
    if (!known || !isRecord(values)) {
      problems.push(`${area}: not used by the app`);
      continue;
    }
    for (const [key, value] of Object.entries(values)) {
      const entry = known.entries[key];
      if (!entry) {
        problems.push(`${area}.${key}: not used by the app`);
        continue;
      }
      if (typeof value !== "string") {
        problems.push(`${area}.${key}: not text`);
        continue;
      }
      const text = value.trim();
      if (!text) continue;
      const verdict = checkEntry(entry, text);
      if (verdict === true) copy[area]![key] = text;
      else problems.push(`${area}.${key}: ${verdict}`);
    }
  }
  return { copy: copy as CopyOf<C>, problems };
}

/** "Sent to {phone}." + { phone } → "Sent to +91 98765 43210."; unknown placeholders stay visible. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
