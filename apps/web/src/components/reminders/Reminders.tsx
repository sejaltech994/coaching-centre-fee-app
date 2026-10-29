"use client";

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
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useEffect, useId, useState } from "react";
import { getReminderTone, listReminders, setReminderTone, type Reminder, type ReminderTone } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

const STATUS_COLOR: Record<Reminder["status"], "paid" | "pending" | "overdue" | "default"> = {
  sent: "default",
  delivered: "pending",
  read: "paid",
  failed: "overdue",
  skipped: "default",
};

/** Each kind of reminder's label in the copy catalog. */
const KIND_LABEL: Record<Reminder["kind"], keyof typeof copy.reminders> = {
  pre_due: "preDue",
  due: "due",
  overdue_3: "overdue3",
  overdue_7: "overdue7",
  manual: "manual",
  payment_received: "paymentReceived",
};

const timeFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** The centre's WhatsApp reminders: their tone, and every message sent (or not), newest first. */
export function Reminders({ token }: { token: string }) {
  const t = copy.reminders;
  const toneId = useId();
  const [tone, setTone] = useState<ReminderTone | null>(null);
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listReminders(token).then(
      (page) => {
        setReminders(page.reminders);
        setCursor(page.nextCursor);
      },
      (err: unknown) => setError(errorMessage(err)),
    );
    getReminderTone(token).then(({ tone: current }) => setTone(current), () => undefined);
  }, [token]);

  async function changeTone(next: ReminderTone) {
    try {
      setTone((await setReminderTone(token, next)).tone);
      setNotice(fill(t.toneSaved, { tone: t[next].toLowerCase() }));
    } catch (err) {
      setNotice(errorMessage(err));
    }
  }

  async function showMore() {
    if (!cursor) return;
    try {
      const page = await listReminders(token, cursor);
      setReminders((current) => [...(current ?? []), ...page.reminders]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Stack spacing={3}>
      {tone && (
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Typography id={toneId} variant="body2" sx={{ fontWeight: 600 }}>
            {t.tone}
          </Typography>
          <ToggleButtonGroup exclusive aria-labelledby={toneId} value={tone} onChange={(_e, next: ReminderTone | null) => next && changeTone(next)}>
            <ToggleButton value="gentle">{t.gentle}</ToggleButton>
            <ToggleButton value="firm">{t.firm}</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {reminders && reminders.length === 0 && <Typography color="text.secondary">{t.empty}</Typography>}

      {reminders && reminders.length > 0 && (
        <Card sx={{ overflowX: "auto" }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t.colWhen}</TableCell>
                <TableCell>{t.colStudent}</TableCell>
                <TableCell>{t.colBill}</TableCell>
                <TableCell>{t.colWhat}</TableCell>
                <TableCell>{t.colStatus}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reminders.map((reminder) => (
                <TableRow key={reminder.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{timeFormat.format(new Date(reminder.sentAt ?? reminder.createdAt))}</TableCell>
                  <TableCell>
                    <Link component={NextLink} href={`/students/edit?id=${reminder.student.id}`}>
                      {reminder.student.name}
                    </Link>
                  </TableCell>
                  <TableCell>{fill(copy.fees.billNumber, { number: reminder.invoice.number })}</TableCell>
                  <TableCell>{t[KIND_LABEL[reminder.kind]]}</TableCell>
                  <TableCell>
                    <Chip label={t[reminder.status]} color={STATUS_COLOR[reminder.status]} />
                    {reminder.error && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        {reminder.error}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {cursor && (
        <Box>
          <Button onClick={showMore}>{t.showMore}</Button>
        </Box>
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
