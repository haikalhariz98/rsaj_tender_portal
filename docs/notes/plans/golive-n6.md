# N6: the sealed company estimate's database wall (threat model F10), with the runtime-role check and a LIVE refusal on TEMPORARY

**Status (2026-10-20): ready to build.** Written by the solution architect for go-live item N6. The source is the product owner's
scope line on decisions-log line 2823 (commit 17f3e6ef). Ruling 20ch (2026-10-17, `docs/notes/design/0003-sourcing-requirements-v2.md:2104`)
set the shape. The candidate control in 20cw (a) (`0003:2247`) is adopted here. This plan declares contracts. The signatures in
section 3 are what the builders write, not code that exists. Nothing here needs the founder, CPD, RSAJ or an outside service.

**No new ADR.** Ruling 20ch is the record for the wall. The judgement calls this plan makes are in section 5, and step 4's builder
copies them into the decisions log.

**One migration, no `schema.prisma` change.** Prisma does not model functions or CHECK constraints, so `migrate diff` stays empty and
`prisma generate` changes nothing. It still runs.

**Restart.** The builders need none. Source reloads under `next dev`, and the migration only adds a function and widens a CHECK. The
founder's step comes later, in two parts:
- run `npm run db:roles` on `perolehan`;
- point `DATABASE_URL` at the app role, then restart the dev server.

`db:roles` alone does not clear the new LIVE fault while the dev server still connects as the owner, because an owner reads every
column. The runtime facts are read once per process, so the restart is what makes the server see the change.

## 1. What exists today

- **The app-level wall (the first wall).**
  - `src/lib/db.ts:6`: `SEALED_OMIT = { companyEstimateVersion: { value: true, reason: true } }` is set on the client. `src/lib/scope/sealed.test.ts:57-58`
    pins it, and it stays.
  - The two readers that un-omit it live in `src/lib/scope/estimate-store.ts`:
    - `readSealedFigures(tx, estimateId)`, line 22: `omit: { value: false, reason: false }`, all versions of one estimate. Its only caller is
      `src/lib/opening/estimate.ts:53` (`discloseAtFinalising`), after the estimate is set DISCLOSED in the same transaction. That in turn
      is called from `src/app/sourcing/[id]/opening/finalise-transaction.ts:145`.
    - `writeSealedLodgement(tx, i)`, line 62: `omit: { value: false, reason: true }` on one version, sealed under the exercise key. It is called from
      `src/app/sourcing/[id]/scope/actions.ts:762` after the estimate is set LODGED in the same transaction.
  - `writeEstimateVersion` (line 36) inserts with `select: { id, versionNo }` and never reads the figure back.
- **Reads that rely on the omit, with no explicit select.**
  - `src/lib/scope/repo.ts:112` `loadEstimates`: `versions: { orderBy, include: { preparer } }`. It is used by `src/lib/opening/repo.ts:136`
    (the source of `c.estimate.versions` at `opening/actions.ts:191`) and `scope/actions.ts:661`.
  - `src/lib/opening/estimate.ts:42` already selects `versionNo` only.
  - `src/lib/sealing/estimate-lodgement-store.ts:15` already selects `estimateVersion: { select: { versionNo } }`.
- **Relation fields that reach the table** (`prisma/schema.prisma`):
  - `Organisation.companyEstimateVersions` (278)
  - `Person.estimateVersionsPrepared` (569)
  - `BqVersion.estimateVersions` (5032)
  - `CompanyEstimate.versions` (5206)
  - `SealedEstimateLodgement.estimateVersion` (7610)
