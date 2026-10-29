"use client";

import { formatRupees } from "@chukta/shared";
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
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { showDate } from "@/components/fees/InvoiceList";
import { RemindDialog } from "@/components/fees/RemindDialog";
import { getDashboardSummary, type DashboardSummary } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 2026" from "2026-11". */
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** A headline number: the figure in text ink, its meaning underneath. Named for screen readers by its label. */
function Tile({ label, value, note, badge }: { label: string; value: string; note: string; badge?: ReactNode }) {
  const id = useId();
  return (
    <Card component="section" aria-labelledby={id} sx={{ p: { xs: 2, md: 2.5 }, flex: 1, minWidth: 180 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography id={id} variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {badge}
      </Stack>
      <Typography variant="h3" component="p" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {note}
      </Typography>
    </Card>
  );
}

/** The centre's month at a glance (TSD: dashboard): collected vs still to collect, overdue, and who owes. */
export function Dashboard({ token }: { token: string }) {
  const t = copy.dashboard;
  const owingId = useId();
  const [month, setMonth] = useState("");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reminding, setReminding] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardSummary(token, month || undefined).then(
      (found) => {
        if (cancelled) return;
        setSummary(found);
        setError(null);
      },
      (err: unknown) => !cancelled && setError(errorMessage(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [token, month]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!summary) return null;

  const shown = monthLabel(summary.month);
  const nothingYet = summary.billedPaise === 0 && summary.collectedPaise === 0 && summary.overduePaise === 0;
  const allOverdue = summary.defaulters.flatMap((d) => d.invoiceIds);

  return (
    <Stack spacing={3}>
      <TextField
        type="month"
        label={t.month}
        value={month || summary.month}
        onChange={(event) => setMonth(event.target.value)}
        fullWidth={false}
        sx={{ width: 190 }}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Tile label={t.collected} value={formatRupees(summary.collectedPaise)} note={fill(t.collectedNote, { month: shown })} />
        <Tile
          label={t.outstanding}
          value={formatRupees(summary.outstandingPaise)}
          note={fill(t.outstandingNote, { billed: formatRupees(summary.billedPaise), month: shown })}
        />
        <Tile
          label={t.overdue}
          value={formatRupees(summary.overduePaise)}
          note={t.overdueNote}
          badge={summary.overduePaise > 0 ? <Chip label={copy.fees.overdue} color="overdue" /> : undefined}
        />
      </Stack>

      {nothingYet ? (
        <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
          <Typography color="text.secondary">{t.firstSteps}</Typography>
          <Button component={NextLink} href="/batches" variant="contained">
            {t.setUpBatches}
          </Button>
        </Stack>
      ) : (
        <Card component="section" aria-labelledby={owingId} sx={{ overflowX: "auto" }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", px: { xs: 2, md: 3 }, pt: 2, pb: 1 }}>
            <Typography id={owingId} variant="h4" component="h2">
              {t.owing}
            </Typography>
            {allOverdue.length > 0 && (
              <Button variant="outlined" onClick={() => setReminding(allOverdue)}>
                {fill(copy.fees.remindAll, { count: allOverdue.length })}
              </Button>
            )}
          </Stack>
          {summary.defaulters.length === 0 ? (
            <Typography color="text.secondary" sx={{ px: { xs: 2, md: 3 }, pb: 2 }}>
              {t.nobodyOwes}
            </Typography>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t.colStudent}</TableCell>
                  <TableCell>{t.colParent}</TableCell>
                  <TableCell align="right">{t.colOverdue}</TableCell>
                  <TableCell align="right">{t.colBills}</TableCell>
                  <TableCell>{t.colOldest}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.defaulters.map((d) => (
                  <TableRow key={d.student.id}>
                    <TableCell>
                      <Link component={NextLink} href={`/students/edit?id=${d.student.id}`}>
                        {d.student.name}
                      </Link>
                    </TableCell>
                    <TableCell>{d.student.parentName}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {formatRupees(d.overduePaise)}
                    </TableCell>
                    <TableCell align="right">{d.bills}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{showDate(d.oldestDueDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {reminding && (
        <RemindDialog
          token={token}
          invoiceIds={reminding}
          onClose={() => setReminding(null)}
          onSent={({ sent, skipped }) => {
            setNotice(fill(copy.fees.remindersSent, { sent, skipped }));
            setReminding(null);
          }}
        />
      )}
      <Box>
        <Snackbar
          open={notice !== null}
          autoHideDuration={4000}
          onClose={() => setNotice(null)}
          message={notice}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </Box>
    </Stack>
  );
}
