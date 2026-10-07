/**
 * Runs once when a server starts (Next.js instrumentation). Phase 1d: says, before the first request, whether the app is connected to
 * the database as its own role or as the owner or a superuser (ADR 0034 D11). It only reports: sign-in itself refuses in production
 * (`src/lib/auth/runtime-role-store.ts`), and in development the accounts screen says so.
 *
 * The import sits inside the NEXT_RUNTIME test, as the Next.js guide writes it, so that a bundle for the edge runtime leaves the
 * database driver out (an early return would not).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportRuntimeRole } = await import("@/lib/auth/runtime-role-store");
    await reportRuntimeRole();
  }
}
