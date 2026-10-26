import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestOtp, verifyOtp } from "@/lib/api";
import LoginPage from "./page";

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

beforeEach(() => {
  replace.mockReset();
  search = new URLSearchParams();
  vi.mocked(requestOtp).mockResolvedValue({ expiresInSeconds: 300, resendAfterSeconds: 30 });
  vi.mocked(verifyOtp).mockResolvedValue({
    accessToken: "t",
    expiresIn: 900,
    isNewAccount: false,
    user: { id: "u1", phone: "+919876543210", name: null, role: "owner" },
    centre: { id: "c1", name: "Sunrise Classes", plan: "free" },
  });
});

describe("/login", () => {
  it("pre-fills the number sent from the landing page's form", async () => {
    search = new URLSearchParams({ phone: "+91 98765 43210" });
    render(<LoginPage />);
    expect(await screen.findByLabelText("Mobile number")).toHaveValue("+91 98765 43210");
  });

  it("goes to the dashboard after logging in", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(await screen.findByLabelText("Mobile number"), "9876543210");
    await user.click(screen.getByRole("button", { name: "Get OTP" }));
    await user.type(await screen.findByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and log in" }));

    expect(replace).toHaveBeenCalledWith("/dashboard");
  });
});
