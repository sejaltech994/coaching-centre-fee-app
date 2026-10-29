"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { googleStartUrl } from "@/lib/api";
import { copy, googleErrorMessage, withParts } from "@/lib/copy";
import { navigate } from "@/lib/navigate";
import { GoogleMark } from "./GoogleMark";

type Props = {
  /** Inlined at build time: whether this environment has a Google OAuth client. */
  googleEnabled: boolean;
  /** Why the owner is back here (?google_error=…). */
  googleError?: string;
  /** Why a signed-in page sent the owner here (?session=…). */
  session?: string;
};

const SESSION_NOTICES = { required: "loginRequired", expired: "loginExpired" } as const;

/**
 * Sign in (W1). Google is the only way in, for new and returning owners alike:
 * the API sends a new Google account on to sign-up.
 */
export function SignIn({ googleEnabled, googleError, session }: Props) {
  const t = copy.auth;
  const notice = session && session in SESSION_NOTICES ? t[SESSION_NOTICES[session as keyof typeof SESSION_NOTICES]] : null;
  return (
    <Stack spacing={2.5}>
      <Stack spacing={0.75}>
        <Typography variant="h3" component="h1">
          {t.signInTitle}
        </Typography>
        <Typography color="text.secondary">{t.signInLead}</Typography>
      </Stack>

      {notice && (
        <Alert severity="info" role="status">
          {notice}
        </Alert>
      )}

      {!googleEnabled ? (
        <Alert severity="info">{copy.errors.googleUnavailable}</Alert>
      ) : (
        <>
          {googleError && <Alert severity="error">{googleErrorMessage(googleError)}</Alert>}
          <Button
            variant="outlined"
            color="inherit"
            size="large"
            fullWidth
            startIcon={<GoogleMark />}
            onClick={() => navigate(googleStartUrl())}
            sx={{ bgcolor: "background.paper", borderColor: "divider", minHeight: 52 }}
          >
            {t.continueWithGoogle}
          </Button>
        </>
      )}

      <Typography variant="body2" color="text.secondary">
        {withParts(t.legalNotice, {
          terms: (
            <Link component={NextLink} href="/terms">
              {t.termsLink}
            </Link>
          ),
          privacy: (
            <Link component={NextLink} href="/privacy">
              {t.privacyLink}
            </Link>
          ),
        })}
      </Typography>
    </Stack>
  );
}
