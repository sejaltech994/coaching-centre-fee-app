"use client";

import { describeFeePlan, formatRupees, type FeePlanInput } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useId, useState } from "react";
import { createFeePlan, listFeePlans, updateFeePlan, type FeePlan } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";
import { FeePlanDialog } from "./FeePlanDialog";

/** The centre's fee plans: add, edit, archive and restore. */
export function FeePlans({ token }: { token: string }) {
  const t = copy.feePlans;
  const archivedId = useId();
  const [plans, setPlans] = useState<FeePlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The dialog: "new", a plan being edited, or closed.
  const [editing, setEditing] = useState<FeePlan | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listFeePlans(token, { status: "all" }).then(
      ({ feePlans }) => setPlans(feePlans),
      (err: unknown) => setError(errorMessage(err)),
    );
  }, [token]);

  const replace = (saved: FeePlan) =>
    setPlans((current) => {
      const others = (current ?? []).filter((plan) => plan.id !== saved.id);
      return [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
    });

  async function save(input: FeePlanInput) {
    const { feePlan } = editing === "new" || !editing ? await createFeePlan(token, input) : await updateFeePlan(token, editing.id, input);
    replace(feePlan);
    setEditing(null);
    setNotice(t.saved);
  }

  async function setActive(plan: FeePlan, isActive: boolean) {
    try {
      replace((await updateFeePlan(token, plan.id, { isActive })).feePlan);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const active = (plans ?? []).filter((plan) => plan.isActive);
  const archived = (plans ?? []).filter((plan) => !plan.isActive);

  const planItem = (plan: FeePlan) => (
    <ListItem
      key={plan.id}
      aria-label={plan.name}
      divider
      sx={{ gap: 2, justifyContent: "space-between", flexWrap: "wrap", px: { xs: 2, md: 3 } }}
    >
      <Box>
        <Typography sx={{ fontWeight: 700 }}>{plan.name}</Typography>
        <Typography>{describeFeePlan(plan)}</Typography>
        <Typography variant="body2" color="text.secondary">
          {plan.lateFeePaise
            ? fill(t.lateFee, { amount: formatRupees(plan.lateFeePaise), days: plan.lateFeeAfterDays ?? "" })
            : t.noLateFee}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1}>
        {plan.isActive ? (
          <>
            <Button aria-label={fill(t.editName, { name: plan.name })} onClick={() => setEditing(plan)}>
              {t.edit}
            </Button>
            <Button aria-label={fill(t.archiveName, { name: plan.name })} onClick={() => setActive(plan, false)}>
              {t.archive}
            </Button>
          </>
        ) : (
          <Button aria-label={fill(t.restoreName, { name: plan.name })} onClick={() => setActive(plan, true)}>
            {t.restore}
          </Button>
        )}
      </Stack>
    </ListItem>
  );

  return (
    <Stack spacing={3}>
      <Box>
        <Button variant="contained" onClick={() => setEditing("new")}>
          {t.add}
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {plans && active.length === 0 && <Typography color="text.secondary">{t.empty}</Typography>}
      {active.length > 0 && (
        <Card>
          <List disablePadding>{active.map(planItem)}</List>
        </Card>
      )}

      {archived.length > 0 && (
        <Box component="section" aria-labelledby={archivedId}>
          <Typography id={archivedId} variant="h4" component="h2" sx={{ mb: 1 }}>
            {t.archived}
          </Typography>
          <Card>
            <List disablePadding>{archived.map(planItem)}</List>
          </Card>
        </Box>
      )}

      {editing && <FeePlanDialog plan={editing === "new" ? undefined : editing} onSave={save} onClose={() => setEditing(null)} />}

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
