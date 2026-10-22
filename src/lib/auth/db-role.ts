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
 * the second wall, and the only wall on DocumentAccessEvent. ActAttribution (Phase 2a, ADR 0034 D12) is the same: its trigger is migration
 * `20261007130200_act_attribution_append_only`. SulitAccessEvent arrives in Phase 3a: listed now so it is revoked the
 * first time this runs after it exists. SignInEventDetail is here per ruling O-1: the operator's purge runs as the owner, never the app.
 * Phase 4d adds a supplier's acknowledgement of an addendum, the inspection log of the tender documents and the notice of non-award (migration `20261016090000_my_bids`).
 * Wave 3a (SR-10) adds every attempt at paying a purchase and every download of a released file (migration `20261102100000_sr10_online_purchase_payment_simulator`).
 * Wave 3b (SR-13, ADR 0036 D12) adds the sealed access log and the recorded changes of a published exercise key (migration `20261103110000_sr13_sealed_tables_triggers`).
 * The one-submission registration (ADR 0041, security audit L2) adds the codes held on an online application's certificates (migration `20261117001000_one_submission_registration`).
 * The Project workspace (ADR 0042 D1) adds a document's versions, its requests and the decisions on its versions (migration `20261122000100_project_workspace`).
 */
export const APPEND_ONLY_TABLES = ["AuditEntry", "SignInEvent", "SignInEventDetail", "ActAttribution", "SulitAccessEvent", "DocumentAccessEvent", "RegistrationDeclaration", "AddendumAcknowledgement", "TenderInspectionEvent", "NonAwardNotice", "PaymentAttempt", "PurchaseDownload", "SealedAccessEvent", "PublishedKeyChange", "PortalApplicationValue", "ProjectDocumentVersion", "ProjectDocumentRequest", "ProjectDocumentDecision"] as const;

/**
 * Stored document bytes (OD-9). A trigger refuses UPDATE and TRUNCATE for every login (migration `20261007120000_blob_content_kept`);
 * the grants are the second wall. DELETE stays: an orphan the report lists (bytes no version points at) may be cleared, and a referenced
 * blob is held by DocumentVersion's foreign key (RESTRICT).
 */
export const CONTENT_TABLES = ["BlobContent"] as const;

/**
 * The rest of the online sealed-bid tables (wave 3b, ADR 0036 D12). Their rows change only as their triggers allow (a shred sets a column to NULL, a status moves
 * forward, a lockout counter moves), and are never removed: a trigger refuses DELETE and TRUNCATE for every login (migration
 * `20261103110000_sr13_sealed_tables_triggers`), and the grants are the second wall. UPDATE stays, for the moves the triggers allow.
 */
export const SEALED_TABLES = ["BidSealingPolicy", "OfficerExerciseKey", "ExerciseSealingKey", "ExerciseKeyShare", "ShareRelease", "OnlineBidFile", "OnlineBid", "OnlineBidPart", "OfficerDekGrant", "SealedEstimateLodgement"] as const;

/**
 * What a stranger's registration holds (ADR 0041 D2, D8; security audit L2): the certificates and bank details held on an online application, and the spent form tokens. Their rows
 * change only as their triggers allow (the officer's check, once; the erasure on set aside; a token set to its application once) and are never removed: a trigger refuses DELETE and
 * TRUNCATE for every login (migration `20261117001000_one_submission_registration`), and the grants are the second wall. UPDATE stays, for the moves the triggers allow.
 */
export const HELD_APPLICATION_TABLES = ["PortalApplicationDocument", "PortalApplicationCreditor", "PortalFormToken"] as const;

/**
 * The Project workspace's two tables with one write-once change each (ADR 0042 D1): a document, whose kind is set once from null, and an approver, removed once with a reason. Their rows
 * change only as their triggers allow and are never removed: a trigger refuses DELETE and TRUNCATE for every login (migration `20261122000100_project_workspace`), and the grants are the
 * second wall. UPDATE stays, for the one change each trigger allows.
 */
export const PROJECT_WRITE_ONCE_TABLES = ["ProjectDocument", "ProjectDocumentApprover"] as const;

/// Prisma's own bookkeeping. The app has no business reading or writing it.
export const MIGRATIONS_TABLE = "_prisma_migrations";

/**
 * Every right the app's login must not hold, by table, in the order `grantStatements` revokes them. `revoke` is what the script takes
 * away; `held` is what the runtime check asks the database about (any one of them held makes the login unsafe). One list, so the
 * grants and the check cannot drift apart.
 */
