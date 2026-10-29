"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useEffect, useId, useState } from "react";
import {
  endEnrolment,
  enrol,
  getStudent,
  listBatches,
  updateStudent,
  type Batch,
  type StudentBatch,
  type StudentDetail as Detail,
  type StudentInput,
} from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";
import { InvoiceList } from "@/components/fees/InvoiceList";
import { EnrolledBatch } from "./EnrolledBatch";
import { StudentForm } from "./StudentForm";

// Dates are the centre's (India's), whatever the browser's timezone.
const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** One student: their details, their batches, and whether they're still at the centre. */
export function StudentDetail({ token, id }: { token: string; id: string }) {
  const t = copy.students;
  const batchesId = useId();
  const feesId = useId();
  // Joining or leaving a batch makes or drops bills, so the fee list reloads.
  const [feesVersion, setFeesVersion] = useState(0);
  const [student, setStudent] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(!id);
  const [activeBatches, setActiveBatches] = useState<Batch[]>([]);
  const [joining, setJoining] = useState("");
  const [batchError, setBatchError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getStudent(token, id).then(setStudent, () => setMissing(true));
    listBatches(token, { status: "active" }).then(
      ({ batches }) => setActiveBatches(batches),
      () => undefined,
    );
  }, [token, id]);

  if (missing) {
    return (
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Typography>{t.notFound}</Typography>
        <Link component={NextLink} href="/students">
          {t.back}
        </Link>
      </Stack>
    );
  }
  if (!student) return null;

  const active = student.status === "active";
  const joinable = activeBatches.filter((batch) => !student.batches.some((b) => b.id === batch.id));

  async function save(input: StudentInput) {
    const { student: saved } = await updateStudent(token, id, input);
    setStudent((current) => current && { ...current, ...saved });
    setNotice(t.saved);
  }

  async function batchAction<T>(key: string, action: () => Promise<T>, apply: (result: T) => void) {
    setBusy(key);
    setBatchError(null);
    try {
      apply(await action());
    } catch (err) {
      setBatchError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const join = () =>
    batchAction("join", () => enrol(token, id, joining), ({ enrolment }) => {
      const joined: StudentBatch = {
        id: enrolment.batch.id,
        name: enrolment.batch.name,
        enrolmentId: enrolment.id,
        since: enrolment.startDate,
        feePlan: activeBatches.find((b) => b.id === enrolment.batch.id)?.feePlan ?? null,
        discountPaise: enrolment.discountPaise,
      };
      setStudent((current) => current && { ...current, batches: [...current.batches, joined] });
      setJoining("");
      setFeesVersion((v) => v + 1);
      setNotice(fill(t.added, { batch: joined.name }));
    });

  const leaveBatch = (batch: StudentBatch) =>
    batchAction(batch.enrolmentId, () => endEnrolment(token, batch.enrolmentId, todayInIndia()), () => {
      setStudent((current) => current && { ...current, batches: current.batches.filter((b) => b.id !== batch.id) });
      setFeesVersion((v) => v + 1);
      setNotice(fill(t.removed, { batch: batch.name }));
    });

  async function setStatus(status: "active" | "left") {
    setConfirmingLeave(false);
    setBusy("status");
    try {
      const { student: saved } = await updateStudent(token, id, { status });
      setStudent((current) => current && { ...current, ...saved });
      setFeesVersion((v) => v + 1);
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="h3" component="h1">
          {student.name}
        </Typography>
        {!active && <Chip label={t.leftLabel} color="overdue" />}
      </Stack>

      <Card sx={{ p: { xs: 2, md: 3 } }}>
        <StudentForm initial={student} submitLabel={t.save} onSubmit={save} onCancel={() => history.back()} />
      </Card>

      <Card component="section" aria-labelledby={batchesId} sx={{ p: { xs: 2, md: 3 } }}>
        <Typography id={batchesId} variant="h4" component="h2" sx={{ mb: 1 }}>
          {t.batches}
        </Typography>
        {student.batches.length === 0 ? (
          <Typography color="text.secondary">{t.inNoBatch}</Typography>
        ) : (
          <List disablePadding>
            {student.batches.map((batch) => (
              <EnrolledBatch
                key={batch.id}
                token={token}
                batch={batch}
                removing={busy === batch.enrolmentId}
                onRemove={() => leaveBatch(batch)}
                onDiscountSaved={(discountPaise) =>
                  setStudent(
                    (current) =>
                      current && { ...current, batches: current.batches.map((b) => (b.id === batch.id ? { ...b, discountPaise } : b)) },
                  )
                }
              />
            ))}
          </List>
        )}
        {active && joinable.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
            <TextField
              select
              label={t.addToBatch}
              value={joining}
              onChange={(event) => setJoining(event.target.value)}
              fullWidth={false}
              sx={{ minWidth: 220 }}
            >
              {joinable.map((batch) => (
                <MenuItem key={batch.id} value={batch.id}>
                  {batch.name}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" disabled={!joining} loading={busy === "join"} onClick={join}>
              {t.addButton}
            </Button>
          </Stack>
        )}
        {batchError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {batchError}
          </Alert>
        )}
      </Card>

      <Card component="section" aria-labelledby={feesId} sx={{ p: { xs: 2, md: 3 } }}>
        <Typography id={feesId} variant="h4" component="h2" sx={{ mb: 2 }}>
          {copy.fees.studentFees}
        </Typography>
        <InvoiceList key={feesVersion} token={token} studentId={id} />
      </Card>

      <Box>
        {active ? (
          <Button color="overdue" variant="outlined" onClick={() => setConfirmingLeave(true)}>
            {t.markLeft}
          </Button>
        ) : (
          <Button variant="outlined" loading={busy === "status"} onClick={() => setStatus("active")}>
            {t.markActive}
          </Button>
        )}
      </Box>

      <Dialog open={confirmingLeave} onClose={() => setConfirmingLeave(false)} aria-labelledby={`${batchesId}-leave`}>
        <DialogTitle id={`${batchesId}-leave`}>{fill(t.markLeftTitle, { name: student.name })}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t.markLeftBody}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingLeave(false)}>{t.cancel}</Button>
          <Button color="overdue" variant="contained" onClick={() => setStatus("left")}>
            {t.markLeft}
          </Button>
        </DialogActions>
      </Dialog>

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
