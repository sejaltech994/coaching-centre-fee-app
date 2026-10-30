import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeWhatsApp, createMetaWhatsApp, verifyMetaSignature } from "./whatsapp";

const fetchMock = vi.fn<typeof fetch>();
const meta = createMetaWhatsApp({ token: "meta-token", phoneNumberId: "1234567890", fetch: fetchMock });
const message = { to: "+919876543210", templateName: "chukta_fee_due_gentle_v1", variables: ["Neha", "Sunrise Classes"] };

beforeEach(() => fetchMock.mockReset());

describe("createMetaWhatsApp", () => {
  it("sends an approved template from Chukta's number, with the values in order", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ messages: [{ id: "wamid.ABC" }] }));

    await expect(meta.sendTemplate(message)).resolves.toEqual({ messageId: "wamid.ABC" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v21.0/1234567890/messages");
    expect(new Headers(init!.headers).get("authorization")).toBe("Bearer meta-token");
    expect(JSON.parse(init!.body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "template",
      template: {
        name: "chukta_fee_due_gentle_v1",
        language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Neha" }, { type: "text", text: "Sunrise Classes" }] }],
      },
    });
  });

  it("throws with Meta's reason when it refuses", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "Recipient phone number not in allowed list" } }, { status: 400 }));
    await expect(meta.sendTemplate(message)).rejects.toThrow("WhatsApp 400: Recipient phone number not in allowed list");
  });
});

describe("verifyMetaSignature", () => {
  const body = '{"entry":[]}';
  const header = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

  it("accepts Meta's X-Hub-Signature-256 of the raw body, and nothing else", async () => {
    await expect(verifyMetaSignature(body, header, "app-secret")).resolves.toBe(true);
    await expect(verifyMetaSignature(body, header, "other")).resolves.toBe(false);
    await expect(verifyMetaSignature(body, header.replace("sha256=", ""), "app-secret")).resolves.toBe(false);
  });
});

describe("createFakeWhatsApp (never in production)", () => {
  it("keeps what would have been sent, with an id for each", async () => {
    const fake = createFakeWhatsApp();
    vi.spyOn(console, "info").mockImplementation(() => {});

    const sent = await fake.sendTemplate(message);

    expect(sent.messageId).toMatch(/^wamid\.fake\./);
    expect(fake.sent).toEqual([{ ...message, messageId: sent.messageId }]);
  });
});
