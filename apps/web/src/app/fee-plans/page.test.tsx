import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listFeePlans } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import FeePlansPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listFeePlans: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: null });
  vi.mocked(listFeePlans).mockResolvedValue({ feePlans: [] });
});

describe("/fee-plans", () => {
  it("sits under Batches in the app shell, with a way back", async () => {
    render(<FeePlansPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Fee plans" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Batches" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Batches", current: false })).toHaveAttribute("href", "/batches");
  });
});
