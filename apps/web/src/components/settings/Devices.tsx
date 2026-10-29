"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { signOutOtherSessions, signOutSession, type DeviceSession } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

// "25 Oct 2026", in India's time whatever the browser's zone.
const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

type Props = {
  token: string;
  sessions: DeviceSession[];
  /** A short note after signing devices out. */
  onNotice: (message: string) => void;
};

/** Where the owner is signed in, this device first, with sign-out for the others. */
export function Devices({ token, sessions: initial, onNotice }: Props) {
  const t = copy.settings;
  const [sessions, setSessions] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const others = sessions.filter((session) => !session.current);

  async function run(key: string, action: () => Promise<unknown>, keep: (s: DeviceSession) => boolean, notice: string) {
    setBusy(key);
    setError(null);
    try {
      await action();
      setSessions((current) => current.filter(keep));
      onNotice(notice);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pb: { xs: 2, md: 3 } }}>
      <List disablePadding>
        {sessions.map((session) => (
          <ListItem key={session.id} disableGutters divider sx={{ gap: 2, justifyContent: "space-between" }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>{session.device}</Typography>
              {!session.current && (
                <Typography variant="body2" color="text.secondary">
                  {fill(t.lastActive, { date: day.format(new Date(session.lastActiveAt)) })}
                </Typography>
              )}
            </Box>
            {session.current ? (
              <Chip label={t.thisDevice} color="primary" variant="outlined" />
            ) : (
              <Button
                aria-label={fill(t.signOutDeviceName, { device: session.device })}
                loading={busy === session.id}
                onClick={() =>
                  run(
                    session.id,
                    () => signOutSession(token, session.id),
                    (s) => s.id !== session.id,
                    fill(t.signedOutDevice, { device: session.device }),
                  )
                }
              >
                {t.signOutDevice}
              </Button>
            )}
          </ListItem>
        ))}
      </List>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      {others.length > 0 && (
        <Stack sx={{ mt: 2, alignItems: "flex-start" }}>
          <Button
            variant="outlined"
            loading={busy === "others"}
            onClick={() => run("others", () => signOutOtherSessions(token), (s) => s.current, t.signedOutOthers)}
          >
            {t.signOutOthers}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
