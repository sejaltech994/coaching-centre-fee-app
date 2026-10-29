import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secrets";

const KEY = "test-secret-that-is-at-least-32-characters-long";

describe("sealSecret / openSecret", () => {
  it("encrypts a secret so the stored text never contains it, and reads it back", async () => {
    const sealed = await sealSecret(KEY, "razorpay-key-secret");

    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain("razorpay-key-secret");
    await expect(openSecret(KEY, sealed)).resolves.toBe("razorpay-key-secret");
  });

  it("gives a different ciphertext each time", async () => {
    expect(await sealSecret(KEY, "same")).not.toBe(await sealSecret(KEY, "same"));
  });

  it("can't be read with another environment's key, or after tampering", async () => {
    const sealed = await sealSecret(KEY, "razorpay-key-secret");
    await expect(openSecret(`${KEY}-other`, sealed)).rejects.toThrow();
    await expect(openSecret(KEY, `${sealed.slice(0, -2)}AA`)).rejects.toThrow();
    await expect(openSecret(KEY, "plain-text")).rejects.toThrow("not a sealed secret");
  });
});
