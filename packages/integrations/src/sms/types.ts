import type { IndianMobile } from "@chukta/shared";

/**
 * Sends SMS. The production adapter (MSG91 or similar) needs DLT-registered
 * templates, so the OTP text is fixed by the provider, not by callers.
 */
export interface SmsProvider {
  sendOtp(to: IndianMobile, code: string): Promise<void>;
}
