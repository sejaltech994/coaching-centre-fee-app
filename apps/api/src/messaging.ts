import { createFakeWhatsApp, createMetaWhatsApp, type FakeWhatsApp, type MessagingProvider } from "@chukta/integrations";
import type { Config } from "./config";

/** WhatsApp as configured: Meta's Cloud API, the fake (outside production), or none (reminders are skipped). */
export function messagingFromConfig(config: Config["whatsapp"]): MessagingProvider | FakeWhatsApp | null {
  if (!config) return null;
  if (config.provider === "fake") return createFakeWhatsApp();
  return createMetaWhatsApp({ token: config.token, phoneNumberId: config.phoneNumberId });
}
