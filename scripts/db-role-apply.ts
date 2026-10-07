import { grantStatements, notYetPresent, ROLE_ATTRIBUTES, roleNameFault, type RoleNameFault } from "../src/lib/auth/db-role";

/**
 * Makes (or brings back into line) the app's database login and its grants in ONE database (ADR 0034 D11). Run by `scripts/db-roles.ts`
 * as the owner after every `migrate deploy`, and by the database tests for a role of their own. The role is cluster-wide; the grants are
 * per database, so a cluster holding several databases runs this once in each.
 *
 * Runs inside the caller's transaction (`sql`), so the role, its attributes and every grant land together or not at all.
 * `password` null makes a role that cannot log in (the tests reach it with SET ROLE). The password is quoted by the database (`format %L`)
 * and is never logged here. A server with statement logging on may still write the statement to its own log: turn that off while this runs.
 */
/// One transaction's raw access: a Prisma transaction client fits it.
export interface SqlClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export type ApplyOutcome =
  | { ok: true; database: string; owner: string; created: boolean; notYetPresent: string[] }
  | { ok: false; fault: RoleNameFault; database: string; owner: string };

export async function applyAppRole(sql: SqlClient, input: { role: string; password: string | null }): Promise<ApplyOutcome> {
  const rows = <T>(text: string, ...values: unknown[]) => sql.$queryRawUnsafe<T[]>(text, ...values);
  const [who] = await rows<{ owner: string; database: string; schema: string }>(`SELECT current_user::text AS owner, current_database()::text AS database, current_schema()::text AS schema`);
  const fault = roleNameFault(input.role, who.owner);
  if (fault) return { ok: false, fault, database: who.database, owner: who.owner };

  const exists = (await rows(`SELECT 1 FROM pg_roles WHERE rolname = $1`, input.role)).length > 0;
  const attributes = input.password === null ? ROLE_ATTRIBUTES.replace(/^LOGIN/, "NOLOGIN") : ROLE_ATTRIBUTES;
  // %I and %L are filled by the database, so neither the name nor the password is ever spliced into SQL here. PASSWORD NULL when there is none.
  const [role] = await rows<{ ddl: string }>(`SELECT format('${exists ? "ALTER" : "CREATE"} ROLE %I WITH ${attributes} PASSWORD %L', $1::text, $2::text) AS ddl`, input.role, input.password);
  await sql.$executeRawUnsafe(role.ddl);
  const [connect] = await rows<{ ddl: string }>(`SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), $1::text) AS ddl`, input.role);
  await sql.$executeRawUnsafe(connect.ddl);

  const existing = new Set((await rows<{ name: string }>(`SELECT tablename::text AS name FROM pg_tables WHERE schemaname = current_schema()`)).map((r) => r.name));
  for (const statement of grantStatements({ role: input.role, owner: who.owner, schema: who.schema, existing })) await sql.$executeRawUnsafe(statement);
  return { ok: true, database: who.database, owner: who.owner, created: !exists, notYetPresent: notYetPresent(existing) };
}
