"use client";

import { describeFeePlan, formatRupees, rupeesToPaise } from "@chukta/shared";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, type FormEvent } from "react";
import { ApiRequestError, setDiscount, type StudentBatch } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "2 Nov 2026" from "2026-11-02". */
const showDate = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

type Props = {
  token: string;
  batch: StudentBatch;
  removing: boolean;
  onRemove: () => void;
  onDiscountSaved: (discountPaise: number) => void;
};

/** One of a student's batches: since when, the fee plan they're billed on, and their discount on it. */
export function EnrolledBatch({ token, batch, removing, onRemove, onDiscountSaved }: Props) {
  const t = copy.students;
  const f = copy.feePlans;
  const [editing, setEditing] = useState(false);
  const [discount, setDiscountText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plan = batch.feePlan;
  const billing = plan
    ? [describeFeePlan(plan), batch.discountPaise ? fill(f.discountOff, { amount: formatRupees(batch.discountPaise) }) : f.noDiscount]
    : [f.noPlan];

  function startEditing() {
    setDiscountText(batch.discountPaise ? String(batch.discountPaise / 100) : "");
    setProblem(null);
    setEditing(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const paise = discount.trim() === "" ? 0 : rupeesToPaise(discount);
    if (paise === null) return setProblem(f.discountInvalid);
    if (plan && paise > plan.amountPaise) return setProblem(f.discountTooBig);
    setBusy(true);
    try {
      const { enrolment } = await setDiscount(token, batch.enrolmentId, paise);
      onDiscountSaved(enrolment.discountPaise);
      setEditing(false);
    } catch (err) {
      setProblem(err instanceof ApiRequestError && err.fields?.discountPaise ? err.fields.discountPaise : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ListItem disableGutters divider sx={{ gap: 2, justifyContent: "space-between", flexWrap: "wrap" }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{batch.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {[fill(t.since, { date: showDate(batch.since) }), ...billing].join(" · ")}
        </Typography>
      </Box>
      {editing ? (
        <Stack component="form" direction="row" spacing={1} noValidate onSubmit={save} sx={{ alignItems: "flex-start" }}>
          <TextField
            label={f.discount}
            value={discount}
            onChange={(event) => setDiscountText(event.target.value)}
            error={Boolean(problem)}
            helperText={problem}
            autoFocus
            fullWidth={false}
            sx={{ width: 160 }}
            slotProps={{
              htmlInput: { inputMode: "decimal" },
              input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
            }}
          />
          <Button type="submit" variant="contained" loading={busy} sx={{ mt: 1 }}>
            {f.saveDiscount}
          </Button>
          <Button onClick={() => setEditing(false)} sx={{ mt: 1 }}>
            {f.cancel}
          </Button>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1}>
          {plan && (
            <Button aria-label={fill(f.discountName, { batch: batch.name })} onClick={startEditing}>
              {f.discountButton}
            </Button>
          )}
          <Button aria-label={fill(t.removeName, { batch: batch.name })} loading={removing} onClick={onRemove}>
            {t.remove}
          </Button>
        </Stack>
      )}
    </ListItem>
  );
}
