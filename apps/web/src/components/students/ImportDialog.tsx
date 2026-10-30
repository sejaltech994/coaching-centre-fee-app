"use client";

import { STUDENT_IMPORT_HEADINGS, toCsv } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useId, useState, type ChangeEvent } from "react";
import { ApiRequestError, importStudents, previewImport, type ImportResult } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

const TEMPLATE = `data:text/csv;charset=utf-8,${encodeURIComponent(
  toCsv([STUDENT_IMPORT_HEADINGS, ["Aarav Sharma", "Neha Sharma", "98765 43210", "yes", "Class 10 Maths"]]),
)}`;

type Props = { token: string; onClose: () => void; onImported: (count: number) => void };

/** Students from a spreadsheet: the template, a row-by-row preview, then the import (all rows or none). */
export function ImportDialog({ token, onClose, onImported }: Props) {
  const t = copy.students;
  const titleId = useId();
  const fileId = useId();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    const text = await file.text();
    setCsv(text);
    try {
      setPreview(await previewImport(token, text));
    } catch (err) {
      setError(err instanceof ApiRequestError && err.fields?.csv ? err.fields.csv : errorMessage(err));
    }
  }

  async function confirm() {
    if (!csv) return;
    setBusy(true);
    setError(null);
    try {
      onImported((await importStudents(token, csv)).imported);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="md">
      <DialogTitle id={titleId}>{t.importTitle}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography color="text.secondary">{t.importLead}</Typography>
          <Link href={TEMPLATE} download="chukta-students.csv">
            {t.template}
          </Link>
          <Box>
            <Typography component="label" htmlFor={fileId} variant="body2" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
              {t.csvFile}
            </Typography>
            <input id={fileId} type="file" accept=".csv,text/csv" onChange={choose} />
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          {preview && (
            <>
              <Typography sx={{ fontWeight: 600 }}>
                {preview.invalid === 0
                  ? fill(t.importReady, { count: preview.valid })
                  : fill(t.importToFix, { valid: preview.valid, invalid: preview.invalid })}
              </Typography>
              <Box sx={{ overflowX: "auto", maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t.colLine}</TableCell>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.parentName}</TableCell>
                      <TableCell>{t.batches}</TableCell>
                      <TableCell>{t.colProblems}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.line}>
                        <TableCell>{row.line}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.parentName}</TableCell>
                        <TableCell>{row.batches.join(", ")}</TableCell>
                        <TableCell sx={{ color: "error.main" }}>{Object.values(row.errors).join(" ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.cancel}</Button>
        {preview && preview.invalid === 0 && (
          <Button variant="contained" onClick={confirm} loading={busy}>
            {fill(preview.valid === 1 ? t.importConfirm : t.importConfirmMany, { count: preview.valid })}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
