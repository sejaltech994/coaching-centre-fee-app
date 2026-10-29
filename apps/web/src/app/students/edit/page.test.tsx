import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStudent, listBatches } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import EditStudentPage from "./page";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => search }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getStudent: vi.fn(),
  listBatches: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: null });
  vi.mocked(listBatches).mockResolvedValue({ batches: [], nextCursor: null });
  vi.mocked(getStudent).mockResolvedValue({
    id: "s1",
    name: "Aarav Sharma",
    parentName: "Neha Sharma",
    parentPhone: "+919876543210",
    whatsappOptIn: false,
    status: "active",
    batches: [],
    enrolments: [],
  });
});

describe("/students/edit", () => {
  it("shows the student named in ?id=", async () => {
    search = new URLSearchParams({ id: "s1" });
    render(<EditStudentPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Aarav Sharma" })).toBeInTheDocument();
    expect(getStudent).toHaveBeenCalledWith("token", "s1");
  });

  it("says so when no student is named", async () => {
    search = new URLSearchParams();
    render(<EditStudentPage />);
    expect(await screen.findByText("We couldn’t find that student.")).toBeInTheDocument();
    expect(getStudent).not.toHaveBeenCalledWith("token", "");
  });
});
