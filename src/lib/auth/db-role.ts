/**
 * The running app's own database login (ADR 0034 D11, Phase 1d): neither owner nor superuser, ordinary reads and writes on every
 * table, and no UPDATE, DELETE or TRUNCATE on the trail. Pure: this builds the statements and judges what the database reports;
 * `scripts/db-roles.ts` runs them, and `runtime-role-store.ts` asks the database who the app is running as.
 *
 * The role is not made in a migration: `CREATE ROLE` is cluster-wide, so it would break the shadow-database replay, and a password
 * written into a migration is a hard-coded secret. The password comes from the environment and is quoted by the database itself.
 */

/// The default name of the app's login. A deployment may name its own (APP_DB_ROLE).
export const APP_ROLE_DEFAULT = "perolehan_app";

/**
 * The tables the app may only add to. A trigger already refuses UPDATE and DELETE on the first three for every login; the grants are
 * the second wall, and the only wall on DocumentAccessEvent. SulitAccessEvent arrives in Phase 3a: listed now so it is revoked the
 * first time this runs after it exists. SignInEventDetail is here per ruling O-1: the operator's purge runs as the owner, never the app.
 */
export const APPEND_ONLY_TABLES = ["AuditEntry", "SignInEvent", "SignInEventDetail", "SulitAccessEvent", "DocumentAccessEvent"] as const;

/// Prisma's own bookkeeping. The app has no business reading or writing it.
export const MIGRATIONS_TABLE = "_prisma_migrations";

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

export type RoleNameFault = "ROLE_NAME_INVALID" | "ROLE_IS_OWNER";

/// A role name is used as an identifier in DDL, so only a plain lower-case name is accepted. It must not be the login that owns the
/// tables: the script alters the role it is given to NOSUPERUSER, and doing that to the owner would lock the operator out.
export function roleNameFault(role: string, owner: string): RoleNameFault | null {
  if (!IDENTIFIER.test(role)) return "ROLE_NAME_INVALID";
  if (role === owner) return "ROLE_IS_OWNER";
  return null;
}

/// The attributes the role always ends up with, whether it was just made or already stood. NOINHERIT so membership granted to it by
/// hand later cannot quietly widen what it holds.
export const ROLE_ATTRIBUTES = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS";

/**
 * The grants, in order, for one database. Safe to run again: GRANT and REVOKE are idempotent, and the revokes come after the broad
 * grant so a re-run never leaves the trail writable. `existing` is the tables that exist now (by name); a listed table that does not
 * exist yet is skipped and picked up on the next run. Default privileges make tables created later by `owner` readable and writable at
 * once, so a new append-only table is writable until this runs again: run it after every `migrate deploy`.
 */
export function grantStatements(input: { role: string; owner: string; schema: string; existing: ReadonlySet<string> }): string[] {
  const role = quoteIdent(input.role);
  const owner = quoteIdent(input.owner);
  const schema = quoteIdent(input.schema);
  const table = (name: string) => `${schema}.${quoteIdent(name)}`;
  const statements = [
    `GRANT USAGE ON SCHEMA ${schema} TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
  ];
  if (input.existing.has(MIGRATIONS_TABLE)) statements.push(`REVOKE ALL ON TABLE ${table(MIGRATIONS_TABLE)} FROM ${role}`);
  for (const name of APPEND_ONLY_TABLES) {
    if (input.existing.has(name)) statements.push(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ${table(name)} FROM ${role}`);
  }
  return statements;
}

/// The append-only tables this run could not revoke on because they do not exist yet, for the operator's report.
export const notYetPresent = (existing: ReadonlySet<string>) => APPEND_ONLY_TABLES.filter((t) => !existing.has(t));

// ------------------------------------------------------------------ who the running app is

export interface RuntimeRoleFacts {
  /// The login the app is connected as.
  name: string;
  /// A superuser, or a member of one (it could SET ROLE to it).
  isSuperuser: boolean;
  /// The login owns (or is a member of the owner of) a table in the app's schema, or the schema itself. An owner can drop a trigger.
  ownsSchemaObjects: boolean;
}

export type RuntimeRoleVerdict =
  | { safe: true }
  | { safe: false; reason: "SUPERUSER" | "OWNER"; name: string; refuseSignIn: boolean };

/**
 * Whether the running app's login is the separate app role it should be. In production a login that is owner or superuser refuses
 * every sign-in: the trail's grants would mean nothing, and a stolen session could reach DDL. In development the app still runs (the
 * founder's copy runs as the owner until he sets the role up) and the accounts screen says so.
 */
export function runtimeRoleVerdict(facts: RuntimeRoleFacts, production: boolean): RuntimeRoleVerdict {
  if (facts.isSuperuser) return { safe: false, reason: "SUPERUSER", name: facts.name, refuseSignIn: production };
  if (facts.ownsSchemaObjects) return { safe: false, reason: "OWNER", name: facts.name, refuseSignIn: production };
  return { safe: true };
}
