"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import app from "@/components/app/app.module.css";
import { BatchForm } from "@/components/batches/BatchForm";
import styles from "@/components/batches/batches.module.css";
import { createBatch, listFeePlans, type FeePlan } from "@/lib/api";
import { useSession } from "@/lib/useSession";

/** Mobile 3 · New batch, from the Batches design canvas. */
export default function NewBatchPage() {
  const router = useRouter();
  const { token, centre } = useSession();
  const [feePlans, setFeePlans] = useState<FeePlan[]>([]);

  useEffect(() => {
    if (!token) return;
    listFeePlans(token, { status: "active" }).then(({ feePlans: plans }) => setFeePlans(plans), () => undefined);
  }, [token]);

  return (
    <AppShell current="batches" centre={centre}>
      <section className={`${app.panel} ${styles.formPanel}`}>
        <header className={styles.formHeader}>
          <Link href="/batches" className={styles.close} aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          <h1 className={styles.formTitle}>New batch</h1>
        </header>
        <BatchForm
          feePlans={feePlans}
          submitLabel="Create batch"
          onSave={async (input) => {
            if (!token) return;
            await createBatch(token, input);
            router.push("/batches");
          }}
        />
      </section>
    </AppShell>
  );
}
