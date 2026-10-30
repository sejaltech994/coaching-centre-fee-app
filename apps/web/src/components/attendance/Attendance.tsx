"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import FormControlLabel from "@mui/material/FormControlLabel";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import {
  ApiRequestError,
  getAbsenceAlerts,
  getAttendance,
  listBatches,
  saveAttendance,
  setAbsenceAlerts,
  type AttendanceDay,
  type Batch,
} from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

// Days are the centre's (India's), whatever the browser's timezone.
const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** Taking a batch's attendance for a day (TSD: daily attendance per batch, optional absence alert). */
export function Attendance({ token }: { token: string }) {
  const t = copy.attendance;
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(todayInIndia);
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [alertsOn, setAlertsOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listBatches(token, { status: "active" }).then(
      ({ batches: found }) => {
        setBatches(found);
        setBatchId((current) => current || found[0]?.id || "");
      },
      (err: unknown) => setError(errorMessage(err)),
    );
    getAbsenceAlerts(token).then(({ on }) => setAlertsOn(on), () => undefined);
  }, [token]);

  useEffect(() => {
    if (!batchId || !date) return;
    let cancelled = false;
    getAttendance(token, batchId, date).then(
      (found) => {
        if (cancelled) return;
        setDay(found);
        setMarks(Object.fromEntries(found.students.filter((s) => s.present !== null).map((s) => [s.id, s.present!])));
        setError(null);
      },
      (err: unknown) => !cancelled && setError(errorMessage(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [token, batchId, date]);

  async function save() {
    if (!day) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveAttendance(token, {
        batchId,
        date,
        // Not marked yet counts as present: the owner marks the absences.
        marks: day.students.map((s) => ({ studentId: s.id, present: marks[s.id] ?? true })),
      });
      setDay(saved);
      const sent = saved.absenceAlerts.sent;
      setNotice(sent > 0 ? fill(t.alertsSent, { count: sent }) : t.saved);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.fields ? Object.values(err.fields)[0]! : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // The switch moves at once; it goes back if the change can't be saved.
  async function toggleAlerts(on: boolean) {
    setAlertsOn(on);
    try {
      await setAbsenceAlerts(token, on);
    } catch (err) {
      setAlertsOn(!on);
      setNotice(errorMessage(err));
    }
  }

  if (batches && batches.length === 0) return <Typography color="text.secondary">{t.noBatches}</Typography>;

  return (
    <Stack spacing={3}>
      {alertsOn !== null && (
        <Box>
          <FormControlLabel
            control={<Switch checked={alertsOn} onChange={(event) => toggleAlerts(event.target.checked)} />}
            label={t.alerts}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {t.alertsHint}
          </Typography>
        </Box>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField select label={t.batch} value={batchId} onChange={(event) => setBatchId(event.target.value)} sx={{ minWidth: 240 }} fullWidth={false}>
          {(batches ?? []).map((batch) => (
            <MenuItem key={batch.id} value={batch.id}>
              {batch.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="date"
          label={t.day}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          fullWidth={false}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayInIndia() } }}
        />
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {day && day.students.length === 0 && <Typography color="text.secondary">{t.noStudents}</Typography>}
      {day && day.students.length > 0 && (
        <>
          <Card>
            <List disablePadding>
              {day.students.map((student) => {
                const value = marks[student.id];
                return (
                  <ListItem key={student.id} divider sx={{ justifyContent: "space-between", gap: 2, flexWrap: "wrap", px: { xs: 2, md: 3 } }}>
                    <Typography sx={{ fontWeight: 600 }}>{student.name}</Typography>
                    <ToggleButtonGroup
                      exclusive
                      aria-label={student.name}
                      value={value === undefined ? null : value ? "present" : "absent"}
                      onChange={(_e, next: "present" | "absent" | null) =>
                        next && setMarks((current) => ({ ...current, [student.id]: next === "present" }))
                      }
                    >
                      <ToggleButton value="present" color="success">
                        {t.present}
                      </ToggleButton>
                      <ToggleButton value="absent" color="error">
                        {t.absent}
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </ListItem>
                );
              })}
            </List>
          </Card>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={save} loading={busy}>
              {t.save}
            </Button>
            <Button onClick={() => setMarks(Object.fromEntries(day.students.map((s) => [s.id, true])))}>{t.allPresent}</Button>
          </Stack>
        </>
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
