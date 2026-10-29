"use client";

import { describeFeePlan, formatDays, formatTimeRange } from "@chukta/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import app from "@/components/app/app.module.css";
import styles from "@/components/batches/batches.module.css";
import { listBatches, type Batch } from "@/lib/api";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/useSession";

/** Web 1 / Mobile 1 · Batches list from the Batches design canvas. */
export default function BatchesPage() {
  const { token, centre } = useSession();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [view, setView] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped by "Try again" to reload.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // One request for both tabs, so both counts are known.
    listBatches(token, { status: "all" })
      .then((result) => !cancelled && setBatches(result.batches))
      // Never show a failed load as an empty (or stale) list: say so, and offer a retry.
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const active = batches?.filter((b) => b.isActive) ?? [];
  const archived = batches?.filter((b) => !b.isActive) ?? [];
  const needle = query.trim().toLowerCase();
  const shown = (view === "active" ? active : archived).filter(
    (b) => !needle || b.name.toLowerCase().includes(needle) || b.subject?.toLowerCase().includes(needle),
  );

  return (
    <AppShell current="batches" centre={centre}>
      <div className={app.pageHeader}>
        <div className={app.titleGroup}>
          <h1 className={app.title}>Batches</h1>
          {batches && <p className={app.subtitle}>{active.length} active</p>}
        </div>
        <div className={styles.headerActions}>
          <Link href="/fee-plans" className={app.secondaryButton}>
            {copy.feePlans.title}
          </Link>
          <Link href="/batches/new" className={app.primaryButton}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New batch
          </Link>
        </div>
      </div>

      <section className={app.panel} aria-label="Your batches">
        <div className={styles.toolbar}>
          <div role="group" aria-label="Show" className={styles.pills}>
            <button type="button" className={styles.pill} aria-pressed={view === "active"} onClick={() => setView("active")}>
              Active · {active.length}
            </button>
            <button type="button" className={styles.pill} aria-pressed={view === "archived"} onClick={() => setView("archived")}>
              Archived · {archived.length}
            </button>
          </div>
          <label className={styles.search}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className={styles.visuallyHidden}>Search batches</span>
            <input type="search" placeholder="Search batches or subjects" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        {loadFailed ? (
          <div className={styles.loadError}>
            <p role="alert" className={styles.empty}>
              We couldn&apos;t load your batches. Check your connection and try again.
            </p>
            <button
              type="button"
              className={app.secondaryButton}
              onClick={() => {
                setLoadFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : batches === null ? (
          <p className={styles.empty} aria-live="polite">
            Loading…
          </p>
        ) : batches.length === 0 ? (
          <p className={styles.empty}>No batches yet. Add your first batch to start enrolling students.</p>
        ) : shown.length === 0 ? (
          <p className={styles.empty}>
            {needle ? `No batches match “${query.trim()}”.` : view === "archived" ? "No archived batches." : "No active batches."}
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Batch</th>
                <th scope="col">Schedule</th>
                <th scope="col">
                  <span className={styles.visuallyHidden}>Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <Link href={`/batches/edit?id=${batch.id}`} className={styles.batchName}>
                      {batch.name}
                    </Link>
                    {batch.subject && <span className={styles.secondary}>{batch.subject}</span>}
                    {batch.feePlan && <span className={styles.secondary}>{describeFeePlan(batch.feePlan)}</span>}
                    {!batch.isActive && <span className={styles.archived}>Archived</span>}
                  </td>
                  <td>
                    <span>{formatDays(batch.days)}</span>
                    <span className={styles.secondary}>{formatTimeRange(batch.startTime, batch.endTime)}</span>
                  </td>
                  <td>
                    <Link href={`/batches/edit?id=${batch.id}`} className={styles.open} aria-label={`Open ${batch.name}`} tabIndex={-1}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}
