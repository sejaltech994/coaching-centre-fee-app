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
      loginRequired: { label: "Notice: opened a page while logged out", text: "Log in to continue." },
      loginExpired: {
        label: "Notice: logged out because the login ended",
        text: "Your login has expired. Log in to continue.",
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
      phoneHint: { label: "Mobile number: hint under the field", text: "Optional." },
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
      mobileNotAdded: { label: "Mobile number: when there is none", text: "Not added" },
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
  fees: {
    title: "Fees",
    entries: {
      title: { label: "Heading", text: "Fees" },
      lead: { label: "Text under the heading", text: "Every bill, made as each billing cycle comes round.", multiline: true },
      show: { label: "Filter: which bills", text: "Show" },
      unpaid: { label: "Filter: unpaid (pending and overdue)", text: "Unpaid" },
      all: { label: "Filter: all bills", text: "All" },
      month: { label: "Filter: month the bill is due", text: "Due in" },
      colBill: { label: "Column: bill number", text: "Bill" },
      colStudent: { label: "Column: student", text: "Student" },
      colBatch: { label: "Column: batch", text: "Batch" },
      colPeriod: { label: "Column: period billed", text: "Period" },
      colDue: { label: "Column: due date", text: "Due" },
      colAmount: { label: "Column: amount", text: "Amount" },
      colStatus: { label: "Column: status", text: "Status" },
      billNumber: { label: "A bill's number ({number})", text: "#{number}" },
      pending: { label: "Status: pending", text: "Pending" },
      overdue: { label: "Status: overdue", text: "Overdue" },
      paid: { label: "Status: paid", text: "Paid" },
      waived: { label: "Status: waived", text: "Waived" },
      lateFeeIncluded: { label: "Under the amount: late fee included", text: "Includes {amount} late fee" },
      emptyUnpaid: {
        label: "No unpaid bills",
        text: "No unpaid bills. Bills are made when a student joins a batch with a fee plan, and a week before each new cycle.",
        multiline: true,
      },
      empty: { label: "No bills match the filters", text: "No bills here." },
      showMore: { label: "Button: load more bills", text: "Show more" },
      waive: { label: "Button: waive a bill", text: "Waive" },
      waiveName: { label: "Screen-reader name of the waive button ({number})", text: "Waive bill #{number}" },
      waiveTitle: { label: "Waive dialog: heading ({number})", text: "Waive bill #{number}?" },
      waiveLead: {
        label: "Waive dialog: what happens ({student}, {amount}, {period})",
        text: "{student} won’t be asked to pay {amount} for {period}.",
        multiline: true,
      },
      reason: { label: "Waive dialog: reason field", text: "Reason" },
      reasonHint: { label: "Waive dialog: hint under the reason", text: "For example: scholarship, or a sibling discount." },
      reasonMissing: { label: "Waive dialog: no reason given", text: "Say why the fee is waived." },
      confirmWaive: { label: "Waive dialog: confirm button", text: "Waive fee" },
      cancel: { label: "Waive dialog: cancel button", text: "Cancel" },
      waivedNotice: { label: "Message after waiving", text: "Bill waived." },
      studentFees: { label: "Student page: section heading", text: "Fees" },
      recordPayment: { label: "Button: record a payment", text: "Record payment" },
      recordPaymentName: { label: "Screen-reader name of the record button ({number})", text: "Record payment for bill #{number}" },
      paymentTitle: { label: "Payment dialog: heading ({number})", text: "Record payment for bill #{number}" },
      paymentLead: {
        label: "Payment dialog: what is recorded ({student}, {amount}, {period})",
        text: "{student} paid {amount} for {period}.",
        multiline: true,
      },
      paidBy: { label: "Payment dialog: how they paid", text: "Paid by" },
      cash: { label: "Payment method: cash", text: "Cash" },
      upi: { label: "Payment method: UPI", text: "UPI" },
      bankTransfer: { label: "Payment method: bank transfer", text: "Bank transfer" },
      reference: { label: "Payment dialog: reference field", text: "Reference (optional)" },
      referenceHint: { label: "Payment dialog: hint under the reference", text: "The UPI or bank reference, if there is one." },
      receivedOn: { label: "Payment dialog: date received", text: "Received on" },
      paymentRecorded: { label: "Message after recording ({number} = receipt number)", text: "Payment recorded. Receipt #{number}." },
      receipt: { label: "Button: open a paid bill's receipt ({number})", text: "Receipt #{number}" },
      copyLink: { label: "Button: copy an unpaid bill's pay link", text: "Copy pay link" },
      copyLinkName: { label: "Screen-reader name of the copy button ({number})", text: "Copy pay link for bill #{number}" },
      linkCopied: { label: "Message after copying the pay link", text: "Pay link copied. Send it to the parent on WhatsApp." },
    },
  },
  payments: {
    title: "Settings: payments",
    entries: {
      title: { label: "Section heading", text: "Payments" },
      lead: {
        label: "Text under the heading",
        text: "Parents pay your own UPI ID from their bill. Chukta never holds the money.",
        multiline: true,
      },
      none: { label: "When no UPI ID is set", text: "Add your UPI ID so parents can pay you straight from their bill." },
      add: { label: "Button: add a UPI ID", text: "Add UPI ID" },
      change: { label: "Button: change the UPI ID", text: "Change UPI ID" },
      upiId: { label: "Field: UPI ID", text: "UPI ID" },
      upiIdHint: { label: "UPI ID: hint", text: "For example, sunriseclasses@okicici. Leave both empty to stop taking UPI." },
      payeeName: { label: "Field: name parents see", text: "Name parents see" },
      paidTo: { label: "Under the UPI ID ({name})", text: "Paid to {name}" },
      save: { label: "Button: save", text: "Save" },
      cancel: { label: "Button: cancel", text: "Cancel" },
    },
  },
  pay: {
    title: "Parent's pay page",
    entries: {
      bill: { label: "The bill ({number}, {student}, {batch}, {period})", text: "Bill #{number} · {student} · {batch} · {period}" },
      dueOn: { label: "Due date ({date})", text: "Due on {date}" },
      overdueSince: { label: "Overdue ({date})", text: "Overdue since {date}" },
      lateFee: { label: "Under the amount: late fee ({amount})", text: "Includes {amount} late fee" },
      payWithUpi: { label: "Button: pay by UPI ({amount})", text: "Pay {amount} with UPI" },
      qrAlt: { label: "Screen-reader name of the QR code ({amount})", text: "UPI QR code for {amount}" },
      scan: { label: "Under the QR code ({upiId}, {name})", text: "Or scan with any UPI app. Paid to {name} ({upiId})." },
      noUpi: { label: "When the centre takes no UPI ({centre})", text: "Ask {centre} how to pay." },
      paid: { label: "When the bill is paid", text: "Paid. Thank you!" },
      waived: { label: "When the bill is waived", text: "Nothing to pay: this fee was waived." },
      receipt: { label: "Link: download the receipt", text: "Download receipt" },
      invalid: { label: "When the link is wrong or old", text: "This link isn't valid. Ask the centre for a new one." },
      footer: { label: "Bottom of the page", text: "Payment goes straight to the centre. Chukta never holds the money." },
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
      invoiceClosed: { label: "Bill already paid or waived", text: "This bill is already paid or waived." },
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
