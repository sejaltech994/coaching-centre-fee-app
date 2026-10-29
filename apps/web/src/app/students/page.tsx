"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import NextLink from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { ImportDialog } from "@/components/students/ImportDialog";
import { StudentList } from "@/components/students/StudentList";
import { copy, fill } from "@/lib/copy";
import { useSession } from "@/lib/useSession";

/** Everyone at the centre. */
export default function StudentsPage() {
  const { token, centre } = useSession();
  const t = copy.students;
  const [importing, setImporting] = useState(false);
  // Bumped after an import, so the list loads again.
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <AppShell current="students" centre={centre}>
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap" }}>
          <Stack spacing={0.75}>
            <Typography variant="h3" component="h1">
              {t.title}
            </Typography>
            <Typography color="text.secondary">{t.lead}</Typography>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => setImporting(true)}>
              {t.importButton}
            </Button>
            <Button component={NextLink} href="/students/new" variant="contained">
              {t.add}
            </Button>
          </Stack>
        </Stack>
        {token && <StudentList key={version} token={token} />}
        {token && importing && (
          <ImportDialog
            token={token}
            onClose={() => setImporting(false)}
            onImported={(count) => {
              setImporting(false);
              setVersion((v) => v + 1);
              setNotice(fill(t.imported, { count }));
            }}
          />
        )}
        <Snackbar
          open={notice !== null}
          autoHideDuration={4000}
          onClose={() => setNotice(null)}
          message={notice}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </Stack>
    </AppShell>
  );
}
