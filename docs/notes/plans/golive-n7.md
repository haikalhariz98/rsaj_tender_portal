# N7: PDPA, blank the contractor signatory's personal values in a decided return correction's payload

**Status (2026-10-20): ready to build.** Written by the solution architect for go-live item N7. The source is the product owner's
scope line on decisions-log line 2823 (commit 17f3e6ef). It chooses "blank at the decision", the first of the two options in the
ruling on log line 2047 (the ruling on open item 2030). The backlog row is `docs/notes/backlog.md:57`, under "Go-live conditions".
This plan declares contracts. The signatures in section 3 are what the builders write, not code that exists. Nothing here needs the
founder, CPD, RSAJ or an outside service.

**No new ADR.** The ruling on 2030 is the record. This plan replaces one trigger function, and the replacement is narrower than a
general erasure path. The judgement calls are in section 5, and step 4's builder copies them into the decisions log.

**One migration, no `schema.prisma` change.** Prisma does not model trigger functions, so `migrate diff` stays empty and
`prisma generate` changes nothing. It still runs.

**Restart.** None is needed. The migration replaces a function body, and the code changes reload under `next dev`.

## 1. What exists today

- **The table.** `ConfigurationChange` (`prisma/migrations/20261007130100_permissions_attribution_changes/migration.sql:57`) has these columns:
  - `kind`, `payload` (jsonb), `before` (jsonb) and `status`;
  - `reason`, `proposedByPersonId` and `proposedAt`;
  - `decidedByPersonId`, `decidedAt` and `decisionReason`.
  The CHECKs `ConfigurationChange_objects`, `_decision_held` and `_two_persons` are at lines 160-170.
- **The guard.** `public."guard_configuration_change"()` (`prisma/migrations/20261007160000_two_person_guards/migration.sql:13`) does
  the following:
  - It refuses a DELETE (and a TRUNCATE).
  - It refuses an UPDATE of a row that is not PROPOSED.
  - It refuses an UPDATE that leaves the row PROPOSED.
  - It refuses any column change other than `status`, `decidedByPersonId`, `decidedAt` and `decisionReason`. The test is a
    `to_jsonb(NEW) - ... <> to_jsonb(OLD) - ...` compare.
  - All of these raise SQLSTATE PA004.
  - Its `search_path` was pinned afterwards by `ALTER FUNCTION` in `20261103200000_sr13_sealed_triggers_hardened/migration.sql:607`.
  - The triggers `ConfigurationChange_guard` (BEFORE UPDATE OR DELETE, row) and `ConfigurationChange_no_truncate` are ENABLE ALWAYS.
  - The insert guard is `guard_configuration_change_insert` (`20261007170000_two_person_guards_review/migration.sql:32`). It allows
    only a PROPOSED insert.
  - The highest applied migration is `20261113000000_estimate_figure_wall`.
- **The payload of an editor's save.** `EditPayload` is `{ operation: string; fields: [string, StagedValue][] }`, where
  `StagedValue = string | { file }`. It is defined in `src/lib/auth/configuration-edit.ts:84`.
  - `parseEditPayload` (line 120) refuses any value that is not text or a file (`BAD_VALUE`).
  - `fieldValue` (line 175) has no caller outside its own file.
  - `describeEdit` (line 239) renders the queue's lines from **`before`** (the rehearsal), not from the payload.
- **The return correction.**
  - `recordReturn` (`src/app/awards/actions.ts:920`) stages through `stageRecordEdit("awards-records.recordReturn", ...)` when the
    award is ACCEPTED. The operation is registered at `src/app/configuration/_editors/record-operations.ts:30` with kind
    `AWARD_RETURN_CORRECTION`, decided under `corrections.decide`.
  - The posted fields it reads are:
    - `id`
    - `signedLetterReceivedOn`, `declarationReceivedOn` and `authorisationReceivedOn`
    - `whereHeld`
    - `signatoryName`, `icNumber`, `occupation`, `address` and `capacity`
    - `contractorSigned`, `stampAffixed`, `witnessName` and `witnessSigned`
    - `reason`
    - the attribution fields of `AwardReturn.receivedBy:*`, which `isStoredField` filters
  - `icNumber` is the one SULIT field (`src/lib/sulit-fields.ts:125`, read through `sulitFieldOf` in `src/lib/sulit-trail.ts:17`).
