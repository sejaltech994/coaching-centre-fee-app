import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBatches, listStudents } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import StudentsPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listStudents: vi.fn(),
  listBatches: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: { id: "c1", name: "Sunrise Classes", plan: "free", timezone: "Asia/Kolkata" } });
  vi.mocked(listStudents).mockResolvedValue({ students: [], nextCursor: null });
  vi.mocked(listBatches).mockResolvedValue({ batches: [], nextCursor: null });
});

describe("/students", () => {
  it("sits in the app shell with Students current, and offers to add a student", async () => {
    render(<StudentsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Students" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Students" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Add student" })).toHaveAttribute("href", "/students/new");
  });
});
