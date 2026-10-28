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
    title: "Sign in",
    entries: {
      promise: { label: "Side panel: headline", text: "Fees, settled." },
      pitch: {
        label: "Side panel: line under the headline",
        text: "Batches, reminders with UPI links, and receipts for your coaching centre.",
        multiline: true,
      },
      signInTitle: { label: "Heading", text: "Sign in" },
      signInLead: {
        label: "Text under the heading",
        text: "Welcome to Chukta. New here? Continuing with Google creates your account.",
        multiline: true,
      },
      continueWithGoogle: { label: "Google button", text: "Continue with Google" },
      legalNotice: {
        label: "Legal line under the button ({terms} and {privacy} become links)",
        text: "By continuing you agree to Chukta’s {terms} and {privacy}.",
      },
      termsLink: { label: "Link text: Terms", text: "Terms" },
      privacyLink: { label: "Link text: Privacy notice", text: "Privacy notice" },
    },
  },
  profile: {
    title: "Sign-up: your centre",
    entries: {
      promise: { label: "Side panel: headline", text: "Almost there." },
      pitch: {
        label: "Side panel: line under the headline",
        text: "Tell us about your centre and you’re in.",
        multiline: true,
      },
      title: { label: "Heading", text: "Tell us about your centre" },
      lead: {
        label: "Text under the heading",
        text: "Signed in with Google as {email}. You can change these later in Settings.",
        multiline: true,
      },
      fullName: { label: "Field: owner's name", text: "Your name" },
      phone: { label: "Field: mobile number", text: "Mobile number" },
      phoneHint: {
        label: "Mobile number: hint under the field",
        text: "For fee reminders on WhatsApp. You’ll confirm it later.",
      },
      centreName: { label: "Field: centre name", text: "Centre name" },
      city: { label: "Field: city", text: "City" },
      centreType: { label: "Field: type of centre", text: "Centre type" },
      typeTuition: { label: "Type of centre: tuition", text: "Tuition" },
      typeCoaching: { label: "Type of centre: coaching", text: "Coaching" },
      typeDance: { label: "Type of centre: dance", text: "Dance" },
      typeMusic: { label: "Type of centre: music", text: "Music" },
      typeSports: { label: "Type of centre: sports", text: "Sports" },
      typeOther: { label: "Type of centre: other", text: "Other" },
      terms: {
        label: "Terms checkbox ({terms} and {privacy} become links)",
        text: "I agree to the {terms} and the {privacy}, including fee reminders on WhatsApp.",
      },
      submit: { label: "Button", text: "Create account" },
    },
  },
  settings: {
    title: "Settings: profile and account",
    entries: {
      title: { label: "Heading", text: "Profile and account" },
      lead: { label: "Text under the heading", text: "Your details, your centre and how you sign in." },
      profile: { label: "Section: profile", text: "Profile" },
      role: { label: "Under the owner's name", text: "Owner · {centre}" },
      editProfile: { label: "Screen-reader name of the profile's Edit button", text: "Edit profile" },
      email: { label: "Row: email", text: "Email" },
      emailFromGoogle: { label: "Email: where it comes from", text: "From your Google account" },
      confirmed: { label: "Status: confirmed", text: "Confirmed" },
      mobile: { label: "Row: mobile number", text: "Mobile number" },
      notConfirmed: { label: "Status: not confirmed", text: "Not confirmed" },
      mobileHint: {
        label: "Mobile number: why it matters",
        text: "Fee reminders go out on WhatsApp once you confirm it.",
      },
      centre: { label: "Section: centre", text: "Centre" },
      editCentre: { label: "Screen-reader name of the centre's Edit button", text: "Edit centre" },
      signInMethods: { label: "Section: sign-in methods", text: "Sign-in methods" },
      google: { label: "Sign-in method: Google", text: "Google" },
      googleConnected: { label: "Google: connected account", text: "Connected as {email}" },
      edit: { label: "Button: edit", text: "Edit" },
      save: { label: "Button: save", text: "Save" },
      cancel: { label: "Button: cancel", text: "Cancel" },
      saved: { label: "Message after saving", text: "Saved." },
      signOut: { label: "Button: sign out", text: "Sign out" },
    },
  },
  errors: {
    title: "Error messages",
    entries: {
      network: { label: "No connection", text: "Can't reach Chukta. Check your connection and try again." },
      generic: { label: "Anything unexpected", text: "Something went wrong. Try again." },
      googleCancelled: { label: "Google: cancelled", text: "Google sign-in was cancelled. Try again when you’re ready." },
      googleUnavailable: { label: "Google: not set up", text: "Sign-in isn’t available right now. Try again later." },
      googleEmailUnverified: {
        label: "Google: email not verified by Google",
        text: "Google hasn’t verified this email. Use another Google account.",
      },
      googleFailed: { label: "Google: anything else", text: "Google sign-in didn’t work. Try again." },
      googleExpired: { label: "Google: took longer than 15 minutes", text: "Your Google sign-in has expired. Continue with Google again." },
      googleInUse: {
        label: "Google: account already signed up",
        text: "This Google account already has a Chukta account. Sign in instead.",
      },
      emailInUse: {
        label: "Google: email belongs to an account from before Google sign-in",
        text: "This email already has a Chukta account that signs in another way. Contact us to move it to Google.",
        multiline: true,
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
