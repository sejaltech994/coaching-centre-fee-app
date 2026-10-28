import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getIdentities, getMe, updateCentre, updateMe, type Me } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { Settings } from "./Settings";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMe: vi.fn(),
  getIdentities: vi.fn(),
  updateMe: vi.fn(),
  updateCentre: vi.fn(),
}));

const me: Me = {
  user: { id: "u1", phone: "+919876543210", phoneVerified: false, fullName: "Asha Sharma", email: "asha@example.com", role: "owner" },
  centre: { id: "c1", name: "Sunrise Classes", city: "Pune", centreType: "coaching", plan: "free", timezone: "Asia/Kolkata" },
};

beforeEach(() => {
  vi.mocked(getMe).mockReset().mockResolvedValue(me);
  vi.mocked(getIdentities).mockReset().mockResolvedValue({
    identities: [{ provider: "google", email: "asha@example.com", lastUsedAt: "2026-10-28T10:00:00.000Z" }],
  });
  vi.mocked(updateMe).mockReset().mockResolvedValue({ user: { ...me.user, fullName: "Asha S. Sharma" } });
  vi.mocked(updateCentre)
    .mockReset()
    .mockResolvedValue({ centre: { ...me.centre, name: "Sunrise Academy", city: "Patna", centreType: "tuition" } });
});

function setup() {
  const onCentreChanged = vi.fn();
  const onSignOut = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <Settings token="token" onCentreChanged={onCentreChanged} onSignOut={onSignOut} />
    </ThemeRegistry>,
  );
  return { user, onCentreChanged, onSignOut };
}

const section = (name: string) => screen.getByRole("region", { name });

describe("Settings", () => {
  it("shows the owner, their email and number, their centre and how they sign in", async () => {
    setup();

    expect(await screen.findByRole("heading", { level: 1, name: "Profile and account" })).toBeInTheDocument();
    const profile = section("Profile");
    expect(profile).toHaveTextContent("Asha Sharma");
    expect(profile).toHaveTextContent("Owner · Sunrise Classes");
    expect(profile).toHaveTextContent("asha@example.com");
    expect(profile).toHaveTextContent("Confirmed");
    expect(profile).toHaveTextContent("From your Google account");
    expect(profile).toHaveTextContent("+91 98765 43210");
    expect(profile).toHaveTextContent("Not confirmed");
    expect(section("Centre")).toHaveTextContent("Sunrise Classes · Coaching · Pune");
    expect(section("Sign-in methods")).toHaveTextContent("Connected as asha@example.com");
  });

  it("shows a confirmed mobile number as confirmed, without the reminder hint", async () => {
    vi.mocked(getMe).mockResolvedValue({ ...me, user: { ...me.user, phoneVerified: true } });
    setup();

    const profile = await screen.findByRole("region", { name: "Profile" });
    expect(within(profile).getAllByText("Confirmed")).toHaveLength(2);
    expect(profile).not.toHaveTextContent("Not confirmed");
    expect(profile).not.toHaveTextContent("Fee reminders go out on WhatsApp once you confirm it.");
  });

  it("changes the owner's name", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit profile" }));
    const name = within(section("Profile")).getByLabelText("Your name");
    expect(name).toHaveValue("Asha Sharma");

    await user.clear(name);
    await user.type(name, "Asha S. Sharma");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMe).toHaveBeenCalledWith("token", { fullName: "Asha S. Sharma" });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(section("Profile")).toHaveTextContent("Asha S. Sharma");
    expect(within(section("Profile")).queryByLabelText("Your name")).not.toBeInTheDocument();
  });

  it("explains a name that can't be saved, without sending it", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit profile" }));

    await user.clear(screen.getByLabelText("Your name"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMe).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your name")).toHaveAccessibleDescription("Enter your name.");
  });

  it("puts the name back on Cancel", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit profile" }));
    await user.type(screen.getByLabelText("Your name"), " typo");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(section("Profile")).toHaveTextContent("Asha Sharma");
    expect(section("Profile")).not.toHaveTextContent("typo");
  });

  it("changes the centre's name, city and type, and tells the page", async () => {
    const { user, onCentreChanged } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit centre" }));
    const centre = section("Centre");
    expect(within(centre).getByLabelText("Centre name")).toHaveValue("Sunrise Classes");
    expect(within(centre).getByRole("button", { name: "Coaching" })).toHaveAttribute("aria-pressed", "true");

    await user.clear(within(centre).getByLabelText("Centre name"));
    await user.type(within(centre).getByLabelText("Centre name"), "Sunrise Academy");
    await user.clear(within(centre).getByLabelText("City"));
    await user.type(within(centre).getByLabelText("City"), "Patna");
    await user.click(within(centre).getByRole("button", { name: "Tuition" }));
    await user.click(within(centre).getByRole("button", { name: "Save" }));

    expect(updateCentre).toHaveBeenCalledWith("token", { centreName: "Sunrise Academy", city: "Patna", centreType: "tuition" });
    expect(await within(section("Centre")).findByText("Sunrise Academy · Tuition · Patna")).toBeInTheDocument();
    expect(onCentreChanged).toHaveBeenCalledWith(expect.objectContaining({ name: "Sunrise Academy" }));
  });

  it("shows the server's message for a centre field", async () => {
    vi.mocked(updateCentre).mockRejectedValue(
      new ApiRequestError(400, "invalid_request", "x", { fields: { city: "Keep the city to 60 characters or fewer." } }),
    );
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit centre" }));

    await user.click(within(section("Centre")).getByRole("button", { name: "Save" }));

    expect(await within(section("Centre")).findByLabelText("City")).toHaveAccessibleDescription(
      "Keep the city to 60 characters or fewer.",
    );
  });

  it("explains when a save fails for another reason", async () => {
    vi.mocked(updateMe).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit profile" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Chukta. Check your connection and try again.");
  });

  it("says when the account can't be loaded", async () => {
    vi.mocked(getMe).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Chukta. Check your connection and try again.");
  });

  it("signs out", async () => {
    const { user, onSignOut } = setup();

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(onSignOut).toHaveBeenCalled();
  });
});