- **The decision.** `decideEdit` (`src/lib/auth/edit-store.ts:238`) does the following:
  - It locks the row `FOR UPDATE` and parses the payload.
  - On APPLY it runs the editor through `formOf(parsed.payload, ...)`.
  - It then calls `conclude(status, ...)`. That one function makes the single `tx.configurationChange.update` (line 278) for APPLIED,
    DECLINED, WITHDRAWN and STALE, then writes the decision's audit row (`trail`) and the act.
  - The decision is also judged before the password in `src/app/configuration/changes/actions.ts:122`, which parses the payload for
    its operation.
  - `decideChange` (`src/lib/auth/change-store.ts:249`) is the other kinds' path and never carries an edit kind.
- **Who reads the payload.**
  - `src/lib/auth/changes-view.ts:89,99` and `src/app/configuration/changes/actions.ts:122` read the payload, and both read
    `.operation` only.
  - **No screen renders a payload field value today.** No export reads it (`grep configurationChange.find` over `src`).
- **Other copies of the same values (found, not changed by N7).**
  - **(a) `ConfigurationChange.before` of the same row.** This is the rehearsal (`rehearsalOf`, `edit-store.ts:201`): the
    `AwardReturn` audit changes the editor would write, built by `awardAuditPair` (`src/lib/award/audit-view.ts:44`).
    - It masks `icNumber` (`maskIc`, last four digits kept).
    - It holds the signatory's name, occupation, address and capacity, and the witness's name, **in full**, before and after.
    - `describeEdit` shows them in the queue for decided rows too. Only the IC number is hidden there, by `sulitFieldOf`.
  - **(b) `AuditEntry`.** The applied correction's own audit row, and the first recording's, hold the same fields. The IC number is
    masked there and the rest is in full.
  - **(c) `AwardReturn` itself.** This is the system of record, not a copy. A PDPA correction is made there.

## 2. Target

- When a return correction is decided (APPLIED, DECLINED, WITHDRAWN or STALE), the same UPDATE that writes the decision replaces the
  value of each listed field in `payload.fields` with JSON `null`. That `null` is the withheld marker.
- The database allows exactly that and nothing more. It allows it only:
  - in the deciding UPDATE (`OLD.status = 'PROPOSED'`, `NEW.status <> 'PROPOSED'`);
  - for `kind = 'AWARD_RETURN_CORRECTION'` with operation `awards-records.recordReturn`;
  - for the listed names;
  - for the value `null` replacing a JSON string.
- The following still cannot change:
  - the operation;
  - every other key of the payload;
  - the array's length;
  - each element's name and position;
  - every unlisted value;
  - every other column.
- A row decided before the migration can never be blanked, because the guard's existing "already decided" refusal fires first. So
  "no backfill" is held by the database, not only by the code.
- Readers parse a blanked payload as valid and know which fields are withheld. Any future renderer shows `WITHHELD_WORDS`, never an
  empty value.

## 3. Contracts

### 3.1 Pure (`src/lib/award/return-withheld.ts`, new; tests in `return-withheld.test.ts`)

```ts
/// The editor and kind whose decided payload is blanked (ruling on log line 2030, chosen at 2823 N7).
export const RETURN_CORRECTION_OPERATION = "awards-records.recordReturn";
export const RETURN_CORRECTION_KIND = "AWARD_RETURN_CORRECTION";
/// Personal and SULIT values of the contractor's signatory and witness. The SQL guard holds the same list (step 2).
export const RETURN_WITHHELD_FIELDS = ["signatoryName", "icNumber", "occupation", "address", "witnessName"] as const;
/// Every other field the return form posts, kept as posted. Each field of the form is in exactly one of the two lists.
export const RETURN_KEPT_FIELDS = ["id", "signedLetterReceivedOn", "declarationReceivedOn", "authorisationReceivedOn", "whereHeld",
  "capacity", "contractorSigned", "stampAffixed", "witnessSigned"] as const;
export const WITHHELD_WORDS = { en: "Withheld" } as const;

/// The names withheld once a change of this kind and operation is decided. Empty for anything else.
export function withheldFieldsOf(kind: string, operation: string): readonly string[];
/// The stored payload with each listed string value replaced by JSON null, or null when nothing would change (another kind or
/// operation, no listed field, already blank). Works on the raw JSON so that order, duplicates and unknown keys are kept as stored.
export function blankWithheld(kind: string, rawPayload: unknown): object | null;
```

