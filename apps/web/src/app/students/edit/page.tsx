"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { StudentDetail } from "@/components/students/StudentDetail";
import { useSession } from "@/lib/useSession";

/** One student: /students/edit?id=… (a query parameter, as the site is a static export). */
function EditStudent() {
  const id = useSearchParams().get("id") ?? "";
  const { token, centre } = useSession();
  return (
    <AppShell current="students" centre={centre}>
      {token && <StudentDetail token={token} id={id} />}
    </AppShell>
  );
}

export default function EditStudentPage() {
  return (
    // useSearchParams needs a Suspense boundary in a statically exported page.
    <Suspense fallback={null}>
      <EditStudent />
    </Suspense>
  );
}
