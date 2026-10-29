"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { StudentList } from "@/components/students/StudentList";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/useSession";

/** Everyone at the centre. */
export default function StudentsPage() {
  const { token, centre } = useSession();
  const t = copy.students;

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
          <Button component={NextLink} href="/students/new" variant="contained">
            {t.add}
          </Button>
        </Stack>
        {token && <StudentList token={token} />}
      </Stack>
    </AppShell>
  );
}
