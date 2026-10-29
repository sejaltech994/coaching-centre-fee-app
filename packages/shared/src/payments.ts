import type { Validation } from "./fields";

/** The centre's own way to be paid (TSD: Payments). Both empty means it takes no UPI payments. */
export type PaymentSettingsInput = { upiId: string | null; payeeName: string | null };

const UPI_ID = /^[a-z0-9._-]{2,256}@[a-z]{2,64}$/;

export function validatePaymentSettings(input: { upiId?: unknown; payeeName?: unknown }): Validation<PaymentSettingsInput> {
  const upiId = typeof input.upiId === "string" ? input.upiId.trim().toLowerCase() : "";
  const payeeName = typeof input.payeeName === "string" ? input.payeeName.trim() : "";
  if (!upiId && !payeeName) return { ok: true, value: { upiId: null, payeeName: null } };

  const fields: Record<string, string> = {};
  if (!UPI_ID.test(upiId)) fields.upiId = "Enter a UPI ID like name@bank.";
  if (!payeeName) fields.payeeName = "Enter the name parents will see when they pay.";
  else if (payeeName.length > 60) fields.payeeName = "Keep the name to 60 characters or fewer.";
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value: { upiId, payeeName } };
}

/**
 * A UPI deep link (NPCI's upi://pay): opens the parent's UPI app with the centre
 * as payee and the exact amount and note filled in. The money goes to the centre.
 */
export function upiPayLink(input: { upiId: string; payeeName: string; amountPaise: number; note: string }): string {
  const params = [
    ["pa", input.upiId],
    ["pn", input.payeeName],
    ["am", (input.amountPaise / 100).toFixed(2)],
    ["cu", "INR"],
    ["tn", input.note],
  ];
  return `upi://pay?${params.map(([key, value]) => `${key}=${encodeURIComponent(value!)}`).join("&")}`;
}
