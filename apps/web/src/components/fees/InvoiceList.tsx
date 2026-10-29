"use client";

import { formatRupees, periodLabel, type InvoiceStatus } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useEffect, useId, useState } from "react";
import { listInvoices, receiptPdf, type Invoice, type InvoiceFilters } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { RemindDialog } from "./RemindDialog";
import { WaiveDialog } from "./WaiveDialog";

type Status = InvoiceFilters["status"];

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "5 Nov 2026" from "2026-11-05". */
export const showDate = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

const STATUS_COLOR: Record<InvoiceStatus, "pending" | "overdue" | "paid" | "default"> = {
  pending: "pending",
  overdue: "overdue",
  paid: "paid",
  waived: "default",
};

export function StatusChip({ status }: { status: InvoiceStatus }) {
  return <Chip label={copy.fees[status]} color={STATUS_COLOR[status]} />;
}

/**
 * The centre's bills, newest due first: filtered by status and due month on
 * the Fees page, or one student's bills (all statuses, no filters) on their page.
 */
export function InvoiceList({ token, studentId }: { token: string; studentId?: string }) {
  const t = copy.fees;
  const filtersId = useId();
  const [status, setStatus] = useState<Status>(studentId ? "all" : "unpaid");
  const [month, setMonth] = useState("");
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [waiving, setWaiving] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [reminding, setReminding] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filters: InvoiceFilters = { status, ...(month && { month }), ...(studentId && { studentId }) };

  useEffect(() => {
    let cancelled = false;
    listInvoices(token, { status, ...(month && { month }), ...(studentId && { studentId }) }).then(
      (page) => {
        if (cancelled) return;
        setInvoices(page.invoices);
        setCursor(page.nextCursor);
        setError(null);
      },
      (err: unknown) => !cancelled && setError(errorMessage(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [token, status, month, studentId]);

  async function showMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await listInvoices(token, { ...filters, cursor });
      setInvoices((current) => [...(current ?? []), ...page.invoices]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function openReceipt(receiptId: string) {
    try {
      const url = URL.createObjectURL(await receiptPdf(token, receiptId));
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setNotice(errorMessage(err));
    }
  }

  async function copyPayLink(invoice: Invoice) {
    try {
      await navigator.clipboard.writeText(invoice.payLink);
      setNotice(t.linkCopied);
    } catch {
      // Clipboard blocked (e.g. an insecure page): show the link to copy by hand.
      setNotice(invoice.payLink);
    }
  }

  const unpaidShown = (invoices ?? []).filter((invoice) => invoice.status === "pending" || invoice.status === "overdue");

  const replace = (changed: Invoice) =>
    setInvoices((current) => current?.map((invoice) => (invoice.id === changed.id ? changed : invoice)) ?? null);

  return (
    <Stack spacing={2}>
      {!studentId && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
          <Typography id={filtersId} variant="body2" sx={{ fontWeight: 600 }}>
            {t.show}
          </Typography>
          <ToggleButtonGroup
            exclusive
            aria-labelledby={filtersId}
            value={status}
            onChange={(_event, value: Status | null) => value && setStatus(value)}
            sx={{ flexWrap: "wrap" }}
          >
            {(["unpaid", "overdue", "paid", "waived", "all"] as const).map((value) => (
              <ToggleButton key={value} value={value}>
                {t[value]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField
            type="month"
            label={t.month}
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            fullWidth={false}
            sx={{ width: 190 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!studentId && unpaidShown.length > 1 && (
        <Box>
          <Button variant="outlined" onClick={() => setReminding(unpaidShown.map((invoice) => invoice.id))}>
            {fill(t.remindAll, { count: unpaidShown.length })}
          </Button>
        </Box>
      )}

      {invoices && invoices.length === 0 && (
        <Typography color="text.secondary">{status === "unpaid" && !month ? t.emptyUnpaid : t.empty}</Typography>
      )}

      {invoices && invoices.length > 0 && (
        <Card sx={{ overflowX: "auto" }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t.colBill}</TableCell>
                {!studentId && <TableCell>{t.colStudent}</TableCell>}
                <TableCell>{t.colBatch}</TableCell>
                <TableCell>{t.colPeriod}</TableCell>
                <TableCell>{t.colDue}</TableCell>
                <TableCell align="right">{t.colAmount}</TableCell>
                <TableCell>{t.colStatus}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map((invoice) => {
                const number = fill(t.billNumber, { number: invoice.number });
                const unpaid = invoice.status === "pending" || invoice.status === "overdue";
                return (
                  <TableRow key={invoice.id}>
                    <TableCell>{number}</TableCell>
                    {!studentId && (
                      <TableCell>
                        <Link component={NextLink} href={`/students/edit?id=${invoice.student.id}`}>
                          {invoice.student.name}
                        </Link>
                      </TableCell>
                    )}
                    <TableCell>{invoice.batch.name}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{periodLabel(invoice.cycle, invoice.periodStart)}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{showDate(invoice.dueDate)}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatRupees(invoice.totalPaise)}</Box>
                      {invoice.lateFeePaise > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {fill(t.lateFeeIncluded, { amount: formatRupees(invoice.lateFeePaise) })}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={invoice.status} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                        {unpaid && (
                          <>
                            <Button
                              aria-label={fill(t.recordPaymentName, { number: invoice.number })}
                              onClick={() => setPaying(invoice)}
                            >
                              {t.recordPayment}
                            </Button>
                            <Button aria-label={fill(t.remindName, { number: invoice.number })} onClick={() => setReminding([invoice.id])}>
                              {t.remind}
                            </Button>
                            <Button aria-label={fill(t.copyLinkName, { number: invoice.number })} onClick={() => copyPayLink(invoice)}>
                              {t.copyLink}
                            </Button>
                            <Button aria-label={fill(t.waiveName, { number: invoice.number })} onClick={() => setWaiving(invoice)}>
                              {t.waive}
                            </Button>
                          </>
                        )}
                        {invoice.payment?.receipt && (
                          <Button onClick={() => openReceipt(invoice.payment!.receipt!.id)}>
                            {fill(t.receipt, { number: invoice.payment.receipt.number })}
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {cursor && (
        <Box>
          <Button onClick={showMore} loading={loadingMore}>
            {t.showMore}
          </Button>
        </Box>
      )}

      {waiving && (
        <WaiveDialog
          token={token}
          invoice={waiving}
          onClose={() => setWaiving(null)}
          onWaived={(changed) => {
            replace(changed);
            setWaiving(null);
            setNotice(t.waivedNotice);
          }}
        />
      )}

      {paying && (
        <RecordPaymentDialog
          token={token}
          invoice={paying}
          onClose={() => setPaying(null)}
          onRecorded={(changed) => {
            replace(changed);
            setPaying(null);
            setNotice(fill(t.paymentRecorded, { number: changed.payment?.receipt?.number ?? "" }));
          }}
        />
      )}

      {reminding && (
        <RemindDialog
          token={token}
          invoiceIds={reminding}
          onClose={() => setReminding(null)}
          onSent={({ sent, skipped }) => {
            setNotice(reminding.length === 1 && sent === 1 ? t.reminderSent : fill(t.remindersSent, { sent, skipped }));
            setReminding(null);
          }}
        />
      )}

      <Snackbar
        open={notice !== null}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Stack>
  );
}
