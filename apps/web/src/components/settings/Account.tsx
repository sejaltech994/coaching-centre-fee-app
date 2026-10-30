"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useId, useState } from "react";
import { deleteAccount, downloadMyData, keepAccount } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

type Props = {
  token: string;
  centreName: string;
  deletesAt: string | null;
  /** Deletion was asked for: every device is signed out, this one included. */
  onDeleted: () => void;
  onKept: () => void;
};

/** Settings › Your data and Delete account (TSD; DPDP): download everything, or delete in 30 days. */
export function Account({ token, centreName, deletesAt, onDeleted, onKept }: Props) {
  const t = copy.account;
  const dataId = useId();
  const deleteId = useId();
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const download = () =>
    run("download", async () => {
      const url = URL.createObjectURL(await downloadMyData(token));
      const link = document.createElement("a");
      link.href = url;
      link.download = "chukta-export.json";
      link.click();
      URL.revokeObjectURL(url);
    });

  const remove = () =>
    run("delete", async () => {
      await deleteAccount(token, typed.trim());
      onDeleted();
    });

  const keep = () =>
    run("keep", async () => {
      await keepAccount(token);
      onKept();
    });

  return (
    <>
      {deletesAt && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={keep} loading={busy === "keep"}>
              {t.keep}
            </Button>
          }
        >
          {fill(t.deletesOn, { date: day.format(new Date(deletesAt)) })}
        </Alert>
      )}

      <Card component="section" aria-labelledby={dataId} sx={{ p: { xs: 2, md: 3 } }}>
        <Typography id={dataId} variant="h4" component="h2">
          {t.data}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t.dataLead}
        </Typography>
        <Button variant="outlined" onClick={download} loading={busy === "download"}>
          {t.download}
        </Button>
      </Card>

      {!deletesAt && (
        <Card component="section" aria-labelledby={deleteId} sx={{ p: { xs: 2, md: 3 } }}>
          <Typography id={deleteId} variant="h4" component="h2">
            {t.delete}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t.deleteLead}
          </Typography>
          <Button color="overdue" variant="outlined" onClick={() => setConfirming(true)}>
            {t.delete}
          </Button>
        </Card>
      )}
      {error && !confirming && <Alert severity="error">{error}</Alert>}

      {confirming && (
        <Dialog open onClose={() => setConfirming(false)} aria-labelledby={titleId} fullWidth maxWidth="sm">
          <DialogTitle id={titleId}>{t.deleteTitle}</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <DialogContentText>{t.deleteBody}</DialogContentText>
              <TextField label={fill(t.confirmLabel, { name: centreName })} value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirming(false)}>{t.cancel}</Button>
            <Box>
              <Button color="overdue" variant="contained" disabled={typed.trim() !== centreName.trim()} onClick={remove} loading={busy === "delete"}>
                {t.delete}
              </Button>
            </Box>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
