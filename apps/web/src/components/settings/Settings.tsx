"use client";

import { CENTRE_TYPES, validateCentre, validateOwner, type CentreType } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { GoogleMark } from "@/components/auth/GoogleMark";
import {
  ApiRequestError,
  getIdentities,
  getMe,
  getSubscription,
  listSessions,
  updateCentre,
  updateMe,
  type DeviceSession,
  type Identity,
  type Me,
  type Subscription,
} from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";
import { Devices } from "./Devices";
import { PaymentSettings } from "./PaymentSettings";
import { PlanCard } from "./PlanCard";

type Props = {
  token: string;
  /** The centre was renamed or changed: the app shell shows it. */
  onCentreChanged: (centre: Me["centre"]) => void;
  onSignOut: () => void;
};

const TYPE_LABEL: Record<CentreType, keyof typeof copy.profile> = {
  tuition: "typeTuition",
  coaching: "typeCoaching",
  dance: "typeDance",
  music: "typeMusic",
  sports: "typeSports",
  other: "typeOther",
};

const typeLabel = (type: CentreType | null) => (type ? copy.profile[TYPE_LABEL[type]] : null);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

/**
 * Profile and account (W11), for Google-only sign-in: the owner's name, their
 * Google email, their mobile number (as typed, never confirmed), their centre
 * and their sign-in method.
 */
export function Settings({ token, onCentreChanged, onSignOut }: Props) {
  const t = copy.settings;
  const [me, setMe] = useState<Me | null>(null);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // A short note after a save, e.g. "Saved."
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMe(token), getIdentities(token), listSessions(token)]).then(
      ([loaded, { identities: methods }, { sessions: devices }]) => {
        setMe(loaded);
        setIdentities(methods);
        setSessions(devices);
      },
      (err: unknown) => setLoadError(errorMessage(err)),
    );
    getSubscription(token).then(setSubscription, () => undefined);
  }, [token]);

  if (!me) return loadError ? <Alert severity="error">{loadError}</Alert> : null;
  const { user, centre } = me;
  const google = identities.find((identity) => identity.provider === "google");

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Stack spacing={0.75}>
        <Typography variant="h3" component="h1">
          {t.title}
        </Typography>
        <Typography color="text.secondary">{t.lead}</Typography>
      </Stack>

      <Section title={t.profile}>
        <ProfileEditor
          token={token}
          user={user}
          centreName={centre.name}
          onSaved={(changed) => {
            setMe({ user: changed, centre });
            setNotice(t.saved);
          }}
        />
        <Divider />
        <Row label={t.email} value={user.email ?? ""} hint={t.emailFromGoogle}>
          <Chip label={t.confirmed} color="paid" />
        </Row>
        <Divider />
        <Row label={t.mobile} value={user.phone ?? t.mobileNotAdded} />
      </Section>

      <Section title={t.centre}>
        <CentreEditor
          token={token}
          centre={centre}
          onSaved={(changed) => {
            setMe({ user, centre: changed });
            onCentreChanged(changed);
            setNotice(t.saved);
          }}
        />
      </Section>

      {subscription && <PlanCard token={token} subscription={subscription} onChange={setSubscription} />}

      <PaymentSettings token={token} plan={subscription?.plan ?? "free"} onSaved={() => setNotice(t.saved)} />

      {google && (
        <Section title={t.signInMethods}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", p: { xs: 2, md: 3 } }}>
            <GoogleMark />
            <Box>
              <Typography sx={{ fontWeight: 600 }}>{t.google}</Typography>
              <Typography variant="body2" color="text.secondary">
                {fill(t.googleConnected, { email: google.email })}
              </Typography>
            </Box>
          </Stack>
        </Section>
      )}

      <Section title={t.devices}>
        <Devices token={token} sessions={sessions} onNotice={setNotice} />
      </Section>

      <Box>
        <Button variant="outlined" onClick={onSignOut}>
          {t.signOut}
        </Button>
      </Box>

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

/** A card with a heading, announced as a region named by it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <Card component="section" aria-labelledby={id}>
      <Typography id={id} variant="h4" component="h2" sx={{ px: { xs: 2, md: 3 }, pt: { xs: 2, md: 3 }, pb: 1 }}>
        {title}
      </Typography>
      {children}
    </Card>
  );
}

function Row({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", px: { xs: 2, md: 3 }, py: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{value}</Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
      </Box>
      {children}
    </Stack>
  );
}

/** Save and Cancel under an edit form, plus the form's error when it isn't a field's. */
function EditActions({ busy, error, onCancel }: { busy: boolean; error: string | null; onCancel: () => void }) {
  const t = copy.settings;
  return (
    <>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" loading={busy}>
          {t.save}
        </Button>
        <Button onClick={onCancel}>{t.cancel}</Button>
      </Stack>
    </>
  );
}

