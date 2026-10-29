"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { BatchDetail } from "@/components/batches/BatchDetail";
import { useSession } from "@/lib/useSession";

/** One batch: /batches/view?id=… (a query parameter, as the site is a static export). */
function ViewBatch() {
  const id = useSearchParams().get("id") ?? "";
  const { token, centre } = useSession();
  return (
    <AppShell current="batches" centre={centre}>
      {token && <BatchDetail token={token} id={id} />}
    </AppShell>
  );
}

export default function ViewBatchPage() {
  return (
    // useSearchParams needs a Suspense boundary in a statically exported page.
    <Suspense fallback={null}>
      <ViewBatch />
    </Suspense>
  );
}