export const WITHHELD: readonly { table: string; revoke: string; held: string }[] = [
  { table: MIGRATIONS_TABLE, revoke: "ALL", held: "SELECT, INSERT, UPDATE, DELETE, TRUNCATE" },
  ...APPEND_ONLY_TABLES.map((table) => ({ table, revoke: "UPDATE, DELETE, TRUNCATE", held: "UPDATE, DELETE, TRUNCATE" })),
  ...CONTENT_TABLES.map((table) => ({ table, revoke: "UPDATE, TRUNCATE", held: "UPDATE, TRUNCATE" })),
  ...SEALED_TABLES.map((table) => ({ table, revoke: "DELETE, TRUNCATE", held: "DELETE, TRUNCATE" })),
  ...HELD_APPLICATION_TABLES.map((table) => ({ table, revoke: "DELETE, TRUNCATE", held: "DELETE, TRUNCATE" })),
  ...PROJECT_WRITE_ONCE_TABLES.map((table) => ({ table, revoke: "DELETE, TRUNCATE", held: "DELETE, TRUNCATE" })),
  // N6 review: the figure's version row is immutable. Overwriting or deleting it needs no SELECT on the figure and writes no log row, so the app does neither (the app only inserts versions).
  { table: "CompanyEstimateVersion", revoke: "UPDATE, DELETE, TRUNCATE", held: "UPDATE, DELETE, TRUNCATE" },
];

/// Columns no app login may read (ruling 20ch, threat model F10). The company estimate's figure is read only through FIGURE_READER, which logs every read.
export const WALLED_COLUMNS: readonly { table: string; column: string }[] = [{ table: "CompanyEstimateVersion", column: "value" }];

/// The database's logged reader of the walled figure (migration `20261113000000_estimate_figure_wall`). SECURITY DEFINER: EXECUTE is granted to the app role by `db:roles`, never to PUBLIC.
export const FIGURE_READER = { name: "read_company_estimate_figure", args: "text, text, text, text, text, text" } as const;

/// The walled tables, each with its walled columns, in first-listed order.
export function walledByTable(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const w of WALLED_COLUMNS) out.set(w.table, [...(out.get(w.table) ?? []), w.column]);
  return out;
}

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
export function grantStatements(input: {
  role: string;
  owner: string;
  schema: string;
  database: string;
  existing: ReadonlySet<string>;
  /// The columns of each WALLED_COLUMNS table as the database lists them now (pg_attribute, attnum > 0, not dropped). Read at run time, never a literal.
  columns: ReadonlyMap<string, readonly string[]>;
  /// The figure reader function exists (to_regprocedure is not null).
  figureReaderPresent: boolean;
}): string[] {
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
  for (const w of WITHHELD) {
    if (input.existing.has(w.table)) statements.push(`REVOKE ${w.revoke} ON TABLE ${table(w.table)} FROM ${role}`);
  }
  // Ruling 20ch (threat model F10, N6): a walled column is unreadable to the app. The table-level SELECT the broad grant gave is taken away, then any stray grant of the walled
  // column itself, and every other column is granted back by name. A table whose columns were not read gets no column GRANT: it stays unreadable rather than guessed at.
  for (const [name, walled] of walledByTable()) {
    if (!input.existing.has(name)) continue;
    // PUBLIC as well as the role: the runtime check counts a grant through PUBLIC, so db:roles must be able to clear it.
    statements.push(`REVOKE SELECT ON TABLE ${table(name)} FROM PUBLIC`, `REVOKE SELECT ON TABLE ${table(name)} FROM ${role}`);
    for (const column of walled) statements.push(`REVOKE SELECT (${quoteIdent(column)}) ON TABLE ${table(name)} FROM PUBLIC`, `REVOKE SELECT (${quoteIdent(column)}) ON TABLE ${table(name)} FROM ${role}`);
    const readable = [...new Set(input.columns.get(name) ?? [])].filter((c) => !walled.includes(c)).sort();
    if (readable.length > 0) statements.push(`GRANT SELECT (${readable.map(quoteIdent).join(", ")}) ON TABLE ${table(name)} TO ${role}`);
  }
  if (input.figureReaderPresent) statements.push(`GRANT EXECUTE ON FUNCTION ${schema}.${quoteIdent(FIGURE_READER.name)}(${FIGURE_READER.args}) TO ${role}`);
  // Wave 3b security audit 1: no temporary tables. A temporary table named like a real one could stand in for it in a function that resolves names through the
  // search path; the trigger functions are fixed to the public schema (migration 20261103200000), and this is the second wall. PUBLIC holds TEMPORARY on every
  // database by default, so it is taken from PUBLIC as well as from the role. The owner, a superuser in development, keeps it.
  const database = quoteIdent(input.database);
  statements.push(`REVOKE TEMPORARY ON DATABASE ${database} FROM PUBLIC`, `REVOKE TEMPORARY ON DATABASE ${database} FROM ${role}`);
  return statements;
}

/// The protected tables this run could not revoke on because they do not exist yet, for the operator's report.
export const notYetPresent = (existing: ReadonlySet<string>) => [...APPEND_ONLY_TABLES, ...CONTENT_TABLES, ...SEALED_TABLES, ...HELD_APPLICATION_TABLES, ...PROJECT_WRITE_ONCE_TABLES].filter((t) => !existing.has(t));

// ------------------------------------------------------------------ who the running app is

