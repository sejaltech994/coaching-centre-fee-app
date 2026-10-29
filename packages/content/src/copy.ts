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
      banner: {
        label: "Banner while the mobile number isn't confirmed (Settings and dashboard)",
        text: "Confirm your mobile number to start sending fee reminders on WhatsApp.",
      },
      bannerAction: { label: "Banner: button", text: "Confirm number" },
      confirmNumber: { label: "Mobile number: confirm button", text: "Confirm" },
      confirmNumberName: { label: "Screen-reader name of the confirm button", text: "Confirm mobile number" },
      changeNumber: { label: "Mobile number: change button", text: "Change" },
      changeNumberName: { label: "Screen-reader name of the change button", text: "Change mobile number" },
      phoneLead: { label: "Confirm number: text above the field", text: "We’ll text a 6-digit code to this number." },
      sendCode: { label: "Confirm number: send button", text: "Send code" },
      codeSentTo: { label: "Confirm number: where the code went", text: "Sent by SMS to {phone}." },
      codeLabel: { label: "Confirm number: label above the boxes", text: "6-digit code" },
      digitLabel: { label: "Confirm number: screen-reader name of each box", text: "Digit {n}" },
      codeIncomplete: { label: "Confirm number: fewer than 6 digits", text: "Enter the 6-digit code." },
      confirmCode: { label: "Confirm number: confirm button", text: "Confirm" },
      resendIn: { label: "Confirm number: resend countdown", text: "Resend code in {time}" },
      resend: { label: "Confirm number: resend button", text: "Resend code" },
      differentNumber: { label: "Confirm number: back to the number", text: "Use a different number" },
      phoneConfirmed: { label: "Message after confirming", text: "Mobile number confirmed." },
      centre: { label: "Section: centre", text: "Centre" },
      editCentre: { label: "Screen-reader name of the centre's Edit button", text: "Edit centre" },
      signInMethods: { label: "Section: sign-in methods", text: "Sign-in methods" },
      google: { label: "Sign-in method: Google", text: "Google" },
      googleConnected: { label: "Google: connected account", text: "Connected as {email}" },
      devices: { label: "Section: devices", text: "Devices" },
      thisDevice: { label: "Devices: the one in use", text: "This device" },
      lastActive: { label: "Devices: when another was last used", text: "Last active {date}" },
      signOutDevice: { label: "Devices: sign one out", text: "Sign out" },
      signOutDeviceName: { label: "Screen-reader name of a device's sign-out button", text: "Sign out {device}" },
      signedOutDevice: { label: "Message after signing a device out", text: "{device} signed out." },
      signOutOthers: { label: "Devices: sign all others out", text: "Sign out of all other devices" },
      signedOutOthers: { label: "Message after signing the others out", text: "Signed out of your other devices." },
      edit: { label: "Button: edit", text: "Edit" },
      save: { label: "Button: save", text: "Save" },
      cancel: { label: "Button: cancel", text: "Cancel" },
      saved: { label: "Message after saving", text: "Saved." },
      signOut: { label: "Button: sign out", text: "Sign out" },
    },
  },
  students: {
    title: "Students",
    entries: {
      title: { label: "Heading", text: "Students" },
      lead: { label: "Text under the heading", text: "Everyone at your centre, and the parent who pays." },
      add: { label: "Button: add a student", text: "Add student" },
      search: { label: "Search box", text: "Search students or parents" },
      statusActive: { label: "Filter: active", text: "Active" },
      statusLeft: { label: "Filter: left", text: "Left" },
      statusAll: { label: "Filter: all", text: "All" },
      statusFilter: { label: "Screen-reader name of the status filter", text: "Status" },
      batchFilter: { label: "Filter: batch", text: "Batch" },
      allBatches: { label: "Batch filter: no batch chosen", text: "All batches" },
      colStudent: { label: "Column: student", text: "Student" },
      colParent: { label: "Column: parent", text: "Parent" },
      colPhone: { label: "Column: parent's mobile", text: "Parent’s mobile" },
      colBatches: { label: "Column: batches", text: "Batches" },
      noBatch: { label: "A student in no batch", text: "No batch" },
      empty: {
        label: "No students at all",
        text: "No students yet. Add your first student to start sending fee reminders.",
      },
      noMatch: { label: "No students match the filters", text: "No students match." },
      more: { label: "Button: load more", text: "Show more" },
      newTitle: { label: "Add student: heading", text: "Add a student" },
      name: { label: "Field: student's name", text: "Student’s name" },
      parentName: { label: "Field: parent's name", text: "Parent’s name" },
      parentPhone: { label: "Field: parent's mobile number", text: "Parent’s mobile number" },
      parentPhoneHint: { label: "Parent's mobile: hint", text: "Fee reminders and receipts go to this number." },
      consent: {
        label: "Checkbox: the parent's WhatsApp consent",
        text: "The parent agreed to receive fee reminders on WhatsApp.",
      },
      batches: { label: "Add student: batches", text: "Batches" },
      batchesHint: { label: "Add student: batches hint", text: "You can change these later." },
      noBatches: { label: "Add student: there are no batches", text: "Create a batch first to add students to it." },
      save: { label: "Button: save", text: "Save" },
      cancel: { label: "Button: cancel", text: "Cancel" },
      saved: { label: "Message after saving", text: "Saved." },
      since: { label: "A batch: since when", text: "Since {date}" },
      remove: { label: "A batch: remove the student", text: "Remove" },
      removeName: { label: "Screen-reader name of a batch's remove button", text: "Remove from {batch}" },
      removed: { label: "Message after removing from a batch", text: "Removed from {batch}." },
      addToBatch: { label: "Add to a batch: field", text: "Add to batch" },
      addButton: { label: "Add to a batch: button", text: "Add" },
      added: { label: "Message after adding to a batch", text: "Added to {batch}." },
      inNoBatch: { label: "A student in no batch (their page)", text: "Not in any batch yet." },
      leftLabel: { label: "Status of a student who left", text: "Left the centre" },
      markLeft: { label: "Button: mark as left", text: "Mark as left" },
      markLeftTitle: { label: "Mark as left: question", text: "Mark {name} as left?" },
      markLeftBody: {
        label: "Mark as left: what happens",
        text: "They’ll be taken out of their batches today. Their fee records stay.",
        multiline: true,
      },
      markActive: { label: "Button: mark as active again", text: "Mark as active again" },
      notFound: { label: "No such student", text: "We couldn’t find that student." },
      back: { label: "Link back to the list", text: "Back to students" },
    },
  },
  feePlans: {
    title: "Fee plans",
    entries: {
      title: { label: "Heading", text: "Fee plans" },
      lead: {
        label: "Text under the heading",
        text: "What each batch’s students pay, and when. Pick a plan for each batch.",
        multiline: true,
      },
      back: { label: "Link back to batches", text: "Batches" },
      add: { label: "Button: new plan", text: "New fee plan" },
      empty: { label: "No plans at all", text: "No fee plans yet. Add one, then pick it for a batch." },
      archived: { label: "Section: archived plans", text: "Archived" },
      lateFee: { label: "A plan's late fee", text: "Late fee {amount} after {days} days" },
      noLateFee: { label: "A plan with no late fee", text: "No late fee" },
      edit: { label: "Button: edit", text: "Edit" },
      editName: { label: "Screen-reader name of a plan's edit button", text: "Edit {name}" },
      archive: { label: "Button: archive", text: "Archive" },
      archiveName: { label: "Screen-reader name of a plan's archive button", text: "Archive {name}" },
      restore: { label: "Button: restore", text: "Restore" },
      restoreName: { label: "Screen-reader name of a plan's restore button", text: "Restore {name}" },
      newTitle: { label: "Form heading: new plan", text: "New fee plan" },
      editTitle: { label: "Form heading: editing a plan", text: "Edit fee plan" },
      name: { label: "Field: name", text: "Name" },
      nameHint: { label: "Name: hint", text: "For you, e.g. “Class 10 monthly”." },
      amount: { label: "Field: amount", text: "Amount" },
      cycle: { label: "Field: how often", text: "How often" },
      monthly: { label: "How often: monthly", text: "Monthly" },
      quarterly: { label: "How often: quarterly", text: "Quarterly" },
      oneTime: { label: "How often: one-time", text: "One-time" },
      dueDay: { label: "Field: due day", text: "Due on day" },
      dueDayMonthly: { label: "Due day: hint for monthly", text: "Of every month. Up to the 28th, so every month has it." },
      dueDayQuarterly: { label: "Due day: hint for quarterly", text: "Of January, April, July and October." },
      chargeLateFee: { label: "Checkbox: late fee", text: "Charge a late fee" },
      lateFeeAmount: { label: "Field: late fee", text: "Late fee" },
      lateFeeDays: { label: "Field: days before the late fee", text: "Days after the due date" },
      save: { label: "Button: save", text: "Save" },
      cancel: { label: "Button: cancel", text: "Cancel" },
      saved: { label: "Message after saving", text: "Fee plan saved." },
      picker: { label: "Batch form: fee plan field", text: "Fee plan" },
      pickerNone: { label: "Batch form: no plan chosen", text: "No fee plan yet" },
      pickerHint: {
        label: "Batch form: fee plan hint",
        text: "Students added here are billed on this plan. You can give a discount per student.",
      },
      manage: { label: "Batch form: link to fee plans", text: "Manage fee plans" },
      noPlan: { label: "A student's batch with no plan", text: "No fee plan" },
      noDiscount: { label: "A student with no discount", text: "No discount" },
      discountOff: { label: "A student's discount", text: "{amount} off" },
      discount: { label: "Field: discount", text: "Discount" },
      discountName: { label: "Screen-reader name of a batch's discount button", text: "Discount on {batch}" },
      discountButton: { label: "Button: discount", text: "Discount" },
      saveDiscount: { label: "Button: save the discount", text: "Save discount" },
      discountTooBig: { label: "Discount more than the fee", text: "The discount can’t be more than the fee." },
      discountInvalid: { label: "Discount not an amount", text: "Enter a discount of ₹0 or more." },
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
      invalidOtp: { label: "Wrong code, several tries left", text: "That code didn’t match. {tries} tries left." },
      invalidOtpLastTry: { label: "Wrong code, one try left", text: "That code didn’t match. 1 try left." },
      tooManyAttempts: { label: "Code locked after 5 wrong tries", text: "Too many wrong codes. Request a new one." },
      otpExpired: { label: "Code expired or already used", text: "This code has expired. Request a new one." },
      resendTooSoon: { label: "New code asked for too soon", text: "Wait {seconds} seconds before asking for a new code." },
      rateLimited: { label: "Hourly code limit reached", text: "Too many codes requested. Try again later." },
      smsUnavailable: { label: "SMS could not be sent", text: "We couldn't send the SMS. Try again in a moment." },
      phoneTaken: {
        label: "Number confirmed by another account",
        text: "Another Chukta account has confirmed this number. Use a different one.",
      },
      alreadyEnrolled: { label: "Student already in that batch", text: "This student is already in that batch." },
      studentLeft: {
        label: "Adding a student who left to a batch",
        text: "This student has left. Mark them as active to add them to a batch.",
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
