"use client";

import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { StudentForm } from "@/components/students/StudentForm";
import { createStudent, listBatches } from "@/lib/api";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/useSession";

/** Add a student, and put them in batches straight away. */
export default function NewStudentPage() {
  const router = useRouter();
  const { token, centre } = useSession();
  const t = copy.students;
  const [batches, setBatches] = useState<{ id: string; name: string }[] | null>(null);

  useEffect(() => {
    if (!token) return;
    listBatches(token, { status: "active" }).then(
      ({ batches: found }) => setBatches(found),
      () => setBatches([]),
    );
  }, [token]);

  return (
    <AppShell current="students" centre={centre}>
      <Stack spacing={3} sx={{ maxWidth: 640 }}>
        <Typography variant="h3" component="h1">
          {t.newTitle}
        </Typography>
        {token && batches && (
          <Card sx={{ p: { xs: 2, md: 3 } }}>
            <StudentForm
              batches={batches}
              submitLabel={t.add}
              onSubmit={async (input) => {
                await createStudent(token, { ...input, batchIds: input.batchIds ?? [] });
                router.push("/students");
              }}
              onCancel={() => router.push("/students")}
            />
          </Card>
        )}
      </Stack>
    </AppShell>
  );
}
