"use client";

import { formatIndianMobile, validateStudent } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormHelperText from "@mui/material/FormHelperText";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useId, useState, type FormEvent } from "react";
import { ApiRequestError, type StudentInput } from "@/lib/api";
import { copy, errorMessage } from "@/lib/copy";

type Field = "name" | "parentName" | "parentPhone";
const FIELD_ORDER: Field[] = ["name", "parentName", "parentPhone"];

type Props = {
  /** The student being edited; a new student when absent. */
  initial?: StudentInput;
  /** Batches a new student can join; no batch picker when absent (editing). */
  batches?: { id: string; name: string }[];
  submitLabel: string;
  onSubmit: (input: StudentInput & { batchIds?: string[] }) => Promise<void>;
  onCancel: () => void;
};

/** "98765 43210" from "+919876543210": the field shows the number without +91. */
const national = (e164: string) => formatIndianMobile(e164).replace(/^\+91 /, "");

/** A student's details, for adding (with batches) or editing. */
export function StudentForm({ initial, batches, submitLabel, onSubmit, onCancel }: Props) {
  const t = copy.students;
  const batchesId = useId();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    parentName: initial?.parentName ?? "",
    parentPhone: initial ? national(initial.parentPhone) : "",
  });
  const [whatsappOptIn, setWhatsappOptIn] = useState(initial?.whatsappOptIn ?? false);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: Field) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  function showErrors(found: Record<string, string>) {
    setFields(found);
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) document.getElementById(`student-${first}`)?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = { ...form, whatsappOptIn };
    const checked = validateStudent(input);
    if (!checked.ok) return showErrors(checked.fields);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(batches ? { ...input, batchIds } : input);
      setFields({});
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) showErrors(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const text = (name: Field, label: string) => ({
    id: `student-${name}`,
    label,
    value: form[name],
    onChange: set(name),
    error: Boolean(fields[name]),
    helperText: fields[name],
  });

  return (
    <Stack component="form" spacing={2.25} noValidate onSubmit={submit}>
      <TextField {...text("name", t.name)} />
      <TextField {...text("parentName", t.parentName)} />
      <TextField
        {...text("parentPhone", t.parentPhone)}
        helperText={fields.parentPhone ?? t.parentPhoneHint}
        type="tel"
        slotProps={{
          htmlInput: { inputMode: "numeric" },
          input: { startAdornment: <InputAdornment position="start">+91</InputAdornment> },
        }}
      />
      <FormControlLabel
        control={<Checkbox checked={whatsappOptIn} onChange={(event) => setWhatsappOptIn(event.target.checked)} />}
        label={t.consent}
        slotProps={{ typography: { variant: "body2" } }}
      />

      {batches && (
        <Stack component="fieldset" spacing={0.5} sx={{ m: 0, p: 0, border: 0 }} aria-describedby={batchesId}>
          <Typography component="legend" variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {t.batches}
          </Typography>
          {batches.length === 0 ? (
            <Typography id={batchesId} variant="body2" color="text.secondary">
              {t.noBatches}
            </Typography>
          ) : (
            <>
              <FormGroup>
                {batches.map((batch) => (
                  <FormControlLabel
                    key={batch.id}
                    label={batch.name}
                    control={
                      <Checkbox
                        checked={batchIds.includes(batch.id)}
                        onChange={(event) =>
                          setBatchIds((ids) => (event.target.checked ? [...ids, batch.id] : ids.filter((id) => id !== batch.id)))
                        }
                      />
                    }
                  />
                ))}
              </FormGroup>
              <FormHelperText id={batchesId} error={Boolean(fields.batchIds)}>
                {fields.batchIds ?? t.batchesHint}
              </FormHelperText>
            </>
          )}
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" loading={busy}>
          {submitLabel}
        </Button>
        <Button onClick={onCancel}>{t.cancel}</Button>
      </Stack>
    </Stack>
  );
}