- **The app's database role.**
  - `src/lib/auth/db-role.ts` (pure): `grantStatements` makes the broad GRANT, then the `WITHHELD` revokes, then the TEMPORARY revoke. It also
    holds `RuntimeRoleFacts`, `runtimeRoleVerdict` (precedence SUPERUSER, OWNER, TRAIL_WRITABLE, then TEMPORARY_HELD, which warns and never
    refuses), and `RUNTIME_ROLE_WORDS`.
  - `scripts/db-role-apply.ts:62-63` reads `pg_tables` and runs the statements. `scripts/db-roles.ts` is the CLI.
  - `src/lib/auth/runtime-role-store.ts`: `readRuntimeRole` asks about membership roles and PUBLIC, guarded by `to_regclass`.
    `runtimeRoleCheck` caches a **verdict** promise on `globalThis.perolehanRuntimeRole`. Its consumers are `src/instrumentation.ts` (start-up log),
    sign-in, and `src/app/configuration/accounts/page.tsx:49`.
  - Tests: `src/lib/auth/db-role.test.ts`, `runtime-role.db.test.ts` (calls `applyAppRole` with role `perolehan_app_test`, password null), and
    `db-roles-refresh.db.test.ts`.
- **The LIVE conditions.**
  - `src/lib/sealing/switch.ts:32` `liveIssueFaults` has 8 faults, with `LIVE_ISSUE_WORDS` at line 53.
  - `src/lib/sealing/policy.ts:30` `sealingPolicyFaults` wraps it.
  - It has two call sites: `src/app/configuration/bid-sealing/page.tsx:71` (the display) and `src/app/configuration/bid-sealing/core.ts:130` (re-judged at every save and apply).
- **The SULIT access log.**
  - The table is `SulitAccessEvent` (`schema.prisma:12776`). The `basis` CHECK is outcome-paired, and its latest definition is `prisma/migrations/20261013100000_supplier_registration/migration.sql:367`.
  - Other constraints: `one_actor` (exactly one of `actorPersonId` and `actorSystemLabel`), `scope_known` (`'exercise'` among them), and `has_fields`.
  - In the code, `SULIT_GRANT_BASES` is at `src/lib/auth/sulit-access.ts:34` and `grantedWords` at `:400`. The field registry entry
    `companyEstimate` (scope `exercise`) is at `src/lib/sulit-fields.ts:49`.
- **No trigger function reads `CompanyEstimateVersion`.** The migrations name the table only in DDL and FKs (`20261001120100`, `20261103110000:446`),
  and FK checks run as the owner.
- **Threat model.** `docs/notes/plans/signin-threat-model.md:101` F10 holds the fix list. The Section E Phase 3 line is "The sealed column is unreadable as the app role."

## 2. Target

1. As the app role, any statement that reads `CompanyEstimateVersion.value` is refused by Postgres (42501). Every other column reads.
2. The figure can be read only through `public.read_company_estimate_figure(...)`, a SECURITY DEFINER function. Each call writes one
   `SulitAccessEvent` row with the new basis `LOGGED_FIGURE_READ`, in the caller's transaction.
3. `db:roles` makes it so. The runtime check reads it back (`has_column_privilege`). LIVE is refused while the figure is readable or
   TEMPORARY is held.
4. Every Prisma read of the table in non-test `src/**` names its columns. A source scan pins this.

## 3. Contracts

### 3.1 Migration `prisma/migrations/20261113000000_estimate_figure_wall/migration.sql`

This is the first timestamp above `20261112000000`. Write no `;` inside SQL comments.

```sql
-- the access basis: drop and re-add the outcome-paired CHECK, with LOGGED_FIGURE_READ added to the GRANTED list (every other value exactly as in 20261013100000)
ALTER TABLE "SulitAccessEvent" DROP CONSTRAINT "SulitAccessEvent_basis_matches_outcome";
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_basis_matches_outcome" CHECK (... 'OWN_RECORD', 'LOGGED_FIGURE_READ' ...);

CREATE FUNCTION public.read_company_estimate_figure(
  p_organisation_id text, p_version_id text,
  p_actor_person_id text, p_actor_system_label text, p_actor_session_id text, p_source_address text
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$ ... $$;
REVOKE ALL ON FUNCTION public.read_company_estimate_figure(text, text, text, text, text, text) FROM PUBLIC;
```

The function body:
- Every name is schema-qualified (`public."CompanyEstimateVersion"`, `public."CompanyEstimate"`, `public."SourcingExercise"`, `public."SulitAccessEvent"`).
- It reads the version by `id = p_version_id AND "organisationId" = p_organisation_id`. If there is no row, it raises with the next free project
  SQLSTATE in the `PA0nn` range (grep `prisma/migrations` for the highest) and writes nothing.
