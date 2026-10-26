import { maskPhone } from "@chukta/shared";
import type { SmsProvider } from "./types";

/** Local development only: prints the code instead of sending an SMS. */
export function createConsoleSmsProvider(log: (line: string) => void = console.info): SmsProvider {
  return {
    async sendOtp(to, code) {
      log(`[sms:console] Chukta login code for ${maskPhone(to)}: ${code} (valid 5 minutes)`);
    },
  };
}