export interface RuntimeRoleFacts {
  /// The login the app is connected as.
  name: string;
  /// A superuser, or a member of one (it could SET ROLE to it).
  isSuperuser: boolean;
  /// The login owns (or is a member of the owner of) a table in the app's schema, or the schema itself. An owner can drop a trigger.
  ownsSchemaObjects: boolean;
  /// The WITHHELD tables on which the login (or a role it is a member of, or PUBLIC) still holds a right it should not, sorted. Empty
  /// when the grants are as `db:roles` leaves them. A role made by hand with broad grants, or a table added since `db:roles` last ran,
  /// shows here.
  withheldHeld: string[];
  /// The login (or a role it is a member of, or PUBLIC) still holds TEMPORARY on the database: it can make temporary tables. `db:roles` takes it away (wave 3b security audit 1, build plan step 19).
  temporaryHeld: boolean;
  /// The login (or a role it is a member of, or PUBLIC) can SELECT a WALLED_COLUMNS column directly: `db:roles` has not run since the wall (ruling 20ch, N6). A table not made yet reads false.
  estimateFigureReadable: boolean;
  /// The login (or a role it is a member of, or PUBLIC) can EXECUTE the logged figure reader. False when it cannot or the function is absent: lodging an online estimate and finalising an opening then fail. `db:roles` grants it (N6 review).
  figureReaderCallable: boolean;
}

export type RuntimeRoleReason = "SUPERUSER" | "OWNER" | "TRAIL_WRITABLE" | "FIGURE_READABLE" | "TEMPORARY_HELD" | "FIGURE_READER_UNCALLABLE";

/// The reasons that warn and never refuse sign-in, even in production. Each is a second wall: TEMPORARY behind the pinned search_path (step 19), the figure behind the
/// client's omit and explicit selects (N6, J1). LIVE refuses both instead (`liveIssueFaults`).
export const WARNING_ONLY_REASONS: readonly RuntimeRoleReason[] = ["FIGURE_READABLE", "TEMPORARY_HELD", "FIGURE_READER_UNCALLABLE"];
export const warnsOnly = (reason: RuntimeRoleReason): boolean => WARNING_ONLY_REASONS.includes(reason);

export type RuntimeRoleVerdict =
  | { safe: true }
  | { safe: false; reason: RuntimeRoleReason; name: string; refuseSignIn: boolean; tables: string[] };

/**
 * Whether the running app's login is the separate app role it should be. In production a login that is owner or superuser refuses
 * every sign-in: the trail's grants would mean nothing, and a stolen session could reach DDL. So does a separate login that still holds
 * UPDATE, DELETE or TRUNCATE on the trail (or a right on Prisma's table, or UPDATE on stored bytes): DocumentAccessEvent has no trigger,
 * so its grants are its only wall. In development the app still runs (the founder's copy runs as the owner until he sets the role up)
 * and the accounts screen says so. Precedence: superuser, then owner, then the grants, then the two warnings (the figure, then TEMPORARY).
 */
export function runtimeRoleVerdict(facts: RuntimeRoleFacts, production: boolean): RuntimeRoleVerdict {
  const unsafe = (reason: RuntimeRoleReason) => ({ safe: false as const, reason, name: facts.name, refuseSignIn: production, tables: facts.withheldHeld });
  if (facts.isSuperuser) return unsafe("SUPERUSER");
  if (facts.ownsSchemaObjects) return unsafe("OWNER");
  if (facts.withheldHeld.length > 0) return unsafe("TRAIL_WRITABLE");
  // A warning, never a refusal (N6, J1): the figure's wall is a second wall, and LIVE is where it is enforced.
  if (facts.estimateFigureReadable) return { safe: false, reason: "FIGURE_READABLE", name: facts.name, refuseSignIn: false, tables: [] };
  // A warning, never a refusal (step 19): TEMPORARY is the second wall behind the pinned search_path every sealed trigger function carries. The refusal is kept for a wall that stands alone.
  if (facts.temporaryHeld) return { safe: false, reason: "TEMPORARY_HELD", name: facts.name, refuseSignIn: false, tables: [] };
  // A warning, never a refusal: the reader is a hard dependency of lodging and finalising, and an availability fault, not a leak.
  if (!facts.figureReaderCallable) return { safe: false, reason: "FIGURE_READER_UNCALLABLE", name: facts.name, refuseSignIn: false, tables: [] };
  return { safe: true };
}

/// What the screen and the server log say about each reason. Words, never the code.
export const RUNTIME_ROLE_WORDS: Record<RuntimeRoleReason, string> = {
  SUPERUSER: "the database superuser, not as the app's own database role, so nothing but the trail's triggers stops a change to the audit trail or the sign-in log",
  OWNER: "the owner of the tables, not as the app's own database role, so nothing but the trail's triggers stops a change to the audit trail or the sign-in log",
  TRAIL_WRITABLE: "a login that can still change or remove records the app should only add to (the audit trail, the sign-in log, document access history or stored document content), remove sealed bid records, or reach the migration history",
  FIGURE_READABLE: "a login that can still read the company estimate's figure directly, so npm run db:roles has not run on this database since the figure was walled off",
  TEMPORARY_HELD: "a login that can still make temporary tables, so npm run db:roles has not run on this database since the sealed-bid hardening, which takes that right away",
  FIGURE_READER_UNCALLABLE: "a login that cannot call the company estimate's logged reader, so lodging an online estimate and finalising an opening will fail until npm run db:roles has run on this database",
};