- It inserts one `SulitAccessEvent` with these columns:
  - `id = gen_random_uuid()::text`
  - `organisationId`, plus the four actor columns from the arguments (the `one_actor` CHECK judges them)
  - `scope = 'exercise'`, `entity = 'CompanyEstimateVersion'`, `entityId = version id`
  - `entityLabel = <exercise reference> || ' · Company estimate · version ' || versionNo`
  - `fields = ARRAY['companyEstimate']`, `outcome = 'GRANTED'`, `basis = 'LOGGED_FIGURE_READ'`, `at = now()`
- It returns `value`.
- It adds no state precondition (the advisor's call, accepted: anything more is beyond 20ch and would take on the app's lodge and
  disclose rules). `GRANT EXECUTE` is not in the migration, because the role name is a deployment fact. It goes in `grantStatements`.

### 3.2 `src/lib/auth/db-role.ts` (pure)

```ts
/// Columns no app login may read (ruling 20ch, threat model F10). Read only through FIGURE_READER.
export const WALLED_COLUMNS: readonly { table: string; column: string }[] = [{ table: "CompanyEstimateVersion", column: "value" }];
export const FIGURE_READER = { name: "read_company_estimate_figure", args: "text, text, text, text, text, text" } as const;

export function grantStatements(input: {
  role: string; owner: string; schema: string; database: string; existing: ReadonlySet<string>;
  /// The columns of each WALLED_COLUMNS table as the database lists them now (pg_attribute, attnum > 0, not dropped). Read at run time, never a literal.
  columns: ReadonlyMap<string, readonly string[]>;
  /// The reader function exists (to_regprocedure is not null).
  figureReaderPresent: boolean;
}): string[];
```

The order matters. Each walled table, when present, comes after the `WITHHELD` revokes and before the TEMPORARY revokes:

```text
REVOKE SELECT ON TABLE t FROM role
REVOKE SELECT ("value") ON TABLE t FROM role   -- clears a stray column grant
GRANT SELECT ("c1", "c2", ...) ON TABLE t TO role   -- columns minus every walled column, each quoteIdent'd, sorted
```

When `figureReaderPresent` is true, it then adds `GRANT EXECUTE ON FUNCTION schema.read_company_estimate_figure(text, text, text, text, text, text) TO role`.
A walled column is never in the GRANT, even when `columns` passes it in.

`RuntimeRoleFacts` gains one field: `estimateFigureReadable: boolean`. It is true when the login, a role it is a MEMBER of, or PUBLIC
holds SELECT on the figure column. A table that does not exist yet reads as false.

`RuntimeRoleReason` gains `"FIGURE_READABLE"`. Precedence is SUPERUSER, OWNER, TRAIL_WRITABLE, FIGURE_READABLE, then TEMPORARY_HELD.
FIGURE_READABLE warns and never refuses sign-in (J1). Its `RUNTIME_ROLE_WORDS` entry is plain words with no code, for example:
"a login that can still read the company estimate's figure directly, so npm run db:roles has not run on this database since the figure was walled off".

### 3.3 `src/lib/auth/runtime-role-store.ts`

- `readRuntimeRole` adds one query. It follows the existing membership + PUBLIC + `to_regclass` pattern, using
  `has_column_privilege(m.oid, <regclass>, 'value', 'SELECT') OR has_column_privilege('public', <regclass>, 'value', 'SELECT')`.
- `export function runtimeRoleFacts(): Promise<RuntimeRoleFacts>` caches the **facts**. It keeps the global key `perolehanRuntimeRole`,
  so the existing `runtime-role.db.test.ts` resets still work. `runtimeRoleCheck()` derives the verdict on every call from the cached
  facts and the current `NODE_ENV`. A failed query is not kept, as today.
- `reportRuntimeRole` logs FIGURE_READABLE as a warning, the same way TEMPORARY_HELD is logged.

### 3.4 `src/lib/sealing/switch.ts`

