import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getGooglePending, registerOwner } from "@/lib/api";
import { getAccessToken } from "@/lib/session";
import SignUpPage from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getGooglePending: vi.fn(),
  registerOwner: vi.fn(),
}));

beforeEach(() => {
  replace.mockReset();
  vi.mocked(getGooglePending).mockResolvedValue({ email: "asha@example.com", name: "Asha Sharma" });
  vi.mocked(registerOwner).mockResolvedValue({
    status: "signed_in",
    accessToken: "access-token",
    expiresIn: 900,
    isNewAccount: true,
    user: { id: "u1", phone: "98765 43210", fullName: "Asha Sharma", email: "asha@example.com", role: "owner" },
    centre: { id: "c1", name: "Sunrise Classes", city: "Pune", centreType: "coaching", plan: "free", timezone: "Asia/Kolkata" },
  });
});

describe("/signup", () => {
  it("signs the new owner in and takes them to Batches, their first step", async () => {
    const user = userEvent.setup();
    render(<SignUpPage />);
    expect(screen.getByRole("complementary")).toHaveTextContent("Almost there.");

    await user.type(await screen.findByLabelText("Mobile number"), "98765 43210");
    await user.type(screen.getByLabelText("Centre name"), "Sunrise Classes");
    await user.type(screen.getByLabelText("City"), "Pune");
    await user.click(screen.getByRole("button", { name: "Coaching" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(getAccessToken()).toBe("access-token");
    expect(replace).toHaveBeenCalledWith("/batches");
  });

  it("sends the owner back to sign in when their Google sign-in has expired", async () => {
    vi.mocked(getGooglePending).mockRejectedValue(new ApiRequestError(404, "google_pending_missing", "x"));
    render(<SignUpPage />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login/?google_error=expired"));
  });
});
