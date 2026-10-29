import { hmacHex, sameText } from "../hmac";

/**
 * WhatsApp through Meta's Cloud API, direct (TSD: Integrations › WhatsApp):
 * Chukta's own number sends Meta-approved templates for every centre.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 */

export type TemplateMessage = {
  /** E.164, e.g. +919876543210. */
  to: string;
  templateName: string;
  /** The template's body values, in its order. */
  variables: string[];
  language?: string;
};

export interface MessagingProvider {
  sendTemplate(message: TemplateMessage): Promise<{ messageId: string }>;
}

const GRAPH = "https://graph.facebook.com/v21.0";

export function createMetaWhatsApp(options: { token: string; phoneNumberId: string; fetch?: typeof fetch }): MessagingProvider {
  const fetchFn = options.fetch ?? fetch;
  return {
    async sendTemplate(message) {
      const res = await fetchFn(`${GRAPH}/${options.phoneNumberId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: message.templateName,
            language: { code: message.language ?? "en" },
            components: [{ type: "body", parameters: message.variables.map((text) => ({ type: "text", text })) }],
          },
        }),
      });
      const payload = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string } } | null;
      if (!res.ok || !payload?.messages?.[0]) {
        throw new Error(`WhatsApp ${res.status}: ${payload?.error?.message ?? "send failed"}`);
      }
      return { messageId: payload.messages[0].id };
    },
  };
}

/** Meta signs each webhook's raw body with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export async function verifyMetaSignature(body: string, header: string, appSecret: string): Promise<boolean> {
  return sameText(`sha256=${await hmacHex(appSecret, body)}`, header);
}

/** Outside production: keeps what would have been sent (and logs it) instead of messaging anyone. */
export function createFakeWhatsApp() {
  const sent: (TemplateMessage & { messageId: string })[] = [];
  return {
    sent,
    async sendTemplate(message: TemplateMessage) {
      const messageId = `wamid.fake.${sent.length + 1}.${crypto.randomUUID().slice(0, 8)}`;
      sent.push({ ...message, messageId });
      console.info(`[whatsapp:fake] ${message.templateName} to ${message.to.slice(0, 5)}*****${message.to.slice(-2)}`);
      return { messageId };
    },
  } satisfies MessagingProvider & Record<string, unknown>;
}

export type FakeWhatsApp = ReturnType<typeof createFakeWhatsApp>;
