import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, importStudents, previewImport, type ImportResult } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { ImportDialog } from "./ImportDialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  previewImport: vi.fn(),
  importStudents: vi.fn(),
}));

const ok = { line: 2, name: "Diya Rao", parentName: "Ravi Rao", parentPhone: "+919123456789", whatsappOptIn: true, batches: ["Class 10 Maths"], errors: {} };
const bad = { line: 3, name: "Kabir", parentName: "", parentPhone: "12345", whatsappOptIn: false, batches: [], errors: { parentPhone: "Enter a 10-digit Indian mobile number." } };
const CSV = "Student name,Parent name,Parent mobile,WhatsApp consent,Batches\nDiya Rao,Ravi Rao,9123456789,yes,Class 10 Maths\n";

beforeEach(() => {
  vi.mocked(previewImport).mockReset();
  vi.mocked(importStudents).mockReset();
});

function setup() {
  const onImported = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <ImportDialog token="token" onClose={vi.fn()} onImported={onImported} />
    </ThemeRegistry>,
  );
  return { user, onImported };
}

const choose = (text: string) =>
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [new File([text], "students.csv", { type: "text/csv" })] } });

describe("ImportDialog", () => {
  it("offers the template to fill in", () => {
    setup();
    const link = screen.getByRole("link", { name: "Download the template" });
    expect(link).toHaveAttribute("download", "chukta-students.csv");
    expect(decodeURIComponent(link.getAttribute("href")!)).toContain("Student name,Parent name,Parent mobile,WhatsApp consent,Batches");
  });

  it("previews the file, then imports it when every row is right", async () => {
    const preview: ImportResult = { rows: [ok], valid: 1, invalid: 0, imported: 0 };
    vi.mocked(previewImport).mockResolvedValue(preview);
    vi.mocked(importStudents).mockResolvedValue({ ...preview, imported: 1 });
    const { user, onImported } = setup();

    choose(CSV);

    expect(await screen.findByText("1 ready to import.")).toBeInTheDocument();
    expect(previewImport).toHaveBeenCalledWith("token", CSV);
    await user.click(screen.getByRole("button", { name: "Import 1 student" }));
    expect(importStudents).toHaveBeenCalledWith("token", CSV);
    expect(onImported).toHaveBeenCalledWith(1);
  });

  it("shows what to fix on each row, and imports nothing until it's fixed", async () => {
    vi.mocked(previewImport).mockResolvedValue({ rows: [ok, bad], valid: 1, invalid: 1, imported: 0 });
    setup();

    choose(CSV);

    expect(await screen.findByText("1 ready, 1 to fix. Fix the file and choose it again.")).toBeInTheDocument();
    const row = within(screen.getByRole("table")).getAllByRole("row")[2]!;
    expect(row).toHaveTextContent("3");
    expect(row).toHaveTextContent("Enter a 10-digit Indian mobile number.");
    expect(screen.queryByRole("button", { name: /^Import/ })).not.toBeInTheDocument();
  });

  it("explains a file that can't be read", async () => {
    vi.mocked(previewImport).mockRejectedValue(
      new ApiRequestError(400, "invalid_request", "x", { fields: { csv: "Start with the template’s headings." } }),
    );
    setup();
    choose("Name\n");
    expect(await screen.findByRole("alert")).toHaveTextContent("Start with the template’s headings.");
  });
});
