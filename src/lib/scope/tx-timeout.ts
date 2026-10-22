/**
 * Whether a write failed because its transaction ran out of time. Pure.
 *
 * Prisma reports both an interactive transaction that outlived its `timeout` and one that
 * could not start within `maxWait` as P2028 (observed on Prisma 7 with the pg adapter:
 * `meta.timeout` and `meta.timeTaken`). Either way the transaction rolled back and nothing
 * was saved, so the act says that in a fixed sentence rather than showing an error page.
 */
export function transactionTimedOut(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2028";
}

type Cause = { originalCode?: unknown; code?: unknown };

/**
 * Whether a write failed because the database chose its transaction as a deadlock's victim (SQLSTATE 40P01), or Prisma reported a write conflict (P2034). Pure.
 *
 * Observed on Prisma 7 with the pg adapter (review MUST 1, the organisation lock's race test): a raw query answers P2010 with the SQLSTATE in
 * `meta.driverAdapterError.cause.originalCode`; a model query carries the adapter's error as its `cause`. Either way the transaction rolled back and nothing was saved.
 */
export function deadlocked(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const x = e as { code?: unknown; meta?: { driverAdapterError?: { cause?: Cause } }; cause?: Cause & { cause?: Cause } };
  if (x.code === "P2034") return true;
  const causes = [x.meta?.driverAdapterError?.cause, x.cause, x.cause?.cause];
  return causes.some((c) => c != null && (c.originalCode === "40P01" || c.code === "40P01"));
}
