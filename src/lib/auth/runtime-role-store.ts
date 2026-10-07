import { db } from "@/lib/db";

import { runtimeRoleVerdict, type RuntimeRoleFacts, type RuntimeRoleVerdict } from "./db-role";

/**
 * Who the running app is connected as (ADR 0034 D11, Phase 1d `assertRuntimeRole`). Asked once per process, at startup from
 * `src/instrumentation.ts` and again by sign-in, which refuses in production while the answer is owner or superuser. A change of
 * DATABASE_URL needs a restart anyway, so the answer is kept for the life of the process; a failed query is not kept.
 */
type Client = Pick<typeof db, "$queryRaw">;

export async function readRuntimeRole(client: Client = db): Promise<RuntimeRoleFacts> {
  // Membership counts, not just the role itself: a member of the owner (or of a superuser) can SET ROLE to it and drop a trigger,
  // whether or not it inherits. So both tests use pg_has_role MEMBER, never USAGE (the app role is NOINHERIT, for which USAGE is false).
  const rows = await client.$queryRaw<{ name: string; isSuperuser: boolean; ownsSchemaObjects: boolean }[]>`
    SELECT current_user::text AS "name",
           (r.rolsuper OR EXISTS (SELECT 1 FROM pg_roles s WHERE s.rolsuper AND pg_has_role(current_user, s.oid, 'MEMBER'))) AS "isSuperuser",
           (EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p') AND pg_has_role(current_user, c.relowner, 'MEMBER'))
            OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = current_schema() AND pg_has_role(current_user, n.nspowner, 'MEMBER'))) AS "ownsSchemaObjects"
      FROM pg_roles r WHERE r.rolname = current_user`;
  const row = rows[0];
  if (!row) throw new Error("The database did not report the current login.");
  return row;
}

const kept = globalThis as unknown as { perolehanRuntimeRole?: Promise<RuntimeRoleVerdict> };

export function runtimeRoleCheck(): Promise<RuntimeRoleVerdict> {
  if (!kept.perolehanRuntimeRole) {
    const asked = readRuntimeRole().then((facts) => runtimeRoleVerdict(facts, process.env.NODE_ENV === "production"));
    kept.perolehanRuntimeRole = asked;
    asked.catch(() => {
      if (kept.perolehanRuntimeRole === asked) kept.perolehanRuntimeRole = undefined;
    });
  }
  return kept.perolehanRuntimeRole;
}

/// At start-up (`src/instrumentation.ts`): one line in the server log when the app is not running as its own role. Never throws.
export async function reportRuntimeRole(): Promise<void> {
  try {
    const verdict = await runtimeRoleCheck();
    if (verdict.safe) return;
    const what = verdict.reason === "SUPERUSER" ? "a superuser" : "the owner of the tables";
    console.warn(
      `[perolehan] The app is connected to the database as "${verdict.name}", ${what}. ` +
        (verdict.refuseSignIn ? "Sign-in is refused until DATABASE_URL names the app role (npm run db:roles)." : "Allowed in development only. See the README, Running in production."),
    );
  } catch (error) {
    console.warn("[perolehan] Could not ask the database which login the app runs as:", error instanceof Error ? error.message : error);
  }
}

/// For sign-in: true when this process must refuse every sign-in because it runs as the owner or a superuser in production.
export async function signInRefusedForRole(): Promise<boolean> {
  const verdict = await runtimeRoleCheck();
  return !verdict.safe && verdict.refuseSignIn;
}
