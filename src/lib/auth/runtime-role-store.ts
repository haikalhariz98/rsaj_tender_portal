import { db } from "@/lib/db";

import { FIGURE_READER, RUNTIME_ROLE_WORDS, runtimeRoleVerdict, WALLED_COLUMNS, warnsOnly, WITHHELD, type RuntimeRoleFacts, type RuntimeRoleVerdict } from "./db-role";

/**
 * Who the running app is connected as (ADR 0034 D11, Phase 1d `assertRuntimeRole`). Asked once per process, at startup from
 * `src/instrumentation.ts` and again by sign-in, which refuses in production while the answer is owner, superuser, or a login that still
 * holds a right it should not on the trail. A change of DATABASE_URL needs a restart anyway, so the answer is kept for the life of the
 * process (a grant fixed by `db:roles` shows after a restart); a failed query is not kept.
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
  // The grants (Phase 1d review): on each WITHHELD table that exists, does the login, a role it is a member of (it could SET ROLE to
  // it), or PUBLIC hold any right it should not? A table that does not exist yet reads as NULL from to_regclass and is passed over.
  const tables = WITHHELD.map((w) => w.table);
  const rights = WITHHELD.map((w) => w.held);
  const [held] = await client.$queryRaw<{ tables: string[] }[]>`
    SELECT coalesce(array_agg(w.t ORDER BY w.t), '{}')::text[] AS "tables"
      FROM unnest(${tables}::text[], ${rights}::text[]) AS w(t, r)
     WHERE to_regclass(format('%I.%I', current_schema(), w.t)) IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_roles m
                    WHERE pg_has_role(current_user, m.oid, 'MEMBER')
                      AND has_table_privilege(m.oid, to_regclass(format('%I.%I', current_schema(), w.t)), w.r))`;
  // TEMPORARY on this database (build plan step 19): held by the login, by a role it is a member of, or by PUBLIC (every role is a member of PUBLIC, and PUBLIC holds it by default).
  const [temp] = await client.$queryRaw<{ held: boolean }[]>`
    SELECT (EXISTS (SELECT 1 FROM pg_roles m
                     WHERE pg_has_role(current_user, m.oid, 'MEMBER')
                       AND has_database_privilege(m.oid, current_database(), 'TEMPORARY'))
            OR has_database_privilege('public', current_database(), 'TEMPORARY')) AS "held"`;
  // The walled figure (ruling 20ch, N6): can the login, a role it is a member of, or PUBLIC SELECT the column directly? A table not made yet reads NULL from to_regclass and counts as false.
  let estimateFigureReadable = false;
  for (const w of WALLED_COLUMNS) {
    const [col] = await client.$queryRaw<{ held: boolean | null }[]>`
      SELECT coalesce(
               EXISTS (SELECT 1 FROM pg_roles m
                        WHERE pg_has_role(current_user, m.oid, 'MEMBER')
                          AND has_column_privilege(m.oid, to_regclass(format('%I.%I', current_schema(), ${w.table}::text)), ${w.column}::text, 'SELECT'))
               OR has_column_privilege('public', to_regclass(format('%I.%I', current_schema(), ${w.table}::text)), ${w.column}::text, 'SELECT'),
             false) AS "held"
       WHERE to_regclass(format('%I.%I', current_schema(), ${w.table}::text)) IS NOT NULL`;
    if (col?.held) estimateFigureReadable = true;
  }
  // The logged reader (N6 review): finalising and lodging call it, so EXECUTE on it must be held. Absent function reads false.
  const [reader] = await client.$queryRaw<{ callable: boolean | null }[]>`
    SELECT (EXISTS (SELECT 1 FROM pg_roles m
                     WHERE pg_has_role(current_user, m.oid, 'MEMBER')
                       AND has_function_privilege(m.oid, to_regprocedure(format('%I.%I(%s)', current_schema(), ${FIGURE_READER.name}::text, ${FIGURE_READER.args}::text)), 'EXECUTE'))
            OR coalesce(has_function_privilege('public', to_regprocedure(format('%I.%I(%s)', current_schema(), ${FIGURE_READER.name}::text, ${FIGURE_READER.args}::text)), 'EXECUTE'), false)) AS "callable"
     WHERE to_regprocedure(format('%I.%I(%s)', current_schema(), ${FIGURE_READER.name}::text, ${FIGURE_READER.args}::text)) IS NOT NULL`;
  return { ...row, withheldHeld: held?.tables ?? [], temporaryHeld: temp?.held ?? false, estimateFigureReadable, figureReaderCallable: reader?.callable ?? false };
}

/// The facts, not the verdict, are kept (N6, J5): the sign-in verdict and the LIVE conditions both derive from them. Same global key as before.
const kept = globalThis as unknown as { perolehanRuntimeRole?: Promise<RuntimeRoleFacts> };

function ask(): Promise<RuntimeRoleFacts> {
  const asked = readRuntimeRole();
  kept.perolehanRuntimeRole = asked;
  asked.catch(() => {
    if (kept.perolehanRuntimeRole === asked) kept.perolehanRuntimeRole = undefined;
  });
  return asked;
}

/// Who the app runs as, asked once per process. A failed query is not kept, so the next call asks again.
export async function runtimeRoleFacts(): Promise<RuntimeRoleFacts> {
  const held = kept.perolehanRuntimeRole;
  if (!held) return ask();
  const facts = await held;
  // A process that ran the code before N6 kept the verdict under this key, not the facts (next dev keeps globalThis across a reload). That is not an answer: ask again.
  if (typeof (facts as Partial<RuntimeRoleFacts>).estimateFigureReadable !== "boolean" || typeof (facts as Partial<RuntimeRoleFacts>).figureReaderCallable !== "boolean") {
    if (kept.perolehanRuntimeRole === held) return ask();
    return runtimeRoleFacts();
  }
  return facts;
}

/// The verdict, judged on every call from the kept facts and the current NODE_ENV.
export async function runtimeRoleCheck(): Promise<RuntimeRoleVerdict> {
  return runtimeRoleVerdict(await runtimeRoleFacts(), process.env.NODE_ENV === "production");
}

/// At start-up (`src/instrumentation.ts`): one line in the server log when the app is not running as its own role. Never throws.
export async function reportRuntimeRole(): Promise<void> {
  try {
    const verdict = await runtimeRoleCheck();
    if (verdict.safe) return;
    const tables = verdict.reason === "TRAIL_WRITABLE" ? ` It holds rights it should not on: ${verdict.tables.join(", ")}.` : "";
    if (warnsOnly(verdict.reason)) {
      console.warn(`[perolehan] The app is connected to the database as "${verdict.name}", ${RUNTIME_ROLE_WORDS[verdict.reason]}. Sign-in is not refused. Run npm run db:roles, then restart the app.`);
      return;
    }
    console.warn(
      `[perolehan] The app is connected to the database as "${verdict.name}", ${RUNTIME_ROLE_WORDS[verdict.reason]}.${tables} ` +
        (verdict.refuseSignIn ? "Sign-in is refused until DATABASE_URL names the app role with the grants npm run db:roles gives it, and the app is restarted." : "Allowed in development only. See the README, Running in production."),
    );
  } catch (error) {
    console.warn("[perolehan] Could not ask the database which login the app runs as:", error instanceof Error ? error.message : error);
  }
}

/// For sign-in: true when this process must refuse every sign-in because, in production, it runs as the owner or a superuser, or as a
/// login that can still change the trail.
export async function signInRefusedForRole(): Promise<boolean> {
  const verdict = await runtimeRoleCheck();
  return !verdict.safe && verdict.refuseSignIn;
}
