/** E.164 form of an Indian mobile number, e.g. "+919876543210". */
export type IndianMobile = `+91${string}`;

/** What the forms and the API say about a number normalizeIndianMobile() rejects. */
export const INVALID_PHONE_MESSAGE = "Enter a 10-digit Indian mobile number.";

const SEPARATORS = /[\s\-().]/g;
const MOBILE = /^[6-9]\d{9}$/;

/**
 * Turns the ways people type an Indian mobile number ("98765 43210",
 * "+91-98765-43210", "098765 43210") into E.164, or null if it isn't one.
 * Indian mobile numbers are 10 digits starting with 6, 7, 8 or 9.
 */
export function normalizeIndianMobile(input: string): IndianMobile | null {
  const compact = input.trim().replace(SEPARATORS, "");
  const hasPlus = compact.startsWith("+");
  const digits = hasPlus ? compact.slice(1) : compact;
  if (!/^\d+$/.test(digits)) return null;

  let national: string;
  if (hasPlus || digits.length === 12) {
    if (!digits.startsWith("91")) return null;
    national = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  return MOBILE.test(national) ? `+91${national}` : null;
}

/** For display: "+919876543210" becomes "+91 98765 43210". */
export function formatIndianMobile(phone: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}

/** For logs: "+919876543210" becomes "+91******3210". Anything else is fully hidden. */
export function maskPhone(phone: string): string {
  return /^\+91\d{10}$/.test(phone) ? `+91******${phone.slice(-4)}` : "***";
}