```ts
export type LiveIssueFault = ... | "ESTIMATE_FIGURE_READABLE" | "TEMPORARY_HELD";
export function liveIssueFaults(p: { ...as today...; runtimeRole: { estimateFigureReadable: boolean; temporaryHeld: boolean } }): LiveIssueFault[];
```

Both are pushed after `HARDENING_NOT_ATTESTED`, in that order. The call sites (`page.tsx:71`, `core.ts:130`) pass
`await runtimeRoleFacts()`. If it throws, they pass `{ estimateFigureReadable: true, temporaryHeld: true }`, so an unknown login fails closed.
`LIVE_ISSUE_WORDS` gains words under note 0005. Drafts:
- "The app's database login can still read the company estimate's figure."
- "The app's database login can still make temporary tables."

### 3.5 `src/lib/scope/estimate-store.ts`

```ts
/// Who reads, for the access row. A person (with session and address) or a loader run by label: exactly one.
export type FigureReader = { organisationId: string } & ({ personId: string; sessionId: string | null; sourceAddress: string | null } | { systemLabel: string });
export async function readSealedFigures(tx: Tx, estimateId: string, reader: FigureReader): Promise<SealedFigures>;
export async function writeSealedLodgement(tx: Tx, i: { ...as today...; reader: FigureReader }): Promise<{ lodgementId: string; versionId: string; superseded: number }>;
/// The one call of the database's logged reader. Sen from the numeric text through parseSen.
async function readFigure(tx: Tx, reader: FigureReader, versionId: string): Promise<Sen>; // tx.$queryRaw`SELECT public.read_company_estimate_figure(...)::text AS v`
```

- `readSealedFigures` selects `{ id, versionNo, reason }` explicitly and calls `readFigure` once per version.
- `writeSealedLodgement` selects `{ id }` and calls `readFigure` once.
- The names do not change, so the caller pins in `opening/sealed.test.ts:112` and `scope/sealed.test.ts:89` still hold.
- `FigureReader` is built from `AuditActor` by a small pure helper, `figureReaderOf(actor, organisationId)`, in the same file's pure
  sibling `src/lib/scope/estimate.ts`. A SUPPLIER actor throws, because a supplier never reads the figure.

## 4. Threats

| Threat | What this plan does | What is still owed |
| --- | --- | --- |
| A stray Prisma include, a raw query or SQL injection reads the figure before the opening | The column is revoked from the app role (Postgres refuses it), and the explicit-select scan backs that up | `reason` stays behind the omit only. 20ch walls `value`, and `reason` remains a granted column (J3) |
| A legitimate read leaves no trace | Every read goes through the function and writes an access row | The row is written in the caller's transaction. A compromised app process running arbitrary SQL can call the function and roll the row back. This is recorded as a residual, not closed (J4) |
| The public copy's role calls the reader | `REVOKE ALL ... FROM PUBLIC` in the migration. EXECUTE is granted only to the app role, by `db:roles` | none |
| The migration is deployed but `db:roles` has not been re-run | The runtime check reports FIGURE_READABLE, and LIVE is refused | `db:roles` must run on every LIVE database and after every restore (20cw (a) backlog row) |
| Temporary tables shadow a name | LIVE is refused while TEMPORARY is held (20cw (a), adopted) | none |
| Plain figure in backups | none | Encrypted backups with recorded custody stay a deployment item |
| A column added later is refused to the app | `db:roles` reads the columns at run time and grants new ones on its next run | The runbook already says to run `db:roles` after every `migrate deploy` |

## 5. Judgement calls (step 4 writes these into `docs/notes/decisions-log.md` as `- 2026-10-20 · ...` lines)

- **J1. FIGURE_READABLE warns at sign-in and does not refuse it. LIVE refuses it.**
  - The scope line names LIVE as the enforcement point.
  - The app's omit and explicit selects are the first wall, so like TEMPORARY this is a second wall.
  - Refusing every production sign-in after a `migrate deploy` that `db:roles` has not followed would lock out a whole deployment, to
    guard a control that LIVE already gates.
