import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  deleteAccount,
  downloadMyData,
  getIdentities,
  getMe,
  getPaymentSettings,
  getSubscription,
  listSessions,
  signOutOtherSessions,
  signOutSession,
  updateCentre,
  keepAccount,
  updateMe,
  type DeviceSession,
  type Me,
} from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { Settings } from "./Settings";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMe: vi.fn(),
  getIdentities: vi.fn(),
  updateMe: vi.fn(),
  updateCentre: vi.fn(),
  listSessions: vi.fn(),
  getPaymentSettings: vi.fn(),
  getSubscription: vi.fn(),
  downloadMyData: vi.fn(),
  deleteAccount: vi.fn(),
  keepAccount: vi.fn(),
  signOutSession: vi.fn(),
  signOutOtherSessions: vi.fn(),
}));

const thisPhone: DeviceSession = {
  id: "s-phone",
  device: "Chrome on Android",
  city: null,
  signedInAt: "2026-10-28T04:30:00.000Z",
  lastActiveAt: "2026-10-28T04:30:00.000Z",
  current: true,
};
const laptop: DeviceSession = {
  id: "s-laptop",
  device: "Chrome on Windows",
  city: "Pune",
  signedInAt: "2026-10-20T04:30:00.000Z",
  lastActiveAt: "2026-10-25T10:00:00.000Z",
  current: false,
};
const tablet: DeviceSession = { ...laptop, id: "s-tablet", device: "Safari on iPad" };

const me: Me = {
  user: { id: "u1", phone: "98765 43210", fullName: "Asha Sharma", email: "asha@example.com", role: "owner" },
  centre: { id: "c1", name: "Sunrise Classes", city: "Pune", centreType: "coaching", plan: "free", timezone: "Asia/Kolkata" },
};

beforeEach(() => {
  vi.mocked(getMe).mockReset().mockResolvedValue(me);
  vi.mocked(getIdentities).mockReset().mockResolvedValue({
    identities: [{ provider: "google", email: "asha@example.com", lastUsedAt: "2026-10-28T10:00:00.000Z" }],
  });
  vi.mocked(updateMe).mockReset().mockResolvedValue({ user: { ...me.user, fullName: "Asha S. Sharma" } });
  vi.mocked(getPaymentSettings).mockReset().mockResolvedValue({ paymentSettings: { upiId: "sunrise@okicici", payeeName: "Sunrise Classes", razorpay: null } });
  vi.mocked(getSubscription)
    .mockReset()
    .mockResolvedValue({ plan: "free", status: null, renewsAt: null, proPricePaise: 49900, canUpgrade: true, students: { active: 3, max: 25 } });
  vi.mocked(listSessions).mockReset().mockResolvedValue({ sessions: [thisPhone, laptop, tablet] });
  vi.mocked(signOutSession).mockReset().mockResolvedValue(undefined);
  vi.mocked(signOutOtherSessions).mockReset().mockResolvedValue({ signedOut: 2 });
  vi.mocked(updateCentre)
    .mockReset()
    .mockResolvedValue({ centre: { ...me.centre, name: "Sunrise Academy", city: "Patna", centreType: "tuition" } });
});

