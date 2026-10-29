"use client";

import { rupeesToPaise, validateFeePlan, type FeeCycle, type FeePlanInput } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useId, useState, type FormEvent } from "react";
import { ApiRequestError, type FeePlan } from "@/lib/api";
import { copy, errorMessage } from "@/lib/copy";

type Props = {
  /** The plan being edited; a new plan when absent. */
  plan?: FeePlan;
  onSave: (input: FeePlanInput) => Promise<void>;
  onClose: () => void;
};

const DUE_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** "2500" from 250000 paise: what the amount fields show. */
const asRupees = (paise: number | null) => (paise === null ? "" : String(paise / 100));

/** The fields as typed, in the shape validateFeePlan checks; text that isn't money becomes NaN so it's refused. */
function toInput(form: { name: string; amount: string; cycle: string; dueDay: string; lateFee: string; lateFeeDays: string }, charge: boolean) {
  const money = (text: string) => rupeesToPaise(text) ?? Number.NaN;
  return {
    name: form.name,
    amountPaise: money(form.amount),
    cycle: form.cycle || undefined,
    dueDay: form.dueDay ? Number(form.dueDay) : null,
    lateFeePaise: charge ? money(form.lateFee) : null,
    lateFeeAfterDays: charge && form.lateFeeDays ? Number(form.lateFeeDays) : null,
  };
}

/** Adding or editing a fee plan. Amounts are typed in rupees and sent in paise. */
export function FeePlanDialog({ plan, onSave, onClose }: Props) {
  const t = copy.feePlans;
  const titleId = useId();
  const cycleId = useId();
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    amount: asRupees(plan?.amountPaise ?? null),
    cycle: plan?.cycle ?? "",
    dueDay: plan?.dueDay ? String(plan.dueDay) : "",
    lateFee: asRupees(plan?.lateFeePaise ?? null),
    lateFeeDays: plan?.lateFeeAfterDays ? String(plan.lateFeeAfterDays) : "",
  });
  const [charge, setCharge] = useState(Boolean(plan?.lateFeePaise));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateFeePlan(toInput(form, charge));
    if (!checked.ok) return setFields(checked.fields);
    setBusy(true);
    setError(null);
    try {
      await onSave(checked.value);
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setFields(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const money = (field: "amount" | "lateFee", key: "amountPaise" | "lateFeePaise", label: string) => ({
    label,
    value: form[field],
    onChange: set(field),
    error: Boolean(fields[key]),
    helperText: fields[key],
    slotProps: {
      htmlInput: { inputMode: "decimal" as const },
      input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
    },
  });

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <form noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{plan ? t.editTitle : t.newTitle}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.25} sx={{ pt: 1 }}>
            <TextField
              label={t.name}
              value={form.name}
              onChange={set("name")}
              error={Boolean(fields.name)}
              helperText={fields.name ?? t.nameHint}
              autoFocus
            />
            <TextField {...money("amount", "amountPaise", t.amount)} />

            <Stack spacing={1}>
              <Typography id={cycleId} variant="body2" sx={{ fontWeight: 600 }}>
                {t.cycle}
              </Typography>
              <ToggleButtonGroup
                exclusive
                aria-labelledby={cycleId}
                value={form.cycle || null}
                onChange={(_event, value: FeeCycle | null) => value && setForm((current) => ({ ...current, cycle: value }))}
              >
                <ToggleButton value="monthly">{t.monthly}</ToggleButton>
                <ToggleButton value="quarterly">{t.quarterly}</ToggleButton>
                <ToggleButton value="one_time">{t.oneTime}</ToggleButton>
              </ToggleButtonGroup>
              {fields.cycle && <FormHelperText error>{fields.cycle}</FormHelperText>}
            </Stack>

            {form.cycle !== "one_time" && (
              <TextField
                select
                label={t.dueDay}
                value={form.dueDay}
                onChange={set("dueDay")}
                error={Boolean(fields.dueDay)}
                helperText={fields.dueDay ?? (form.cycle === "quarterly" ? t.dueDayQuarterly : t.dueDayMonthly)}
              >
                {DUE_DAYS.map((day) => (
                  <MenuItem key={day} value={String(day)}>
                    {day}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <FormControlLabel
              control={<Checkbox checked={charge} onChange={(event) => setCharge(event.target.checked)} />}
              label={t.chargeLateFee}
            />
            {charge && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField {...money("lateFee", "lateFeePaise", t.lateFeeAmount)} />
                <TextField
                  label={t.lateFeeDays}
                  value={form.lateFeeDays}
                  onChange={set("lateFeeDays")}
                  error={Boolean(fields.lateFeeAfterDays)}
                  helperText={fields.lateFeeAfterDays}
                  slotProps={{ htmlInput: { inputMode: "numeric" } }}
                />
              </Stack>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t.cancel}</Button>
          <Button type="submit" variant="contained" loading={busy}>
            {t.save}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
