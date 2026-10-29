import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import NextLink from "next/link";
import { copy } from "@/lib/copy";

/**
 * Shown while the owner's mobile number isn't confirmed (TSD: prompted by a
 * dashboard banner and in Settings). Its button opens the confirm steps in
 * place, or links to Settings from elsewhere.
 */
export function PhoneBanner(props: { onConfirm: () => void } | { href: string }) {
  const t = copy.settings;
  const action =
    "href" in props ? (
      <Button component={NextLink} href={props.href} color="inherit" size="small">
        {t.bannerAction}
      </Button>
    ) : (
      <Button color="inherit" size="small" onClick={props.onConfirm}>
        {t.bannerAction}
      </Button>
    );
  return (
    // A standing reminder, not an urgent message: announced as status, not alert.
    <Alert severity="warning" role="status" action={action} sx={{ alignItems: "center" }}>
      {t.banner}
    </Alert>
  );
}