function setup() {
  const onCentreChanged = vi.fn();
  const onSignOut = vi.fn();
  const onDeleted = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <Settings token="token" onCentreChanged={onCentreChanged} onSignOut={onSignOut} onDeleted={onDeleted} />
    </ThemeRegistry>,
  );
  return { user, onCentreChanged, onSignOut, onDeleted };
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
    expect(profile).toHaveTextContent("98765 43210");
    expect(profile).not.toHaveTextContent("Not confirmed");
    expect(section("Centre")).toHaveTextContent("Sunrise Classes · Coaching · Pune");
    expect(section("Sign-in methods")).toHaveTextContent("Connected as asha@example.com");
    expect(await within(section("Payments")).findByText("sunrise@okicici")).toBeInTheDocument();
    expect(await within(section("Plan")).findByText("3 of 25 students")).toBeInTheDocument();
  });

  it("never asks for the mobile number to be confirmed", async () => {
    setup();
    await screen.findByRole("region", { name: "Profile" });
    expect(screen.queryByRole("button", { name: /Confirm/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Confirm your mobile number/)).not.toBeInTheDocument();
  });

  it("says when there's no mobile number", async () => {
    vi.mocked(getMe).mockResolvedValue({ ...me, user: { ...me.user, phone: null } });
    setup();
    expect(await screen.findByRole("region", { name: "Profile" })).toHaveTextContent("Not added");
  });

  it("changes the mobile number with the name, as typed, with no code", async () => {
    vi.mocked(updateMe).mockResolvedValue({ user: { ...me.user, phone: "+44 7700 900123" } });
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit profile" }));
    const phone = within(section("Profile")).getByLabelText("Mobile number");
    expect(phone).toHaveValue("98765 43210");

    await user.clear(phone);
    await user.type(phone, "+44 7700 900123");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMe).toHaveBeenCalledWith("token", { fullName: "Asha Sharma", phone: "+44 7700 900123" });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(section("Profile")).toHaveTextContent("+44 7700 900123");
  });

  it("changes the owner's name", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit profile" }));
    const name = within(section("Profile")).getByLabelText("Your name");
    expect(name).toHaveValue("Asha Sharma");

    await user.clear(name);
    await user.type(name, "Asha S. Sharma");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMe).toHaveBeenCalledWith("token", { fullName: "Asha S. Sharma", phone: "98765 43210" });
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

  it("lists where the owner is signed in, marking this device", async () => {
    setup();

    const devices = await screen.findByRole("region", { name: "Devices" });
    const rows = within(devices).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^Chrome on Android.*This device/),
      expect.stringMatching(/^Chrome on Windows · Pune.*Last active 25 Oct 2026/),
      expect.stringMatching(/^Safari on iPad.*Last active 25 Oct 2026/),
    ]);
    expect(within(rows[0]!).queryByRole("button")).not.toBeInTheDocument();
  });

  it("signs one other device out", async () => {
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Sign out Chrome on Windows" }));

    expect(signOutSession).toHaveBeenCalledWith("token", "s-laptop");
    expect(await screen.findByText("Chrome on Windows signed out.")).toBeInTheDocument();
    expect(section("Devices")).not.toHaveTextContent("Chrome on Windows");
  });

  it("signs out of every other device at once", async () => {
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Sign out of all other devices" }));

    expect(signOutOtherSessions).toHaveBeenCalledWith("token");
    expect(await screen.findByText("Signed out of your other devices.")).toBeInTheDocument();
    expect(within(section("Devices")).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Sign out of all other devices" })).not.toBeInTheDocument();
  });

  it("offers no device sign-outs when this is the only device", async () => {
    vi.mocked(listSessions).mockResolvedValue({ sessions: [thisPhone] });
    setup();

    const devices = await screen.findByRole("region", { name: "Devices" });
    expect(within(devices).queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains when a device can't be signed out", async () => {
    vi.mocked(signOutSession).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Sign out Chrome on Windows" }));

    expect(await within(section("Devices")).findByRole("alert")).toHaveTextContent("Can't reach Chukta.");
    expect(section("Devices")).toHaveTextContent("Chrome on Windows");
  });

  it("signs out", async () => {
    const { user, onSignOut } = setup();

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(onSignOut).toHaveBeenCalled();
  });

  it("downloads the centre's data", async () => {
    vi.mocked(downloadMyData).mockResolvedValue(new Blob(["{}"], { type: "application/json" }));
    const createObjectURL = vi.fn(() => "blob:data");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Download my data" }));

    expect(downloadMyData).toHaveBeenCalledWith("token");
    expect(click).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("deletes the account once the centre's name is typed", async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ deletesAt: "2026-12-02T04:30:00.000Z" });
    const { user, onDeleted } = setup();
    await user.click(await screen.findByRole("button", { name: "Delete account" }));
    const dialog = screen.getByRole("dialog", { name: "Delete your account?" });

    const confirm = within(dialog).getByRole("button", { name: "Delete account" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Type Sunrise Classes to confirm"), "Sunrise Classes");
    await user.click(confirm);

    expect(deleteAccount).toHaveBeenCalledWith("token", "Sunrise Classes");
    expect(onDeleted).toHaveBeenCalled();
  });

  it("offers to keep an account that's due to be deleted", async () => {
    vi.mocked(getMe).mockResolvedValue({ ...me, centre: { ...me.centre, deletesAt: "2026-12-02T04:30:00.000Z" } });
    vi.mocked(keepAccount).mockResolvedValue({ deletesAt: null });
    const { user } = setup();

    expect(await screen.findByText("This account will be deleted on 2 Dec 2026.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep my account" }));

    expect(keepAccount).toHaveBeenCalledWith("token");
    expect(await screen.findByText("Your account is kept.")).toBeInTheDocument();
  });
});