- **J2. The read is logged in `SulitAccessEvent` with a new GRANTED basis, `LOGGED_FIGURE_READ`, not in `SealedAccessEvent`.**
  - The figure is the registered SULIT field `companyEstimate`.
  - Paper exercises disclose it too, so the SULIT read log is where it belongs.
  - A String basis behind a CHECK needs no enum change.
- **J3. `reason` is not walled.** 20ch names `value` only. `reason` keeps the omit and explicit selects. It is recorded as owed in the F10 line.
- **J4. No state precondition in the function. The rollback residual is recorded honestly** in F10, and the function's comment says so.
- **J5. The runtime store caches facts, not the verdict.** Both the verdict and the LIVE inputs derive from them. The global key keeps its name.
- **J6. An unknown runtime role fails closed for LIVE.**
- **Restart:** after the founder runs `db:roles` on `perolehan` and points `DATABASE_URL` at the app role, the dev server needs a restart.

## 6. Steps

### Step 1. data-modeler: the migration

- **Do:** write `prisma/migrations/20261113000000_estimate_figure_wall/migration.sql` as in 3.1.
- **Apply:**
  1. Apply it to `perolehan_native_check` first.
  2. Then apply it to `perolehan`, through `migrate deploy` of this new migration only.
  3. Run `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against each database and confirm it is empty.
  4. Run `npx prisma generate`.
- **Done when:**
  - Both databases list the migration as applied, and the diff is empty for both.
  - On the scratch database, `SELECT has_function_privilege('public', 'public.read_company_estimate_figure(text,text,text,text,text,text)', 'EXECUTE')` is false.
  - `pg_get_functiondef` shows `SECURITY DEFINER` and `search_path=pg_catalog, public, pg_temp`.
  - Inserting a `SulitAccessEvent` with outcome GRANTED and basis `LOGGED_FIGURE_READ` passes the CHECK. Do this inside a rolled-back transaction, writing nothing.
- **Tests:** none of its own. Step 4 proves the function as the app role. Commit after `NODE_OPTIONS=--max-old-space-size=14000 npm run check`.

### Step 2. domain-engineer: the role, the runtime facts and the LIVE faults (pure first)

- **Do:**
  1. `db-role.ts` as in 3.2.
  2. `scripts/db-role-apply.ts` `grantAll` reads the columns of each walled table from `pg_attribute` and checks the function with
     `to_regprocedure`, then passes both in.
  3. `runtime-role-store.ts` as in 3.3.
  4. `switch.ts` as in 3.4, with `policy.ts` following through `Parameters<>`.
  5. Both bid-sealing call sites pass `await runtimeRoleFacts()`, failing closed (J6).
  6. `accounts/page.tsx` renders the new reason through `RUNTIME_ROLE_WORDS`, with no code on screen.
  7. `SULIT_GRANT_BASES` gains `LOGGED_FIGURE_READ`, and `grantedWords` gains words for it, for example "Read through the database's logged reader".
- **Done when:**
  - Pure tests in `src/lib/auth/db-role.test.ts`:
    - the walled table gets REVOKE then GRANT of the column list, in that order, after the broad GRANT;
    - `value` is absent from the column GRANT even when `columns` contains it;
    - a new column passed in is granted;
    - the EXECUTE grant is present only when `figureReaderPresent` is true;
    - an absent table is skipped.
  - Verdict tests cover FIGURE_READABLE precedence (after TRAIL_WRITABLE, before TEMPORARY_HELD) and `refuseSignIn: false`.
  - `src/lib/sealing/switch.test.ts` and its siblings:
    - each new fault fires alone, and both fire together;
    - the words exist for every fault;
    - existing literals gain the `runtimeRole` field. This updates them to match ruling 20ch / the N6 scope line, cited in the test,
      and drops no assertion.
  - The test that mirrors `SULIT_GRANT_BASES` against the CHECK passes with the new value.
  - `npm run check` passes, along with `npx vitest run src/lib/auth src/lib/sealing`.
- **Commit.**

### Step 3. api-engineer: the read paths through the function, explicit selects, the scan

- **Do:**
  1. `estimate-store.ts` as in 3.5, plus `figureReaderOf` in `scope/estimate.ts` with a pure test.
  2. Pass the reader from `opening/estimate.ts` (`discloseAtFinalising` already has `actor`) and from `scope/actions.ts:762`.
  3. Give `loadEstimates` (`scope/repo.ts:112`) an explicit `versions: { orderBy, select: {...} }`. List only the columns its consumers
     use; typecheck will name them.
  4. Grep every other read through the five relation fields in section 1 and give each an explicit select.
  5. Extend `src/lib/scope/sealed.test.ts`. It scans non-test, non-fixture, non-generated `src/**` only, so it leaves
     `sulit-rollout.db.test.ts:271-277` as it is, on purpose. It checks four things:
     - every `.companyEstimateVersion.<op>(` call's argument has a top-level `select`;
     - every use of a relation field that reaches the table (read from `schema.prisma` by type, not a literal list), in a file that names
       `companyEstimate` or `estimateVersion`, is `{ ..., select: ... }` and never `true` or `include`. `_count` is exempt;
     - `read_company_estimate_figure` appears only in `estimate-store.ts`;
     - `omit: { value: false` appears nowhere.
  6. Each rule has a fixture string proving it catches the bad form. Re-check the existing `rawReadsOfVersions` and un-omit regexes,
     and change them only where the new code requires it, citing 20ch.
- **Done when:**
  - The scan passes on the tree and fails on each fixture.
  - `npm run check` passes, along with `npx vitest run src/lib/scope src/lib/opening src/lib/sealing`.
  - `npm run test:db` passes the existing disclosure and lodgement DB tests (`opening`, `estimate-lodgement.db.test.ts`, `online-finalise.db.test.ts`).
    The only failure is the known `holding-edit.db.test.ts`.
- **Commit.**

### Step 4. test-engineer: the app-role proof, the LIVE seam, documents, full gates

- **Do:**
  1. Write `src/lib/scope/estimate-wall.db.test.ts`, run by `npm run test:db` against `perolehan_native_check`:
     - set-up: `applyAppRole(tx, { role: "perolehan_app_test", password: null })`, then seed an estimate with one version as the owner;
     - inside a `$transaction`, `SET LOCAL ROLE perolehan_app_test`, then check each of these:
       - a plain `SELECT "value"` is refused with 42501 (in its own savepoint or transaction);
       - `SELECT id, "versionNo", "preparedOn", "reason"` reads;
       - `loadEstimates` reads;
       - `readSealedFigures(tx, id, reader)` returns the figure, and exactly one `SulitAccessEvent` with basis `LOGGED_FIGURE_READ`,
         the version's id and the actor exists;
       - a wrong organisation raises and writes no row;
       - `readRuntimeRole(tx)` reports `estimateFigureReadable: false`;
     - as the owner, `has_function_privilege('public', ..., 'EXECUTE')` is false.
  2. In `src/app/configuration/bid-sealing/policy.db.test.ts`, add one case where LIVE is refused with both new words while the stubbed
     facts say readable and TEMPORARY held. Stub through `globalThis.perolehanRuntimeRole = Promise.resolve(facts)`. Keep every existing
     assertion.
  3. Change the Section E Phase 3 line of `docs/notes/plans/signin-threat-model.md` and the F10 fix list. They should describe what is
     built (the revoke, the logged definer read, the runtime check, the LIVE refusal) and what is owed:
     - `db:roles` on each live database and after each restore;
     - encrypted backups with recorded custody;
     - `reason` not walled;
     - the rollback residual.
  4. Write the section 5 lines into `docs/notes/decisions-log.md`, including the restart line.
- **Done when:**
  - The new DB test passes.
  - `npm run test:db` passes except `holding-edit.db.test.ts`.
  - `NODE_OPTIONS=--max-old-space-size=14000 npm run check` passes, along with `npx vitest run` of `src/lib/auth src/lib/sealing src/lib/scope src/lib/opening src/app/configuration`.
  - `powershell -NoProfile -File scripts/test-linux.ps1` passes before this last commit.
  - `db:roles` has **not** been run against `perolehan`.
- **Commit.**
