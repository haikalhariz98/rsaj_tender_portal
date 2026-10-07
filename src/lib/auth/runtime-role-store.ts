import { db } from "@/lib/db";

import { runtimeRoleVerdict, type RuntimeRoleFacts, type RuntimeRoleVerdict } from "./db-role";

/**
 * Who the running app is connected as (ADR 0034 D11, Phase 1d `assertRuntimeRole`). Asked once per process, at startup from
 * `src/instrumentation.ts` and again by sign-in, which refuses in production while the answer is owner or superuser. A change of
 * DATABASE_URL needs a restart anyway, so the answer is kept for the life of the process; a failed query is not kept.
 */
type Client = Pick<typeof db, "$queryRaw">;

export async function readRuntimeRole(client: Client = db): Promise<RuntimeRoleFacts> {
  // Ownership counts membership in the owning role (pg_has_role USAGE), as the database itself does: a member of the owner can drop a trigger.
  const rows = await client.$queryRaw<{ name: string; isSuperuser: boolean; ownsSchemaObjects: boolean }[]>`
    SELECT current_user::text AS "name",
           r.rolsuper AS "isSuperuser",
           (EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p') AND pg_has_role(current_user, c.relowner, 'USAGE'))
            OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = current_schema() AND pg_has_role(current_user, n.nspowner, 'USAGE'))) AS "ownsSchemaObjects"
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

/// For sign-in: true when this process must refuse every sign-in because it runs as the owner or a superuser in production.
export async function signInRefusedForRole(): Promise<boolean> {
  const verdict = await runtimeRoleCheck();
  return !verdict.safe && verdict.refuseSignIn;
}
