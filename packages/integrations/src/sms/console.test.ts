import { describe, expect, it, vi } from "vitest";
import { createConsoleSmsProvider } from "./console";

describe("console SMS provider", () => {
  it("prints the login code with the phone number masked", async () => {
    const log = vi.fn();
    const sms = createConsoleSmsProvider(log);

    await sms.sendOtp("+919876543210", "482913");

    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]?.[0] as string;
    expect(line).toContain("482913");
    expect(line).toContain("+91******3210");
    expect(line).not.toContain("9876543210");
  });

  it("logs to the console by default", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await createConsoleSmsProvider().sendOtp("+919876543210", "111111");
    expect(info).toHaveBeenCalledOnce();
    info.mockRestore();
  });
});
