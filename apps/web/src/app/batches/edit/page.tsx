"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import app from "@/components/app/app.module.css";
import { BatchForm } from "@/components/batches/BatchForm";
import styles from "@/components/batches/batches.module.css";
import { archiveBatch, getBatch, updateBatch, type Batch } from "@/lib/api";
import { useSession } from "@/lib/useSession";

/**
 * Edit, archive or restore one batch: /batches/edit?id=… (a query parameter, as the
 * site is a static export). The design's batch detail page arrives with students.
 */
function EditBatch() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const { token, centre } = useSession();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [missing, setMissing] = useState(!id);

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    getBatch(token, id)
      .then((found) => !cancelled && setBatch(found))
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  const backToList = () => router.push("/batches");

  return (
    <AppShell current="batches" centre={centre}>
      <section className={`${app.panel} ${styles.formPanel}`}>
        <header className={styles.formHeader}>
          <Link href="/batches" className={styles.close} aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          <h1 className={styles.formTitle}>Edit batch</h1>
        </header>

        {missing ? (
          <>
            <p className={app.muted}>{"We couldn't find that batch."}</p>
            <Link href="/batches" className={app.secondaryButton}>
              Back to batches
            </Link>
          </>
        ) : !batch ? (
          <p className={app.muted} aria-live="polite">
            Loading…
          </p>
        ) : (
          <>
            <BatchForm
              initial={batch}
              submitLabel="Save changes"
              onSave={async (input) => {
                await updateBatch(token!, batch.id, input);
                backToList();
              }}
            />
            <div className={styles.archiveRow}>
              {batch.isActive ? (
                <>
                  <p className={app.muted}>Archive a batch you no longer run. Its history is kept.</p>
                  <button
                    type="button"
                    className={app.secondaryButton}
                    onClick={async () => {
                      await archiveBatch(token!, batch.id);
                      backToList();
                    }}
                  >
                    Archive batch
                  </button>
                </>
              ) : (
                <>
                  <p className={app.muted}>This batch is archived.</p>
                  <button
                    type="button"
                    className={app.secondaryButton}
                    onClick={async () => {
                      await updateBatch(token!, batch.id, { isActive: true });
                      backToList();
                    }}
                  >
                    Restore batch
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}

export default function EditBatchPage() {
  // useSearchParams needs a Suspense boundary in a statically exported page.
  return (
    <Suspense fallback={null}>
      <EditBatch />
    </Suspense>
  );
}
