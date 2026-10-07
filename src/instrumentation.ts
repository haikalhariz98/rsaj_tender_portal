/**
 * Runs once when a server starts (Next.js instrumentation). Phase 1d: says, before the first request, whether the app is connected to
 * the database as its own role or as the owner or a superuser (ADR 0034 D11). It only reports: sign-in itself refuses in production
 * (`src/lib/auth/runtime-role-store.ts`), and in development the accounts screen says so.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runtimeRoleCheck } = await import("@/lib/auth/runtime-role-store");
  try {
    const verdict = await runtimeRoleCheck();
    if (!verdict.safe) {
      const what = verdict.reason === "SUPERUSER" ? "a superuser" : "the owner of the tables";
      console.warn(
        `[perolehan] The app is connected to the database as "${verdict.name}", ${what}. ` +
          (verdict.refuseSignIn ? "Sign-in is refused until DATABASE_URL names the app role (npm run db:roles)." : "Allowed in development only. See the README, Running in production."),
      );
    }
  } catch (error) {
    console.warn("[perolehan] Could not ask the database which login the app runs as:", error instanceof Error ? error.message : error);
  }
}
