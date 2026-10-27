import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerOwner, requestOtp, verifyOtp } from "@/lib/api";
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
  registerOwner: vi.fn(),
}));

const session = {
  status: "signed_in" as const,
  accessToken: "t",
  expiresIn: 900,
  isNewAccount: false,
  user: { id: "u1", phone: "+919876543210", fullName: "Asha Sharma", email: null, role: "owner" as const },
  centre: { id: "c1", name: "Sunrise Classes", city: "Pune", centreType: "coaching" as const, plan: "free" as const, timezone: "Asia/Kolkata" },
};

beforeEach(() => {
  replace.mockReset();
  search = new URLSearchParams();
  vi.mocked(requestOtp).mockResolvedValue({ expiresInSeconds: 300, resendAfterSeconds: 30 });
  vi.mocked(verifyOtp).mockResolvedValue(session);
  vi.mocked(registerOwner).mockResolvedValue({ ...session, isNewAccount: true });
});

async function verify(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Continue with mobile number" }));
  await user.type(screen.getByLabelText("Mobile number"), "9876543210");
  await user.click(screen.getByRole("button", { name: "Send code" }));
  await user.click(await screen.findByLabelText("Digit 1"));
  await user.keyboard("123456");
  await user.click(screen.getByRole("button", { name: "Verify" }));
}

describe("/login", () => {
  it("pre-fills the number sent from the landing page's form", async () => {
    search = new URLSearchParams({ phone: "+91 98765 43210" });
    render(<LoginPage />);
    expect(await screen.findByLabelText("Mobile number")).toHaveValue("+91 98765 43210");
  });

  it("takes a returning owner to the dashboard", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await verify(user);

    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("takes a new owner to Batches, their first step after setting up the centre", async () => {
    vi.mocked(verifyOtp).mockResolvedValue({ status: "signup_required", signupTicket: "t1", phone: "+919876543210", expiresIn: 900 });
    const user = userEvent.setup();
    render(<LoginPage />);

    await verify(user);
    await user.type(await screen.findByLabelText("Your name"), "Asha Sharma");
    await user.type(screen.getByLabelText("Centre name"), "Sunrise Classes");
    await user.type(screen.getByLabelText("City"), "Pune");
    await user.selectOptions(screen.getByLabelText("Type of centre"), "Coaching");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create my centre" }));

    expect(replace).toHaveBeenCalledWith("/batches");
  });
});