/** Runs a save: field messages from the server go to their fields, anything else to the form. */
async function save<T>(
  run: () => Promise<T>,
  handlers: { setBusy: (busy: boolean) => void; setFields: (f: Record<string, string>) => void; setError: (e: string | null) => void },
): Promise<T | null> {
  handlers.setBusy(true);
  handlers.setError(null);
  try {
    return await run();
  } catch (err) {
    if (err instanceof ApiRequestError && err.fields) handlers.setFields(err.fields);
    else handlers.setError(errorMessage(err));
    return null;
  } finally {
    handlers.setBusy(false);
  }
}

function ProfileEditor({
  token,
  user,
  centreName,
  onSaved,
}: {
  token: string;
  user: Me["user"];
  centreName: string | null;
  onSaved: (user: Me["user"]) => void;
}) {
  const t = copy.settings;
  const name = user.fullName ?? "";
  const current = () => ({ fullName: name, phone: user.phone ?? "" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEditing() {
    setDraft(current());
    setFields({});
    setError(null);
    setEditing(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateOwner(draft);
    if (!checked.ok) return setFields(checked.fields);
    const result = await save(() => updateMe(token, checked.value), { setBusy, setFields, setError });
    if (result) {
      setEditing(false);
      onSaved(result.user);
    }
  }

  if (editing) {
    return (
      <Stack component="form" spacing={2} noValidate onSubmit={submit} sx={{ p: { xs: 2, md: 3 }, pt: 1 }}>
        <TextField
          label={copy.profile.fullName}
          value={draft.fullName}
          onChange={(event) => setDraft((d) => ({ ...d, fullName: event.target.value }))}
          error={Boolean(fields.fullName)}
          helperText={fields.fullName}
          autoComplete="name"
          autoFocus
        />
        <TextField
          label={t.mobile}
          value={draft.phone}
          onChange={(event) => setDraft((d) => ({ ...d, phone: event.target.value }))}
          error={Boolean(fields.phone)}
          helperText={fields.phone ?? copy.profile.phoneHint}
          type="tel"
          autoComplete="tel"
        />
        <EditActions busy={busy} error={error} onCancel={() => setEditing(false)} />
      </Stack>
    );
  }

  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center", px: { xs: 2, md: 3 }, py: 2 }}>
      <Avatar sx={{ bgcolor: "primary.light", color: "primary.main", fontWeight: 700 }} aria-hidden="true">
        {initials(name)}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }}>{name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {fill(t.role, { centre: centreName ?? "" })}
        </Typography>
      </Box>
      <Button aria-label={t.editProfile} onClick={startEditing}>
        {t.edit}
      </Button>
    </Stack>
  );
}

function CentreEditor({ token, centre, onSaved }: { token: string; centre: Me["centre"]; onSaved: (centre: Me["centre"]) => void }) {
  const t = copy.settings;
  const p = copy.profile;
  const typeLabelId = useId();
  const current = () => ({ centreName: centre.name ?? "", city: centre.city ?? "", centreType: centre.centreType ?? "" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEditing() {
    setDraft(current());
    setFields({});
    setError(null);
    setEditing(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateCentre(draft);
    if (!checked.ok) return setFields(checked.fields);
    const result = await save(() => updateCentre(token, checked.value), { setBusy, setFields, setError });
    if (result) {
      setEditing(false);
      onSaved(result.centre);
    }
  }

  if (editing) {
    const text = (name: "centreName" | "city", label: string) => ({
      label,
      value: draft[name],
      onChange: (event: { target: { value: string } }) => setDraft((d) => ({ ...d, [name]: event.target.value })),
      error: Boolean(fields[name]),
      helperText: fields[name],
    });
    return (
      <Stack component="form" spacing={2} noValidate onSubmit={submit} sx={{ p: { xs: 2, md: 3 }, pt: 1 }}>
        <TextField {...text("centreName", p.centreName)} autoFocus />
        <TextField {...text("city", p.city)} autoComplete="address-level2" />
        <Stack spacing={1}>
          <Typography id={typeLabelId} variant="body2" sx={{ fontWeight: 600 }}>
            {p.centreType}
          </Typography>
          <ToggleButtonGroup
            exclusive
            aria-labelledby={typeLabelId}
            value={draft.centreType || null}
            onChange={(_event, value: CentreType | null) => value && setDraft((d) => ({ ...d, centreType: value }))}
            sx={{ flexWrap: "wrap", gap: 1 }}
          >
            {CENTRE_TYPES.map((type) => (
              <ToggleButton key={type} value={type}>
                {typeLabel(type)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {fields.centreType && (
            <Typography variant="caption" color="error">
              {fields.centreType}
            </Typography>
          )}
        </Stack>
        <EditActions busy={busy} error={error} onCancel={() => setEditing(false)} />
      </Stack>
    );
  }

  const summary = [centre.name, typeLabel(centre.centreType), centre.city].filter(Boolean).join(" · ");
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", px: { xs: 2, md: 3 }, py: 2 }}>
      <Typography sx={{ fontWeight: 600 }}>{summary}</Typography>
      <Button aria-label={t.editCentre} onClick={startEditing}>
        {t.edit}
      </Button>
    </Stack>
  );
}