### 3.2 `src/lib/auth/configuration-edit.ts` (changed)

- `EditPayload` gains `withheld: string[]`. These are the names whose stored value is `null`, and they are left out of `fields`.
  `fields` stays `[string, StagedValue][]`, so `formOf` and `samePayload` keep their types.
- `parseEditPayload(raw, kind?: string)` accepts a `null` value only where
  `withheldFieldsOf(kind, operation).includes(name)`. Anywhere else, `null` stays `BAD_VALUE`.
- New: `withheldFaults(payload: EditPayload): Fault[]` returns `WITHHELD_NOT_APPLICABLE` when `withheld.length > 0`.
  `proposeEdit` and the APPLY branch of `decideEdit` refuse with it, so a payload holding the marker is never proposed or run.

### 3.3 `src/lib/auth/edit-store.ts` `decideEdit` (changed)

- `conclude()` computes `const blanked = blankWithheld(row.kind, row.payload)` and writes
  `{ status, ...decidedBy, decisionReason, ...(blanked ? { payload: blanked } : {}) }` in the **one** existing UPDATE.
- When `blanked` is set, `trail` adds one change line `{ field: "Personal details", before: "Held", after: WITHHELD_WORDS.en }`. It
  never writes the values themselves.
- The comment cites the ruling on log line 2030 (2047) and N7 (2823).
- On APPLY the editor has already run on the parsed in-memory payload before `conclude`, so the correction itself is unaffected.

### 3.4 Database (`prisma/migrations/20261114000000_change_payload_withheld/migration.sql`)

- `CREATE OR REPLACE FUNCTION public."guard_configuration_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp`.
  - The SET is in the function's own text, because CREATE OR REPLACE drops the earlier `ALTER FUNCTION ... SET`.
  - Every function it calls is schema-qualified (`pg_catalog.jsonb_array_length`, `pg_catalog.jsonb_typeof`, and so on). It reads no table.
  - No `;` in comments.
- The existing four refusals stay word for word. The column compare now also excludes `payload`, and a new block runs when
  `NEW."payload" IS DISTINCT FROM OLD."payload"`. It refuses (PA004, each with its own message) unless all of these hold:
  - `OLD."kind" = 'AWARD_RETURN_CORRECTION'` and `OLD."payload"->>'operation' = 'awards-records.recordReturn'`;
  - `(NEW."payload" - 'fields') = (OLD."payload" - 'fields')`;
  - both `fields` are arrays of equal length;
  - for each ordinal `i` (`jsonb_array_elements ... WITH ORDINALITY`), the new element equals the old one, or all of these are true:
    - the new element is a 2-array;
    - its name `= OLD` name;
    - the name is in `ARRAY['signatoryName','icNumber','occupation','address','witnessName']`;
    - `jsonb_typeof(old value) = 'string'`;
    - `new value = 'null'::jsonb`.
- The triggers are not recreated. They stay bound to the function by name, and ENABLE ALWAYS stays.
- No statement reads or writes a row of `ConfigurationChange`.

## 4. Threats

