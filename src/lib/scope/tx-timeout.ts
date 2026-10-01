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
