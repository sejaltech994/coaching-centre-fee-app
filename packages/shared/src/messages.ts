import { addDays } from "./billing";

/**
 * WhatsApp message wording (TSD: Content management › WhatsApp templates). Meta
 * delivers only pre-approved templates outside a 24-hour window, so each body
 * here matches a template submitted to Meta as `metaName`, with its variables
 * in this order. Changing wording means a new version and a new approval.
 * The web app previews these exact bodies before anything is sent.
 */

export type MessageKey = "fee_due" | "fee_overdue" | "payment_received";
export type Tone = "gentle" | "firm";
export const TONES: Tone[] = ["gentle", "firm"];

export type MessageValues = {
  parent: string;
  centre: string;
  student: string;
  amount: string;
  period: string;
  due: string;
  link: string;
};

type Template = { metaName: string; version: number; body: string; variables: (keyof MessageValues)[] };

const template = (metaName: string, version: number, body: string): Template => ({
  metaName,
  version,
  body,
  variables: [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as keyof MessageValues),
});

const THANKS = template(
  "chukta_payment_received_v1",
  1,
  "Thank you, {parent}! {centre} has received {amount} for {student} ({period}). Your receipt: {link}",
);

export const MESSAGE_TEMPLATES: Record<MessageKey, Record<Tone, Template>> = {
  fee_due: {
    gentle: template(
      "chukta_fee_due_gentle_v1",
      1,
      "Hello {parent}, a gentle reminder from {centre}: {student}'s fee of {amount} for {period} is due on {due}. You can pay here: {link}",
    ),
    firm: template(
      "chukta_fee_due_firm_v1",
      1,
      "Hello {parent}, {student}'s fee of {amount} for {period} at {centre} is due on {due}. Please pay on time: {link}",
    ),
  },
  fee_overdue: {
    gentle: template(
      "chukta_fee_overdue_gentle_v1",
      1,
      "Hello {parent}, {centre} here. {student}'s fee of {amount} for {period} was due on {due}. If it's already paid, please ignore this. Otherwise you can pay here: {link}",
    ),
    firm: template(
      "chukta_fee_overdue_firm_v1",
      1,
      "Hello {parent}, {student}'s fee of {amount} for {period} at {centre} was due on {due} and is still unpaid. Please pay today: {link}",
    ),
  },
  payment_received: { gentle: THANKS, firm: THANKS },
};

export function renderMessage(key: MessageKey, tone: Tone, values: MessageValues): string {
  return MESSAGE_TEMPLATES[key][tone].body.replace(/\{(\w+)\}/g, (_match, name: keyof MessageValues) => values[name]);
}

/** The automatic schedule (TSD): 3 days before the due date, on it, then 3 and 7 days after. */
export type ReminderKind = "pre_due" | "due" | "overdue_3" | "overdue_7";
const SCHEDULE: [ReminderKind, number][] = [
  ["pre_due", -3],
  ["due", 0],
  ["overdue_3", 3],
  ["overdue_7", 7],
];

/** Which scheduled reminder, if any, falls on `today` for a bill due on `dueDate`. */
export function reminderKindOn(dueDate: string, today: string): ReminderKind | null {
  return SCHEDULE.find(([, offset]) => addDays(dueDate, offset) === today)?.[0] ?? null;
}

/** Which message a reminder sends: before or on the due date it's "due", after it "overdue". */
export const messageFor = (dueDate: string, today: string): MessageKey => (today > dueDate ? "fee_overdue" : "fee_due");