| # | Threat | Control |
| --- | --- | --- |
| T1 | The widened guard is used to rewrite what was proposed (forgery of the checker's record) | Only `null` replaces a string, only on listed names, positions and names fixed, operation and every other key fixed (step 2 refusal cases) |
| T2 | CREATE OR REPLACE quietly drops the pinned `search_path` from 20261103200000 | `SET search_path` in the function text, and a DB assertion on `pg_proc.proconfig` (step 2) |
| T3 | Blanking before the decision changes what the checker sees | Payload change allowed only when `OLD` is PROPOSED and `NEW` is not, in the same UPDATE |
| T4 | Backfill or later erasure of rows already decided, which deletes data without the founder | `OLD.status <> 'PROPOSED'` still refused first, and the migration touches no row (step 2 scan, step 3 test, step 2 checksum on `perolehan`) |
| T5 | A blanked payload fails to parse, so the queue loses its label or reads "cannot be read" | `parseEditPayload` accepts `null` on listed names of this operation only, and `loadChangesView` is tested on a blanked row (step 3) |
| T6 | A payload holding the marker is applied, so the editor reads an empty IC number and erases it | `withheldFaults` refuses at propose and APPLY. A PROPOSED row never holds it through the decide path |
| T7 | A screen or export renders the marker as empty | No renderer exists. Any future one uses `WITHHELD_WORDS` (pure test pins the word and that `withheld` lists the names) |
| T8 | The PDPA concern is closed on paper while copies remain | Copies (a) and (b) in section 1 get their own backlog rows, and the row at `backlog.md:57` is marked met **for the payload only** |
| T9 | The SQL and TS lists drift | The step 2 DB test loops over `RETURN_WITHHELD_FIELDS` (each blanks) and `RETURN_KEPT_FIELDS` (each refused) |
| T10 | A proposal never decided keeps its values for good | Out of the ruling's scope (it says "at the decision"). Said in the backlog row |

## 5. Judgement calls (step 4 copies them to `decisions-log.md` as `- 2026-10-20 · ...` lines)

1. **The field list.** It is `signatoryName`, `icNumber` (SULIT), `occupation`, `address` and `witnessName`.
   - The ruling names the IC number, the address and "names", which means the signatory and the witness.
   - Occupation is added because it describes the identified person (PDPA personal data).
   - `capacity` is kept. It is the capacity in which the person signs for the company (for example "Director"), a fact of the
     contract's execution, and it reads as a role, not as data about the person.
   - The product owner may move it.
2. **Blanked on every decision** (APPLIED, DECLINED, WITHDRAWN, STALE). The PDPA concern does not depend on the outcome.
3. **The marker is JSON `null`, not `""` or a sentinel string.**
   - No posted form value can be `null`, so a withheld value can never be confused with a field left empty, or with a value a
     proposer typed.
   - The parser change that accepts it is confined to the listed names of this one operation.
4. **Only in the deciding UPDATE.** No path ever blanks a row already decided. Rows decided before N7 keep their values, and they
   would need the founder and a new migration.
5. **`ConfigurationChange.before` (the rehearsal) is not blanked.** The scope limits N7 to the payload. It holds the same names and
   address in full, and the queue shows them, so it gets a backlog row in "Go-live conditions" for the product owner to rule on. The
   2030 row is not called closed while it is open.

## 6. Steps

1. **domain-engineer: the pure list, the marker and the parser.** Write `src/lib/award/return-withheld.ts` per 3.1 and change
   `src/lib/auth/configuration-edit.ts` per 3.2.
   - Tests in `src/lib/award/return-withheld.test.ts`:
     - the two lists are disjoint;
     - `sulitFieldOf("AwardReturn", "icNumber")` is non-null and `icNumber` is withheld;
     - every field name in `RETURN_WITHHELD_FIELDS` passes `isStoredField`;
     - `blankWithheld` replaces only the listed strings, keeps order and duplicates and unknown keys, returns null for another kind,
       another operation, no listed field, or an already blank payload, and never touches a file value.
   - A scan test reads the body of `recordReturn` in `src/app/awards/actions.ts` and asserts that every `r.text`, `r.date`,
     `triState` and `data.get` name is in exactly one of the two lists. A new form field then forces a classification.
   - Tests in `configuration-edit.test.ts`:
     - `null` is accepted on a listed name of this kind and operation, and `withheld` names it;
     - `null` stays `BAD_VALUE` elsewhere (another name, another operation, another kind, no kind);
     - `withheldFaults`.
   - **Done when** `npx vitest run src/lib/award src/lib/auth` and `NODE_OPTIONS=--max-old-space-size=14000 npm run check` pass.
     Commit.
2. **data-modeler: the guard migration and its database proof.** Write `prisma/migrations/20261114000000_change_payload_withheld/migration.sql`
   per 3.4, starting with a header comment that cites the ruling on 2030 and N7.
   - Apply it in this order:
     - On `perolehan_native_check` first.
     - Then on `perolehan`. Before and after, run read-only `SELECT count(*), md5(string_agg(id || payload::text || "before"::text, '' ORDER BY id)) FROM "ConfigurationChange"`
       and record both in the decisions log. They must be equal.
   - Then check:
     - `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` is empty;
     - `npx prisma generate` has run.
   - Write a new DB test, `src/lib/auth/change-withheld.db.test.ts`. It inserts PROPOSED rows by SQL as the owner, and its cases are:
     - (a) a deciding UPDATE that blanks each name of `RETURN_WITHHELD_FIELDS`, singly and all together, is allowed;
     - (b) each name of `RETURN_KEPT_FIELDS` blanked in a deciding UPDATE is PA004;
     - (c) a listed value set to `""`, to another string or to `{}` is PA004;
     - (d) a blank with the row left PROPOSED is PA004;
     - (e) a blank of a row already decided is PA004, and the payload is intact afterwards;
     - (f) a renamed field, a changed operation, an added, removed or reordered element, and an added top-level key are each PA004;
     - (g) the same blank on another kind (`BASELINE_CORRECTION`) and on another operation under `AWARD_RETURN_CORRECTION` is PA004;
     - (h) any change to `before`, `reason`, `proposedAt` or `kind` alongside a decision is still PA004;
     - (i) DELETE and TRUNCATE are PA004;
     - (j) `pg_proc.proconfig` of the function holds `search_path=pg_catalog, public, pg_temp`.
   - Write a scan test, `src/lib/auth/change-withheld-migration.test.ts`, that the migration's SQL holds no `UPDATE`, `DELETE` or `INSERT` on `"ConfigurationChange"`.
   - **Done when**:
     - the migration is applied to both databases with equal checksums;
     - the diff is empty and generate has run;
     - `npm run test:db` passes (`holding-edit.db.test.ts` is the known scratch-data failure);
     - `npx vitest run src/lib/auth` passes;
     - `npm run check` passes.
     Commit.
3. **api-engineer: blank at the decision.** Change `decideEdit` per 3.3, and `proposeEdit` and APPLY per 3.2 (`withheldFaults`).
   Pass `row.kind` into the two `parseEditPayload` calls on stored rows: `edit-store.ts:253`, `changes-view.ts:89,99` and
   `changes/actions.ts:122`.
   - Add to `src/lib/auth/edit.db.test.ts` a fake editor `awards-records.recordReturn` of kind `AWARD_RETURN_CORRECTION`. It
     records the `FormData` it was run with and writes one audit row, so a rehearsal exists.
   - The cases are:
     - APPLY: the editor saw the full listed values; the stored payload then holds `null` for each listed name and the same strings
       for every kept name; the decision's audit row carries the "Personal details" line and no value.
     - DECLINE, WITHDRAW and a STALE apply each blank too.
     - A change of another edit kind is decided with its payload byte-identical.
     - `loadChangesView` on a blanked decided row still shows the operation's label and reads it as decided.
     - A payload holding `null` inserted as PROPOSED by SQL is refused at APPLY with `WITHHELD_NOT_APPLICABLE`, and the editor is not
       run.
     - **Existing rows unchanged:** a return correction decided under the guard without the blank (an UPDATE writing the decision
       only) keeps its full payload, and a later blank of it is PA004.
   - **Done when** `npx vitest run src/lib/auth src/app/configuration`, `npm run test:db` and `npm run check` pass. Commit.
4. **test-engineer: the record and the last gate.**
   - Edit `docs/notes/backlog.md`:
     - Mark the row at line 57 "payload: met 2026-10-20 (N7), for corrections decided from now on; rows decided earlier keep their
       values (founder)".
     - Add a "Go-live conditions" row for copy (a), `ConfigurationChange.before`.
     - Add a row for copy (b), `AuditEntry` before/after of `AwardReturn` (names, occupation, address and capacity in full, IC masked).
     - Add a row noting that a never-decided proposal keeps its values (T10).
     - Each row cites the ruling on 2030 and this plan, and says the PDPA data map, when written, lists all three locations.
   - Copy section 5 into `docs/notes/decisions-log.md`, together with the step 2 checksums and "no dev-server restart needed".
   - Run `powershell -NoProfile -File scripts/test-linux.ps1`.
   - **Done when**:
     - the full Linux suite passes;
     - `npm run check` passes;
     - the backlog and the log are committed, staging only those paths.
