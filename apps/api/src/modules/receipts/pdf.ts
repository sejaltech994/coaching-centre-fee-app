import { formatRupees } from "@chukta/shared";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type ReceiptData = {
  number: number;
  centre: { name: string; city: string | null };
  student: string;
  parent: string;
  batch: string;
  period: string;
  billNumber: number;
  amountPaise: number;
  method: string;
  reference: string | null;
  receivedOn: string;
};

/** The built-in PDF fonts have no ₹ glyph, so amounts read "Rs. 2,500". */
const money = (paise: number) => formatRupees(paise).replace("₹", "Rs. ");

/**
 * A receipt as a one-page A5 PDF, drawn from the stored payment each time it's
 * asked for, so nothing has to be kept in file storage and it never goes stale.
 */
export async function renderReceipt(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Receipt ${data.number} · ${data.centre.name}`);
  pdf.setAuthor(data.centre.name);
  pdf.setCreator("Chukta");
  const page = pdf.addPage([420, 595]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.18);
  const muted = rgb(0.4, 0.4, 0.47);
  let y = 540;

  page.drawText(data.centre.name, { x: 36, y, size: 18, font: bold, color: ink });
  if (data.centre.city) page.drawText(data.centre.city, { x: 36, y: (y -= 18), size: 10, font: regular, color: muted });
  page.drawText(`Receipt ${data.number}`, { x: 36, y: (y -= 40), size: 14, font: bold, color: ink });
  page.drawText(`Received on ${data.receivedOn}`, { x: 36, y: (y -= 16), size: 10, font: regular, color: muted });

  y -= 20;
  const rows: [string, string][] = [
    ["Student", data.student],
    ["Parent", data.parent],
    ["Batch", data.batch],
    ["Period", data.period],
    ["Bill", `#${data.billNumber}`],
    ["Paid by", data.method],
    ...(data.reference ? ([["Reference", data.reference]] as [string, string][]) : []),
  ];
  for (const [label, value] of rows) {
    y -= 22;
    page.drawText(label, { x: 36, y, size: 10, font: regular, color: muted });
    page.drawText(value, { x: 140, y, size: 11, font: regular, color: ink, maxWidth: 244 });
  }

  y -= 40;
  page.drawLine({ start: { x: 36, y: y + 24 }, end: { x: 384, y: y + 24 }, thickness: 0.5, color: muted });
  page.drawText("Amount received", { x: 36, y, size: 11, font: regular, color: muted });
  page.drawText(money(data.amountPaise), { x: 220, y, size: 16, font: bold, color: ink });

  page.drawText("Thank you. This receipt was issued through Chukta.", { x: 36, y: 40, size: 9, font: regular, color: muted });
  return pdf.save();
}
