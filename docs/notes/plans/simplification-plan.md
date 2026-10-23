# Simplification plan: steps 4, 5 and 6

- **Date:** 2026-10-23.
- **Author:** solution architect.
- **Approval:** the founder approved the before/after proposal on 2026-10-23 ("please proceed dont stop unitil it complete").
- **Decision record:** ADR 0043 (starter packs, the Getting-started checklist, the two-person switch).
- **Supersedes:**
  - design note 0002 (the Configuration rail of 25 sections in 7 groups), from step 5.1;
  - the "creates the organisation and nothing else" stance of `prisma/seed.ts`, from step 4.3.
- **Inputs:**
  - the research and requirement trace (123 setting groups), condensed in §7 so this file stands alone;
  - the screenshot UX review (top 10 problems).

  Both are in the session scratchpad.
- **Standing rules for every step:**
  - Desktop only. English only.
  - Minimal words, under note 0005; explanations go in popovers.
  - No RSAJ value in product code. Values live in `prisma/rsaj/**` and the pack files only.
  - Schema changes only by **new** migrations, and only **one schema step in flight at a time**.
  - Nothing fakes a second person.
  - Where the spec is silent, take the simple option and add an SP line (§8).
  - Every screen step ends with these checks:
    - `npm run typecheck`, `npm run lint` and `npm test`;
    - `npm run test:db` for the store steps;
    - a `scripts/text-snapshot.mjs` before and after, diffed;
    - a sibling-screen check (AGENTS.md).

## 1. Build order at a glance

There are two builders at once. Each wave holds at most one schema step. Files never overlap within a wave (the ownership
lists are below).

| Wave | Builder A | Builder B | Schema |
| --- | --- | --- | --- |
| 4-a | 4.1 Switch migration and contracts (data-modeler) | (none; 4.1 is small and everything waits on its types) | 4.1 |
| 4-b | 4.2 Two-person switch in code (domain-engineer + api-engineer) | 4.3 Pack loader and generic pack (domain-engineer) | none |
| 4-c | 4.4 RSAJ pack, part 1: approvals and purchasing (domain-engineer) | 4.5 Getting-started checklist page (frontend-engineer) | none |
| 4-d | 4.6 RSAJ pack, part 2: contracts, suppliers and system, plus the development fill (domain-engineer) | 4.7 Public portal never shows gaps; sign-in banner fix (frontend-engineer) | none |
| 4-e | 4.8 Security review, rollout to `perolehan`, AGENTS.md and comments (security-auditor, then devops-engineer) | (none) | none |
| 5-a | 5.1 Settings frame: 6 sections, rail, banner, popover rules, word rules (design-system-engineer) | (none) | none |
| 5-b | 5.2 Purchasing & tenders pass | 5.3 Organisation & people pass (Sign-in accounts merged into People) | none |
| 5-c | 5.4 Approvals pass | 5.5 Suppliers & portal pass | none |
| 5-d | 5.6 Contracts & payments pass | 5.7 System pass (the queue moves to Approvals) | none |
| 5-e | 5.8 Remove the splitting settings (data-modeler) | 5.9 Plain-words scan, comparators and baseline | 5.8 |
| 6-a | 6.1 Shell: grouped sidebar, crumbs, titles template, stepper colours, More menu, SULIT column collapse, status chips (design-system-engineer) | (none) | none |
| 6-b | 6.2 Home | 6.3 Requisitions | none |
| 6-c | 6.4 Tenders & quotations (5 phases) | 6.5 Approvals, Inbox, Committees, Suppliers lists | none |
| 6-d | 6.6 Projects (**gated** on the concurrent `src/app/projects/**` builder finishing) | 6.7 Page titles and the layout-bug sweep | none |
| 6-e | 6.8 Close-out: ui-guidelines-reviewer, ux-reviewer screenshots, text snapshots, comparator lists | (none) | none |

Every pass in waves 5-b to 5-d and 6-b to 6-d is frontend-engineer work, with domain-engineer for any `src/lib` function it
names.

## 2. Contracts written first (step 4.1)

These types are written before anything that uses them, so 4.2 to 4.7 can run in parallel.

```ts
// src/lib/starter/types.ts
export type PackName = "generic" | "rsaj" | "dev-fill";
export type PackProvenance = "STATED" | "ASSUMED";

/// One scalar group: the columns that share one provenance column. Written only when every column is null (ADR 0043 D1).
export interface PackGroup {
  model: string;                       // Prisma model name, e.g. "WindowPolicy"
  label: string;                       // the audit row's entityLabel, e.g. "Invitation · date rules"
  values: Record<string, unknown>;     // column -> value; references as { ref: "<list>:<code>" }
  provenanceColumn?: string;           // e.g. "dateRulesProvenance"; absent where the table has none
  sourceColumn?: string;               // e.g. "dateRuleSource"
  source: string;                      // the clause, or "generic starting value"
  requirement?: string;                // RSAJ requirement ID(s), e.g. "FR-ADV-004, FR-ADV-006"; RSAJ pack only
}

/// One list: loaded only into an empty list (ADR 0043 D1).
export interface PackList {
  model: string;                       // e.g. "Committee", "SupplierListValue"
  scope?: Record<string, unknown>;     // narrows "the list", e.g. { list: "STATE" }
  rows: Array<{ code: string; values: Record<string, unknown>; source: string; requirement?: string }>;
}

export interface StarterPack {
  name: PackName;
  version: number;                     // in the SYSTEM actor label: "Starter pack: RSAJ v1"
  provenance: PackProvenance;
  groups: PackGroup[];
  lists: PackList[];                   // in dependency order: a list another refers to comes first
  drafts?: { matrices?: unknown[]; evaluationModels?: unknown[] }; // RSAJ only; typed in 4.4 from the matrix and model writers' inputs
  setsTwoPersonOff?: "WHEN_CREATING_ROW" | "DEMO_DATABASE_ONLY";   // generic | dev-fill
}

export type PackSkip = { target: string; reason: "GROUP_PARTLY_SET" | "GROUP_SET" | "LIST_NOT_EMPTY" | "REFERENCE_SKIPPED" | "DRAFT_EXISTS" };
export interface PackPlan { writes: unknown[]; skips: PackSkip[]; faults: string[] }
```

```ts
// src/lib/setup/types.ts
export type SettingsSection = "people" | "approvals" | "purchasing" | "contracts-payments" | "suppliers-portal" | "system";
export type ChecklistKind = "set" | "confirm" | "go-live";
export type ChecklistState = "done" | "todo" | "confirm";   // "confirm": pre-filled, waiting for a named person
export interface ChecklistItem {
  key: string;                 // configuration key, never shown (AGENTS rule 5)
  section: SettingsSection;
  kind: ChecklistKind;
  label: string;               // at most 6 words
  href: string;                // the edit page, with the tab where there is one
  state: ChecklistState;
  detail?: string;             // the popover; at most 25 words; may name the clause
  confirmedBy?: { name: string; at: Date };  // "confirm" items: the issuer and when
}
```

```ts
// src/lib/auth/two-person.ts (pure)
export const SWITCH_KINDS: readonly ConfigurationChangeKind[];  // ADR 0043 D3: every kind except the five below
export const ALWAYS_TWO_PERSON: readonly ConfigurationChangeKind[] =
  ["BASELINE_CORRECTION", "AWARD_TERM_CORRECTION", "CONTRACT_DATE_CORRECTION", "AWARD_RETURN_CORRECTION", "CLASSIFICATION_DOWNGRADE"];
export function appliesAtOnce(kind: ConfigurationChangeKind, twoPersonChanges: boolean): boolean;
/// Off to on: one person. On to off: a second person (it is just a SECURITY_POLICY change while the switch is on).
export const ONE_PERSON_REASON = "Applied without a second person: two-person approval is off";
```

## 3. Step 4: working defaults and the Getting-started checklist

### 4.1 Switch migration and contracts

- **Agent:** data-modeler.
- **Migration:** yes, one new migration, `20261127000000_two_person_switch`:
  - `SecurityPolicy.twoPersonChanges BOOLEAN NOT NULL DEFAULT true`;
  - `CREATE OR REPLACE` of `guard_matrix_issue` and `guard_draft_issue` (keeping their pinned `search_path`). The "issuer is
    one of the makers" refusal becomes:

    ```sql
    IF EXISTS (… maker = issuer …)
       AND COALESCE((SELECT "twoPersonChanges" FROM "SecurityPolicy" WHERE "organisationId" = NEW."organisationId"), true)
    THEN RAISE … PA005
    ```

    Everything else in those functions is unchanged: an issuer is named, at least one maker is on record, and the issuer is
    never rewritten. `ENABLE ALWAYS` stays. The `ConfigurationChange` guards and CHECKs are **not touched**.
- **Files it owns:**
  - `prisma/schema.prisma` (the one column);
  - `prisma/migrations/<ts>_*`;
  - `src/lib/starter/types.ts`, `src/lib/setup/types.ts` and `src/lib/auth/two-person.ts`, with its test;
  - `package.json`: adds `"pack": "tsx scripts/load-pack.ts"`, so no later step edits `package.json`;
  - `src/lib/auth/two-person-scan.test.ts`, which names `src/lib/starter/apply.ts` as an allowed writer of the
    two-person tables (with the reason "operator pack, only while the switch is off; ADR 0043 D1").
- **Tests:**
  - `two-person.test.ts`: every kind is classified, and the five are never covered;
  - a `*.db.test.ts` for the trigger: a maker's issue is refused while the switch is on (PA005), accepted while it is off,
    and refused when there is no `SecurityPolicy` row.
- **Done when:** the migration applies, with `npm run db:deploy`, on a **scratch database**: a new database name in
  `DATABASE_URL`, made with `createdb`. The tests pass. **Never** run `npm run db:reset` or `docker compose down -v`.
  They destroy the volume that holds `perolehan`.

### 4.2 Two-person switch in code

- **Agents:** domain-engineer and api-engineer. Runs in parallel with 4.3.
- **Migration:** no.
- **Files it owns:**
  - `src/lib/auth/edit-store.ts` and `src/lib/auth/change-store.ts`;
  - `src/lib/auth/maker-checker.ts`, `configuration-change.ts` and `configuration-edit.ts`;
  - `src/app/configuration/approval-matrix/actions.ts` (the issue path only);
  - the issue actions under `src/app/configuration/evaluation/` and `scope/`;
  - `src/app/configuration/layout.tsx`;
  - `src/app/configuration/security/*`: the switch's field only. Its other wording is step 5.7.
- **Work:**
  1. `proposeEdit` and the `change-store` propose functions read `SecurityPolicy.twoPersonChanges` under the organisation
     lock. When `appliesAtOnce` is true:
     - they call the same apply function the decision path calls, in one transaction, with the person as actor and
       `ONE_PERSON_REASON` appended to each audit reason;
     - they write **no** `ConfigurationChange` row;
     - the result tells the screen "Saved".

     Otherwise the code is unchanged and the result is "Sent for approval".
  2. `makerCheckerFault` and `draftIssueFault` take `twoPersonChanges`. While it is off, a maker may issue, and the issue's
     audit reason says so.
  3. The switch on the sign-in settings editor reads "Settings changes need a second admin: On / Off".
     - Off to on is saved at once.
     - On to off is a normal proposal.
  4. The configuration layout banner ("N changes wait for a second person") stays as it is. While the switch is off, it
     also shows the quiet chip "Approval by another admin: off" to holders of `configuration.issue`, with no sentence.
  5. The sign-in banner fix (UX finding 9; 4.7 note). The "Sign-in closed" callout lists only the sign-in needs, not
     every unset key. An unset unseal passphrase length is reported on Bid sealing instead.
- **Tests:**
  - unit tests for `appliesAtOnce` and the fault changes;
  - `edit.db.test.ts` and `change.db.test.ts`:
    - with the switch off, a save applies at once, writes no change row, and the audit carries the reason;
    - with the switch on, the behaviour is unchanged;
    - the five record kinds still propose;
  - `two-person-scan.test.ts` still passes.
- **Done when:**
  - one administrator on an organisation with the switch off can edit any setting and put a draft matrix in force;
  - with the switch on, every existing two-person test passes unchanged.

### 4.3 Pack loader and the generic pack

- **Agent:** domain-engineer. Runs in parallel with 4.2.
- **Migration:** no.
- **Files it owns:**
  - `src/lib/starter/plan.ts` (pure), `src/lib/starter/apply.ts` (store) and `src/lib/starter/snapshot.ts`, which reads
    the organisation's current values for the planner;
  - `prisma/packs/generic.ts` and `scripts/load-pack.ts`;
  - `prisma/seed.ts`, whose comment is rewritten to "creates the organisation and loads STARTER_PACKS".
- **Work:**
  1. The planner implements the ADR 0043 D1 fill rules exactly: whole-group null, empty list, references, and first pack
     wins.
  2. The store:
     - opens one transaction and takes the organisation lock;
     - **refuses** unless `twoPersonChanges` is false, or the run is about to create the `SecurityPolicy` row (SP-3). The
       only other case is the development fill on a demonstration database (4.6, SP-23);
     - writes each row with one `writeAudit` (SYSTEM actor `Starter pack: <Name> v<version>`), recording
       `whereItComesFrom` and the governing source.
  3. The CLI:
     - prints the writes and the skips;
     - writes nothing without `--apply`;
     - exits 1 on any fault;
     - names the organisation by `ORGANISATION_CODE`.
  4. The generic pack's contents are below. Each value is ASSUMED, with the source "generic starting value".

     | Target | Values |
     | --- | --- |
     | `Organisation.timeZone` (only if null) | `Asia/Kuala_Lumpur` |
     | `SecurityPolicy` (created by the pack: `twoPersonChanges: false`) | The values in `prisma/demo-fresh-config.ts` `DEMO_POLICY`, plus `sealingPassphraseMinLength` 12 and `signInDetailRetentionDays` 365 |
     | `DocumentClass` list | Public; Internal; Supplier documents (Internal); Bank statements (SULIT); SULIT. Retention as the classes editor requires. |
     | `DocumentStorePolicy` upload rules | pdf, docx, xlsx, jpg, png; largest file 20 MB |
     | `SupplierPolicy` groups | Quotas: 12 files, 25 MB. Daily limits: 200, and 3 per number. Address limit: 20 per 60 min. Verification notice: "We will check your application and contact you." Online declaration replaces paper: true. Upload class and statement class: refs to the two classes above. |
     | `SupplierListValue` lists | Entity types (Sdn Bhd, Berhad, sole proprietorship, partnership, LLP); country Malaysia, with dial code +60; Malaysia's 13 states and 3 federal territories; the licensed commercial banks from Bank Negara Malaysia's published list (SP-8), with its access date as the source; account types Current and Savings |
     | `HolidayCalendar` | "Public holidays", weekend Saturday and Sunday, no dates (SP-7). `WindowPolicy.calendarId` is set if null. |
     | `NumberingSeries` | Generic patterns for each series the product numbers, e.g. `REQ/{YYYY}/{NNNN}`. The builder lists every series key from `src/lib/numbering`. |
     | `RejectionDestination` | Back to the originator (FR-APR-016 default) |

  5. `prisma/seed.ts`, after the organisation upsert, loads `(process.env.STARTER_PACKS ?? "generic").split(",")` with
     `apply`.
- **Tests:**
  - `plan.test.ts`:
    - a group with one column set is skipped whole;
    - a non-empty list is skipped;
    - a reference to a skipped list skips its group;
    - two packs with the first winning;
    - a fault refuses everything;
  - `generic-pack.test.ts`:
    - every `model` and column exists in the generated Prisma types (compile-time, through `satisfies`);
    - no generic entry targets an authority table: `AuthorityMatrix`, `AuthorityRule`, `Committee`, `DocumentFeeFloor`
      or `WindowPolicy` date groups;
  - `packs.db.test.ts`: load generic into a fresh test organisation, then
    - `unsetSettings(policy, "SIGN_IN", …)` is empty;
    - `whatIsMissing` holds only the four deployment items and the customer's texts (§3.2);
    - a second load writes nothing.
- **Done when:** `prisma migrate deploy` and `prisma db seed`, run against a **scratch database** (a new database name in
  `DATABASE_URL`, never the `perolehan` volume, never `db:reset`), give an organisation where an administrator can be
  bootstrapped and every generic group is filled. A re-run writes nothing.
- **The CLI warns** when it skips a STATED list or group, for example when the RSAJ numbering patterns are skipped because
  generic loaded first. An RSAJ deployment sets `STARTER_PACKS=rsaj,generic` **before** its first `npm run setup`. This
  goes in the README's setup section, which this step owns.

### 4.4 RSAJ pack, part 1: approvals and purchasing

- **Agent:** domain-engineer, with product-owner review of the transcription. Runs in parallel with 4.5.
- **Migration:** no.
- **Files it owns:**
  - `prisma/rsaj/starter-pack/index.ts` (the pack; it imports the parts);
  - `prisma/rsaj/starter-pack/approvals.ts` and `purchasing.ts`;
  - the tests beside them.
- **Work:** transcribe from `docs/requirements/RSAJ-Portal-Requirements-Specification.md`, and from the two v2 documents
  where they override it. Every entry carries `requirement` and `source` (the clause the requirement names). Contents:
  - **Approvals:**
    - the DAL as **one draft matrix** (Appendix B, Issue A, Revision 00): the three band families with the method bands
      RM500, RM5,000, RM15,000 and RM300,000 (FR-MTD-002), the core routing rows (§2.2.1), and the rules;
    - the offices it names, as `AuthorityRole` rows;
    - the eight committees of FR-CTE-001 with no members (FR-CTE-001, FR-OPN-001);
    - Tender Board quorum 3 (FR-CTE-003);
    - opening panel 2 (FR-OPN-002);
    - the three not-approved outcomes (FR-CTE-009);
    - routing sheet types and ICC targets (FR-CRT-007, FR-CRT-008).

    Slashed codes are transcribed as `dal-fixture.ts` reads them ("JR/R" as JR, "JR/P" as P), but those rows load as
    **ASSUMED**, with that reading as their source, not STATED (SP-2a). The joint partner office stays unmodelled; it goes
    to the open questions for RSAJ.
  - **Purchasing:**
    - funding routes F1 to F5;
    - sourcing methods, contract types and their behaviours, contract bases, and selected-tender proposal items;
    - which methods need a company estimate (FR-EST-006), with a lead time of 7 days (FR-EST-007);
    - which bases are let on a BQ;
    - tender document parts in printed order (12 tender, 9 quotation; FR-DOC-001, FR-DOC-002, FR-DOC-013) and the pack per
      method;
    - publication channels (the three mandatory, FR-ADV-001);
    - window rules: 14 days, sale cut-off 2 days, closing 14:30 (FR-ADV-004, FR-ADV-006, FR-ADV-007);
    - sale mode ONLINE (SR-10);
    - the four qualitative aspects (FR-EVL-003);
    - the six-stage tender and five-phase quotation evaluation models **as drafts** (FR-EVL-008, FR-EVL-009);
    - `ScopePolicy.specPanelUsed` false and `onScreenBillUsed` false (SR-08, SR-09; SP-6).
- **Tests:**
  - `rsaj-pack.test.ts`:
    - every entry has a `requirement` and a `source`, and none is ASSUMED except the slashed-code rows (SP-2a), which
      the test names one by one;
    - the matrix's figures equal `dal-fixture.ts`'s for every shared row;
    - no matrix is issued;
    - no file outside `prisma/rsaj/` imports the pack (a source scan);
  - `rsaj-pack.db.test.ts`: `rsaj,generic` into a fresh test organisation, then the draft is adoptable and can be put in
    force by one person while the switch is off.
- **Done when:** the dry run on a fresh organisation lists every group above with nothing refused, and the product owner
  has signed off the transcription in the decisions log.

### 4.5 Getting-started checklist page

- **Agent:** frontend-engineer, with domain-engineer for the pure part. Runs in parallel with 4.4.
- **Migration:** no.
- **Files it owns:**
  - `src/lib/setup/checklist.ts` (pure) and `src/lib/setup/checklist-repo.ts`;
  - `src/app/configuration/audit/**`, for the one-person filter only;
  - `src/app/configuration/page.tsx`, which **replaces the redirect**;
  - `src/components/setup/checklist.tsx`.
- **Work:**
  - The page heads with a `PageHeader` "Getting started" and a `Meter` "n of m done", where m counts the visible items
    (item 13 is hidden until step 7).
  - It lists one card per section, each with its items as rows: a status `Dot`, a label, a "Set" or "Confirm" link, and an
    info popover. The items are in §3.1.
  - A "Before go-live" card holds the switch item.
  - When every item is done, the checklist collapses into one `Disclosure` "Setup complete", and the page shows the six
    section cards (wired in 5.1).
  - The page is read by holders of `configuration.draft`, `configuration.issue` or `audit.read`, and by administrators.
    Anyone else is sent to Home.
  - **The one-person list (G1).** The existing audit page (`src/app/configuration/audit/**`, owned by this step for the
    filter only) gains the filter "Made without a second person". It shows the audit rows with a person actor whose
    reason carries `ONE_PERSON_REASON` (ADR 0043 D3). G1 links to it while the switch is off.
- **Tests:**
  - `checklist.test.ts`: each item's done rule, from facts;
  - `checklist-repo.db.test.ts`: an empty organisation gives all todo; after generic, the generic-filled items are done; a
    draft matrix gives "confirm"; once it is issued, "done" with the issuer's name;
  - `permission-gates.test.ts`, extended to the page.
- **Done when:** the founder's database (after 4.8) shows the real state of all 15 items plus the switch item, with no code
  on screen.

#### 3.1 The checklist items

| # | Section | Kind | Label | Done when |
| --- | --- | --- | --- | --- |
| 1 | people | set | Organisation details and logo | Name not the setup placeholder, registration number, address and logo all set |
| 2 | people | set | Units and cost centres | At least one `OrgUnit` and one `CostCentre` |
| 3 | people | set | People and their roles | Every office named on a rule of the in-force (or else the draft) matrix has a holder today; with no matrix, at least one assignment |
| 4 | approvals | confirm | Confirm approval limits | An issued `AuthorityMatrix` with `issuedByPersonId` set. A draft only: "confirm". |
| 5 | approvals | set | Committee members | Every live committee has at least its quorum (or 1 where quorum is unset) of members |
| 6 | purchasing | set | Document fees | At least one `DocumentFeeFloor` |
| 7 | purchasing | set | This year's public holidays | The window calendar has a `HolidayCalendarYear` for this year with at least one holiday |
| 8 | purchasing | confirm | Evaluation models | At least one issued `EvaluationModel`. Drafts only: "confirm". |
| 9 | suppliers-portal | set | Supplier document types | At least one live `SupplierDocumentType` |
| 10 | suppliers-portal | set | Declaration wording | A current terms, false-declaration and GIRO text, none ASSUMED (so the development fill's invented texts read "todo") |
| 11 | suppliers-portal | set | Personal data notice | `personalDataNoticeEn` set and `personalDataProvenance` not ASSUMED |
| 12 | suppliers-portal | set | Supplier help contact | `helpEmail` or `helpPhone` set |
| 13 | system | set | Email sender | **Hidden until step 7 builds email (SP-15)** |
| 14 | system | set | Letter templates | Every template slot an award or invitation letter reads (`WindowPolicy.*TemplateId`, `AwardPolicy` letter templates) is set |
| 15 | contracts-payments | set | Budget check source | The FR-REQ-007 budget check source is set |
| G1 | (before go-live) | go-live | Two-person approval | `SecurityPolicy.twoPersonChanges` true. While it is off: a link to the changes made by one person. |

The Suppliers & portal card also shows one status line, "Online registration: open / closed". When it is closed, it lists
`whatIsMissing` in words. This list is for staff only.

#### 3.2 What opens the public registration (all 24 `RegisterReadiness` conditions)

| Condition | Filled by |
| --- | --- |
| time zone, entity types, countries, states, numbering, banks, account types | generic |
| verification notice, quotas, daily limits, address limit, online declaration | generic |
| store rules (types and size) | generic |
| upload class, statement class | generic. On a database whose class list is not empty (the demo): the development fill sets them to the demo's classes, as `open-register-dev.ts` did. |
| document types | RSAJ pack. Demo database: the demo already has them. Otherwise checklist item 9. |
| personal data notice; terms, false-declaration and GIRO texts | **The customer** (checklist 10 and 11). On the demo database: the development fill (invented, ASSUMED, so the checklist still reads todo). |
| `ceilingSet` (`DOCUMENT_MAX_BYTES`), `storeDriverSet`, `formKeySet` (`PORTAL_FORM_SECRET`), `bodyCapSet` (`REGISTER_MAX_BODY_BYTES`) | **Deployment environment.** No pack sets them. 4.8 checks `.env` and reports any missing one. |

### 4.6 RSAJ pack, part 2, and the development fill

- **Agent:** domain-engineer. Runs in parallel with 4.7.
- **Migration:** no.
- **Files it owns:**
  - `prisma/rsaj/starter-pack/contracts.ts`, `suppliers.ts` and `system.ts`;
  - `prisma/dev-fill.ts` and its test.

  4.4's `index.ts` imports these by name, and they are written as empty exports in 4.4.
- **Work:**
  - **Contracts:**
    - award clocks: indent valid 14 days, start within 7 days (FR-AWD-006, FR-AWD-009);
    - copy recipients (FR-AWD-004) and appointment-letter variants (FR-AWD-007);
    - contract document parts (FR-CON-003) and the controlled-copy recipients (FR-CON-012);
    - in delay below 70% (FR-SUP-010);
    - half the retention released at as-built (FR-PAY-021);
    - design bond 5% for 5 years (FR-CMP-017; loaded, and hidden on screen until close-out ships);
    - the ERP number formats PROC, NM and IN (FR-REQ-002, FR-AWD-006).
  - **Suppliers:**
    - registration bodies SSM, CIDB, MOF and SPAN (FR-DOC-005, FR-VND-003);
    - supplier document types, mandatory or not, with expiry (FR-VND-002, FR-VND-004);
    - expiry reminders at 90, 60, 30 and 7 days (FR-VND-008);
    - suspension and blacklist reasons (FR-VND-010).
  - **System:** the RSAJ numbering patterns (RSAJ/KP/T/…; NFR-USE-004, FR-CON-002, FR-ADV-014).
  - **The development fill:**
    - It refuses unless `demoIsLoaded(db)`, whatever the switch reads.
    - It sets `twoPersonChanges` false with the SYSTEM actor "Development fill (founder's instruction 2026-10-23)" and the
      founder's words as the reason. This is the **only** exception to SP-23 (ADR 0043 D3): no other pack or script turns
      the switch off while it is on.
    - It then writes the three invented texts and the notice, marked "development wording, invented", ASSUMED.
    - Where the `SupplierPolicy` class group is still null **and** the organisation's class list is not empty (so generic
      will skip its own classes), it sets the upload class and statement class to the demo's classes. This is checkable
      before generic runs, and 4.8 runs the development fill first.

    This supersedes the scratchpad `open-register-dev.ts`, which was never run.
- **Tests:**
  - `rsaj-pack.test.ts`, extended to these parts;
  - `dev-fill.db.test.ts`: it refuses on a non-demo organisation, with the switch on or off; on a demo organisation it sets the switch off with one
    audit row, and a second run writes nothing.
- **Done when:** the dry run of `rsaj,generic` on a fresh organisation shows every STATED group in §7 marked "R-pack", and
  `dev-fill` on a demo copy opens the register (given the environment values).

### 4.7 The public portal never shows a gap; the sign-in banner fix

- **Agent:** frontend-engineer. Runs in parallel with 4.6.
- **Migration:** no.
- **Files it owns:**
  - `src/app/supplier/register/page.tsx` and `src/app/supplier/page.tsx` (the portal home);
  - `src/app/supplier/opportunities/**`, the closed-state parts only;
  - `src/lib/portal/labels.ts`, the closed-state words only.
- **Work:**
  - The closed register shows "Registration opens soon" with the help contact (or "Contact the procurement office" when
    none is set). It has **no** "What is missing" popover. Line 50's `MoreText` is deleted.
  - The portal home and Opportunities hide "Apply to register" while the register is closed.
  - The portal home's "how to bid" step reads the configured `WindowPolicy.submissionChannel`. When it is unset, the step
    is left out; it no longer says "on paper".
  - `whatIsMissing` stays, and is read only by the staff checklist (4.5).
- **Tests:**
  - `register-closed.test.ts` (rendered words): no item of `APPLY.missing` appears on any public page;
  - `english-only-scan.test.ts` still passes.
- **Done when:** with the register closed, the public pages show no setting name.
- **Note:** the sign-in banner bug (finding 9) is in `configuration/security/page.tsx`, which 4.2 owns. Its fix is in 4.2:
  the "Sign-in closed" callout uses `unsetSettings(policy, "SIGN_IN", "SUPPLIER_SIGN_IN", "SET_PASSWORD", "ISSUE_CODE")`,
  not every unset key. An unset `sealingPassphraseMinLength` instead shows "Online bid opening is off until the unseal
  passphrase length is set" on Bid sealing.

### 4.8 Security review, rollout, AGENTS.md

- **Agents:** security-auditor, then devops-engineer and docs-writer. Serial.
- **Migration:** applies 4.1's.
- **Work:**
  1. The security-auditor reviews 4.1 and 4.2. The questions to settle:
     - Can a switch-off path be reached while the switch is on?
     - Can on-to-off be made by one person?
     - Is any record-correction kind covered?
     - Are all three triggers still `ENABLE ALWAYS`?
     - Can a pack load into an organisation that is on? Only the development fill on a `demoIsLoaded` database may
       (SP-23); confirm it refuses elsewhere and that no other writer of `twoPersonChanges` exists, including outside
       `src/` (the writer scan covers `src/` only, so `prisma/dev-fill.ts` is checked by hand).
     - Can the app's database role change `twoPersonChanges` other than through a decided change (while on) or the
       editor (while off)?

     Must and Should findings are fixed before go-on.
  2. **Rollout to the founder's database** `perolehan` (organisation "Demo Utilities Sdn Bhd"). In PowerShell, from the
     repository, with `.env` naming `perolehan` and that organisation's `ORGANISATION_CODE`:

     ```
     npm run db:deploy
     npm run pack -- dev-fill            # dry run: switch off, texts, classes
     npm run pack -- dev-fill --apply
     npm run pack -- generic             # dry run: shows what the demo already has (skipped) and what it fills
     npm run pack -- generic --apply
     ```

     The RSAJ pack is **not** loaded onto the demo (SP-5). Its dry run may be printed for the founder to read.

     The auto-mode classifier blocked a write script on `perolehan` on 2026-10-23. If it blocks again, these commands go to
     the founder to run himself, and the step reports that.

     After the run, check that `/supplier/register` is open. If it is not, report which of the four environment values is
     missing.
  3. AGENTS.md:
     - rewrite the "Maker-checker deferred until sign-in" row as "Two-person configuration approval is an organisation
       switch (ADR 0043): off during setup, on before go-live; record corrections always two-person; nothing fakes a
       second person";
     - in "This is a product…", replace "Every screen handles the unconfigured state" with a line on the packs;
     - in "Provenance: the pattern to copy", say that provenance is recorded on every value and shown in History and in
       `RuleInfo` at the decision point (which flags OBSERVED and ASSUMED), not as chips on working screens; gap warnings
       stay visible on screen (SP-18).
  4. `prisma/demo.ts` header: replace "`npm run setup` still creates one empty organisation and nothing else" with a
     pointer to ADR 0043.
- **Done when:**
  - the security findings are closed;
  - the founder's register is open, or the exact missing environment value is reported;
  - AGENTS.md is committed with the work.

## 4. Step 5: Settings in six sections

### The section map (the only place this lives in code: `SETTINGS_SECTIONS` in `src/lib/nav.ts`)

Existing URLs do not change. Each existing page becomes an edit page under its section. Its breadcrumb is Settings, then the
section, then the page.

| Section (route) | Folders it owns | Essentials on top | Advanced fold |
| --- | --- | --- | --- |
| Organisation & people (`/configuration/people`) | `organisation`, `users`, `accounts` | Details, logo, structure, cost centres, people with sign-in, roles, assignments | Sites, permissions grid, reporting lines, delegations, branding of the sign-in and portal pages |
| Approvals (`/configuration/approvals`) | `approval-matrix`, `committees`, `routing-sheets` | Value bands, approval routes, committees and members | Terms bands, funder's rules, rejection destination, quorum, opening panel, voting details, routing sheets and targets. "Test a route" is a button, not a setting. |
| Purchasing & tenders (`/configuration/purchasing`) | `reference-data`, `requisitions`, `scope`, `tender-documents`, `invitation`, `evaluation` | Window rules, document fees, holidays, tender document parts and their templates, evaluation models | Reference lists, requisition gates, ERP formats, scope and estimate, schedules of rates, channels, receipt and opening per method, clauses, online bid file rules. BQ templates and panel columns are shown only while their switch is on (SP-6). |
| Contracts & payments (`/configuration/contracts-payments`) | `awards`, `contracts`, `post-award`, `budget` | Award clocks, budget check source | Recipients, letter variants, conditions, insurance and issuers, contract parts, copy stamp, supervision, payment, variation, clocks, certificate forms, budget ledger (SP-12). Close-out groups (row 96b) are not rendered. |
| Suppliers & portal (`/configuration/suppliers-portal`) | `suppliers` | Document types, declaration wording, personal data notice, help contact; "Online registration: open / closed" | Registration bodies and values (link to the Tender documents tab), lists, expiry bands, standing rules, reasons, intake limits |
| System (`/configuration/system`) | `notifications`, `numbering`, `templates`, `documents`, `security`, `bid-sealing`, `audit`, `changes` | Notifications, numbering, templates library | Sign-in settings and the two-person switch, document classes, upload rules, legal holds, bid sealing, finance sync, payment simulator, audit log (read-only) |

### 5.1 The Settings frame

- **Agent:** design-system-engineer. Serial; every pass waits on it.
- **Migration:** no.
- **Files it owns:**
  - `src/lib/nav.ts`: `CONFIG_PINNED` and `CONFIG_SECTIONS` are replaced by `SETTINGS_SECTIONS`, and a
    folder-to-section map. Step 6.1 later edits `STAFF_NAV` in the same file, after this step.
  - `src/components/shell/sidebar.tsx` (config mode only), `src/components/shell/config-nav.test.ts` and
    `src/components/shell/crumbs.test.ts`.
  - The six new section pages, each about 5 lines over a shared component:
    `src/app/configuration/{people,approvals,purchasing,contracts-payments,suppliers-portal,system}/page.tsx`.
  - `src/components/setup/section-page.tsx` and `src/components/setup/section-banner.tsx`.
  - `src/app/configuration/page.tsx` (from 4.5), to add the six section cards under the checklist, and
    `src/app/configuration/layout.tsx` (from 4.2), for `mayDraft`.
  - `src/app/configuration/records-ui.tsx` and `src/app/configuration/history.ts`. History gains a "Source" line that shows
    `whereItComesFrom` and the governing source in words.
  - `src/components/ui/provenance.tsx`.
  - `scripts/ui-text-rules.mjs`, `scripts/ui-text-baseline.json` and `scripts/text-snapshot.mjs`.
- **Work:**
  1. **The rail:** Getting started, then the six sections. A sub-page lights its section through the folder map.
  2. **Each section page:**
     - a `PageHeader` with the section title and an info popover;
     - the section banner "n settings need a value", which lists that section's checklist items still to do, each with a
       link. It is not shown when there are none.
     - an Essentials card: one row per essential, with a label, a state `Dot` and an Open link;
     - a `Disclosure` "Advanced", with one row per advanced group, each a link to the existing page and tab.
  3. **`ProvenanceBadge`** returns `null` on every screen. The data stays, and History shows it (step 1).
     - This one change takes the chips off all 39 call sites at once, including `src/app/projects/**`, without touching
       those files.
     - Each later pass deletes its dead calls.
     - `info-chip.test.ts` and `part-b-provenance.test.ts` are rewritten to assert that the provenance is **recorded** (the
       columns are written and History renders them), not that a chip shows.
  4. **The decision-point rule** (NFR-USE-001, FR-APR-019) gets a shared `RuleInfo` popover in
     `src/components/ui/rule-info.tsx`. It shows the rule in one sentence and its clause. Where the source is OBSERVED, it
     adds "Usual practice, not a written rule"; where ASSUMED, "Assumed, not from a written rule" (SP-18). Steps 5 and 6
     use it beside primary actions. Gap warnings are not `RuleInfo` text: a route assumed because no rule matches, a
     quorum not set, and a plain "Not set" stay visible on the screen, never only in a popover.
  5. **Word rules:** add `BANNED_WORDS` to `ui-text-rules.mjs` as a rule with the baseline ratchet, so a file may hold
     fewer, never more. It holds only the unambiguous phrases in §6's "Enforced" list. The single words are a review list,
     because "issue", "case", "act" and "window" also appear in legitimate text. Parallel passes do **not** edit the
     baseline; 5.9 tightens it.
  6. **Edit buttons** on any Settings page are hidden from a viewer without `configuration.draft` (UX review: an officer
     sees Edit). The page reads `mayDraft` once in the layout and passes it down.
  7. **Visible words:** add `--visible` to `scripts/text-snapshot.mjs`. It skips text under `.sr-only` or `[hidden]`
     ancestors. The pass metric (words down by half) counts visible words. The full snapshot proves nothing was lost.
- **Tests:**
  - `config-nav.test.ts`, rewritten: every folder maps to exactly one section; six sections; each label equals its crumb;
  - `section-page.test.ts`: essentials before Advanced, and the banner hidden when nothing is to do;
  - `history-entities.test.ts` still passes;
  - `permission-gates.test.ts`.
- **Done when:** the rail shows 7 items; every old page is reachable from its section in two clicks; and the text snapshot
  shows no provenance chip words, with the History drawers holding them.

### 5.2 to 5.7: the section passes

Each pass does the same seven things inside the folders it owns, and nothing outside them:

1. Put essentials first. Every advanced card goes into one `Disclosure` "Advanced", at the bottom.
2. Delete the dead `ProvenanceBadge` calls and every on-screen "Where it comes from" or "(invented)" line. They are already
   in History (5.1).
3. Turn each consequence sentence ("While unset, …") into the field's info popover (`MoreText` or `InfoChip`), at most 25
   words. Show "Not set" as plain grey text, not a chip. Gap warnings stay on screen, not in a popover (SP-18): a route
   assumed because no rule matches, a quorum not set, and "Not set" itself.
4. Apply the word list (§6) to every literal in the folder.
5. Give each page `export const metadata = { title: "<page label>" }` (the template arrives in 6.1).
6. Delete repeated notes: say once per page.
7. Run the text snapshot before and after. The only text that may disappear is provenance words, "(invented)" lines and
   duplicates. Popover text stays in the page as screen-reader text.

| Step | Section | Wave and pair | Extra work beyond the seven |
| --- | --- | --- | --- |
| 5.2 | Purchasing & tenders | 5-b, with 5.3 | Invitation (1,028 words) and Evaluation (633) first. Render the BQ template and spec-panel column cards only while their `ScopePolicy` switch is true (SP-6). The requisition controls' splitting fields are left alone (5.8 removes them). |
| 5.3 | Organisation & people | 5-b, with 5.2 | Merge Sign-in accounts into People: the People list gains a "Sign-in" column (Active, Not activated, Locked or Disabled) and the account actions (create, issue code, disable, unlock) from `accounts/editors.tsx`, which move into `users/`. `/configuration/accounts` redirects to `/configuration/users?tab=people`. Branding cards go into Advanced. |
| 5.4 | Approvals | 5-c, with 5.5 | Committees table: the "Retire" column no longer clips at 1440 and 1280 (give the actions column a fixed width and wrap the name; check `matrix-width.test.ts`). The simulator becomes a "Test a route" button that opens the existing simulator in a drawer. Labels: "Value bands", "Approval routes", "Standard route", and "Exact amount at a limit" for the boundary switch. |
| 5.5 | Suppliers & portal | 5-c, with 5.4 | The wordiest page (1,325 words). Delete the Malay text fields from the page and its editors, not hide them (English only; Malay removed 2026-10-19). The columns stay; dropping them is a separate schema item. |
| 5.6 | Contracts & payments | 5-d, with 5.7 | Do not render row 96b's groups (termination, nominated parties, design bond, release points, final account) until close-out ships. The data and the pack values stay. Budget's ledger pages go under Advanced (SP-12). |
| 5.7 | System | 5-d, with 5.6 | **Move the two-person queue:** `configuration/changes/changes-list.tsx` is shared as is. `/approvals` gains `Tabs`: "Steps" and "Settings changes (n)". The second tab renders the list for those who may read the queue. `/configuration/changes` redirects to `/approvals?tab=changes`. This step owns `src/app/approvals/page.tsx` for the tab only. Security page wording; the payment simulator under Advanced; the audit trail read-only under Advanced. |

- **Agent:** frontend-engineer for each pass.
- **Migration:** none.
- **Tests per pass:**
  - the folder's existing `*.test.ts` and `*.db.test.ts`;
  - `english-only-scan.test.ts`, `permission-gates.test.ts` and `history-entities.test.ts`;
  - `npm run lint`, which checks the word rules against the baseline.
  - 5.3 adds `accounts-merged.test.ts`: every account action that was reachable is reachable from People.
  - 5.7 adds `approvals-tabs.test.ts`: the queue tab is hidden from a reader without the permission.
- **Done when:**
  - the page's **visible** words are down by at least half (`text-snapshot.mjs --visible`);
  - no field, warning or action has been lost (the diff is reviewed);
  - the sibling pages in the section match.

### 5.8 Remove the splitting settings (row 44)

- **Agent:** data-modeler. Runs in parallel with 5.9.
- **Migration:** yes, `<ts>_drop_splitting_settings`. It drops:
  - `RequisitionPolicy.splittingWindowDays`, `splittingMatchOn`, `splittingAggregateAcrossYear` and
    `splitJustifyingRoleCode`;
  - `AuthorityMatrix.splittingWindowDays` (marked deprecated: "never read").

  It **keeps** `RequisitionSplitCheck`, `ApprovalInstance.splitCheckId`, `splitState` and the `SplitState` enum. Those are
  the history of decided requisitions.
- **Files it owns:**
  - `prisma/schema.prisma`;
  - `src/lib/requisition/repo.ts`, `src/lib/requisition/types.ts` and `src/lib/requisition/splitting.ts` (the dead
    `assessSplitting`, `justifierFaults` and `splitApprovalFault` go; `splitStateLabel` stays);
  - `src/lib/authority/revision.ts`;
  - `src/app/configuration/requisitions/*` and `src/app/configuration/approval-matrix/actions.ts` (the field only);
  - `src/app/configuration/history.ts`, which keeps labels for the dropped fields so old audit rows still read.
- **Tests:**
  - `history-entities.test.ts`: an old audit row with `splittingWindowDays` renders its label;
  - a typecheck with no reference to the dropped columns;
  - the requisition db tests.
- **Done when:** the migration is applied on `perolehan` by `db:deploy`, and the backlog's "Splitting check leftovers" item
  is marked done.

### 5.9 Plain-words scan, comparators, baseline

- **Agent:** test-engineer. Runs in parallel with 5.8.
- **Migration:** no.
- **Files it owns:**
  - `scripts/ui-text-baseline.json` (tightened to the new counts);
  - `scripts/compare-screen.mjs` and `scripts/compare-drawer.mjs` (`ALLOWED_EXTRA` and `DECIDED_FIELDS` for every
    configuration field moved to History or a popover, each with "ADR 0043 / simplification plan 5.x" as its reason);
  - `docs/notes/design/0002-configuration-navigation.md` (a "Superseded by simplification plan step 5" line at the top).
- **Done when:** `npm run lint` passes with the tightened baseline, the comparators pass, and the ui-guidelines-reviewer
  has reviewed the six section pages side by side.

## 5. Step 6: navigation, Home and the record layout

### 6.1 The shell

- **Agent:** design-system-engineer. Serial.
- **Migration:** no.
- **Files it owns:**
  - `src/lib/nav.ts` (`STAFF_NAV`);
  - `src/components/shell/sidebar.tsx`, `topbar.tsx` and `record-crumb.tsx`;
  - `src/app/layout.tsx`;
  - `src/components/ui/stepper.tsx`, `src/lib/ui/steps.ts` and `src/components/data-list.tsx`;
  - new: `src/components/ui/more-actions.tsx` and `src/components/ui/status-counts.tsx`;
  - `src/components/ui/page-header.tsx`.
- **Work:**
  1. **The sidebar** has four groups:
     - **Work:** Home, My approvals, Inbox;
     - **Buying:** Requisitions, Tenders & quotations (the `/sourcing` label), Projects (the `/projects` label, which was
       "Contracts");
     - **Records:** Suppliers, Committees;
     - **Settings:** Settings (the `/configuration` label).

     There is no Reports item: step 7 adds it when it builds Reports (SP-12). Settings shows only to readers of the
     checklist (SP-21). The organisation's name appears once, in the top bar; the sidebar shows the logo only.
  2. **Breadcrumbs:** the root is always the sidebar label of the area, on lists and records alike. No page uses `eyebrow`,
     because the crumb carries it. Delete the existing eyebrows in 6.2 to 6.6, each in its own folder.
  3. **Page titles:** `metadata.title = { template: "%s · Perolehan", default: "Perolehan" }` in the root layout (Next 16
     `title.template`; see `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`).
  4. **The stepper** (SP-17):
     - done is emerald, current is brand indigo with a brand ring, and amber is kept for warnings only;
     - add an optional `owner` to `StepperStep`, a role shown under the label (ePerolehan's role-owned steps);
     - wrap labels at most two lines, with no overlap at 1280 (the 5-phase change in 6.4 removes the 12-step crowding).
  5. **`MoreActions`:** a `details`/`summary` menu button (keyboard-operable, as `Disclosure` is) for secondary and
     destructive actions in a `PageHeader`.
  6. **DataList:** when **every** row's cell in a `sulit` column is `withheld`, drop the column and show one `Note` above
     the list: "Values hidden (SULIT)", with a popover giving the reason. This is presentation only (FR-EVL-014); export
     already leaves the column out.
  7. **`StatusCounts`:** chips of status and count that link to a filtered view, with zeros hidden. It replaces counter
     subtitles.
- **Tests:**
  - `stepper.test.ts` (colours by state, owner line);
  - `data-list.test.ts` (an all-withheld column collapses; a mixed column stays);
  - `crumbs.test.ts`;
  - a new `nav.test.ts`: four groups, no item that is not built.
- **Done when:** every list and record shows the same crumb root and the same title format.

### 6.2 Home

- **Agent:** frontend-engineer. Runs in parallel with 6.3.
- **Migration:** no.
- **Files it owns:** `src/app/page.tsx`, `src/lib/dashboard/**` and `src/lib/dashboard.ts`.
- **Work:**
  - **"Needs you":** one list, in this order:
    - my approval steps;
    - my committee sittings this week;
    - my overdue items (an approval past its target, an expiring document I own);
    - settings changes waiting for me.

    Each row has one action link. The list comes from `requestWorklist`, which is already shared with the sidebar badge.
  - **Four figures:** Waiting for me, Open requisitions, Live tenders & quotations, and Projects in delay.
  - Drop the "Project health" Not-built card and `COMING`.
  - Activity: 5 lines, with the reference written once.
  - Empty state: "Nothing needs you" with a link to My approvals.
- **Tests:** `dashboard.db.test.ts` (the list's order and the four counts); SULIT judging stays.
- **Done when:** Home has no organisation-wide table above the personal list, and no card for a module that is not built.

### 6.3 Requisitions

- **Agent:** frontend-engineer and domain-engineer. Runs in parallel with 6.2.
- **Migration:** no.
- **Files it owns:** `src/app/requisitions/**` and `src/lib/requisition/primary-action.ts` (new, pure).
- **Work:**
  - **`primaryAction(status, viewer)`** returns at most one of Submit, Endorse, Approve, Recommend, Recall or Source, plus
    a `RuleInfo` ("Why this approver?": the rule and clause from the route snapshot, FR-APR-019).
    - It is drawn as the header's one primary action. Everything else goes into `MoreActions`.
    - An action the viewer cannot use is not drawn. The disabled Recall and its sentence go.
  - "Record decision" moves from the Approval tab to the header.
  - An approved requisition links to its tender or quotation.
  - The stepper names the approver in force **after** escalation (UX finding 5).
  - New requisition: replace "No unit on record. Nothing filled in." with the plain field state, and mark required fields
    with an asterisk, not "Required to submit."
  - The list's subtitle uses `StatusCounts`.
- **Tests:**
  - `primary-action.test.ts`: every status against each viewer role gives at most one action;
  - the requisition screen tests;
  - an escalation test for the stepper.
- **Done when:** an approver sees "Approve" in the header with its "Why" popover, and nobody sees a disabled action.

### 6.4 Tenders & quotations

- **Agent:** frontend-engineer and domain-engineer. Runs in parallel with 6.5.
- **Migration:** no.
- **Files it owns:**
  - `src/app/sourcing/**`;
  - `src/lib/method/flow.ts` and `src/lib/method/primary-action.ts` (new).
- **Work:**
  - **`sourcingPhases(input)`** wraps `sourcingFlow`. It does not replace it: the server gates and `exerciseFlow` are
    untouched. It folds the 12 steps into 5 phases, each with its owner role:

    | Phase | Its steps | Owner |
    | --- | --- | --- |
    | Prepare | requisition raised, requisition approved, drafted, scope and estimate, tender documents | Secretariat |
    | Publish | approval for tendering, published | Secretariat |
    | Bids | bids received, opening, schedule of tenders | Opening committee |
    | Evaluate | evaluation | Evaluation committee |
    | Award | award | Tender Board |

    The owners are display defaults. Where an `AuthorityRole` or committee is configured for the step, its name is used
    instead.
  - The current phase shows "Step n of m: <SR v2 §3 name>" under it (SP-14). A phase is done when all its steps are done,
    and current when any of them is.
  - **`primaryAction`:** the next step's act is the header's primary action. "Cancel exercise" goes into `MoreActions`.
    Clause codes and letters go into `RuleInfo`.
  - New exercise: the prompt "Pick the approved requisition to source", and the withheld columns collapse (6.1).
  - The list uses `StatusCounts`.
- **Tests:**
  - `phases.test.ts`: every fixture in `flow.test.ts` maps to the right phase states, and a cancelled exercise keeps its
    proof steps;
  - the sourcing screen tests.
- **Done when:** the stepper has 5 phases with no overlap at 1280 and 1440, and the header holds one primary action.

### 6.5 Approvals, Inbox, Committees, Suppliers lists

- **Agent:** frontend-engineer. Runs in parallel with 6.4.
- **Migration:** no.
- **Files it owns:**
  - `src/app/approvals/**` (after 5.7's tab), `src/app/inbox/**` (**gated**: the concurrent builder edits `src/lib/inbox/**`,
    so this step does not touch `src/lib/inbox`);
  - `src/app/committees/**` and `src/app/suppliers/**`.
- **Work:**
  - "Approve", "Recommend" and "Propose", with no "(A)", "(R)" or "(P)".
  - Drop "Not emailed" until step 7 sends email.
  - Empty states: one sentence and one link.
  - Counter subtitles become `StatusCounts`.
  - Suppliers' "not emailed… not built" goes.
- **Tests:** the existing screen tests, with the words updated.
- **Done when:** no code letter or "not built" appears on these screens.

### 6.6 Projects (gated)

- **Agent:** frontend-engineer. Runs in parallel with 6.7.
- **Starts only** when the builder now working in `src/app/projects/**` and `src/lib/inbox/**` has committed and stopped.
- **Migration:** no.
- **Files it owns:**
  - `src/app/projects/**`;
  - `src/lib/contract/primary-action.ts` (new) and `src/lib/contract/stage.ts`, read only, for the live stage.
- **Work:**
  - A project opens on its **live stage**, not on Award. A signed contract on site opens on "On site".
  - Two navigation levels at most: the stage stepper and that stage's tabs. The 4 sub-tabs become sections inside their
    tab.
  - One primary action per stage, by `primaryAction(stage, viewer)`.
  - Hide "Ready to sign?" once the contract is signed.
  - "Next: On site" gets its date or owner, or goes.
  - Delete the dead `ProvenanceBadge` calls on signed figures (they already render nothing after 5.1).
  - The list: one Stage/Status chip; "Case" becomes "Project"; no Assumed chip.
- **Tests:** `primary-action.test.ts`; `kick-off-screen.test.ts` and the project screen tests, with the words updated.
- **Done when:** con13 opens on its live stage, with one primary action and no "Gate met".

### 6.7 Page titles and the layout-bug sweep

- **Agent:** frontend-engineer. Runs in parallel with 6.6.
- **Migration:** no.
- **Files it owns:**
  - every `page.tsx` **not** owned by 5.x, 6.2 to 6.6 or 4.7: the remaining `src/app/supplier/**`, `src/app/account/**`
    and `src/app/sign-in/**`;
  - a new test, `src/app/page-titles.test.ts`, which fails on any `page.tsx` with neither `metadata.title` nor
    `generateMetadata`. Record pages use `generateMetadata` with the record's reference.
- **Work:**
  - add the titles;
  - fix the wrapping chips (`Chip` gets `whitespace-nowrap` and a max width with truncation, in `badge.tsx`; 6.7 owns
    that file);
  - check the shell at 1280 and 1440.
- **Done when:** the titles test passes, and no screen in the 62-screenshot set has overlapping or clipped text.

### 6.8 Close-out

- **Agents:** ui-guidelines-reviewer, ux-reviewer and test-engineer. Serial.
- **Work:**
  - re-take the 62 screenshots at 1440 and 1280;
  - diff the text snapshots against the step-4 baseline;
  - update the comparator lists for record screens;
  - run `npm run test:db` and the Linux run (`scripts/test-linux.ps1`);
  - append "Done" to each step here.
- **Done when:** the UX review's top 10 are each closed or recorded as an SP decision.

## 6. Word list

**Enforced by `BANNED_WORDS` (5.1):**
- (invented)
- Core routing
- band famil
- Boundary ruling
- SULIT · withheld
- Gate met
- "(A)", "(R)" and "(P)" after an action name
- Changes awaiting a second person
- Not built
- Not emailed
- Recorded by demo loader
- Where it comes from

**The full list** is applied by review in each pass. "Assumed" and "Usual practice" stay allowed inside `RuleInfo` (SP-18).

| Do not write | Write |
| --- | --- |
| Configuration | Settings |
| Changes awaiting a second person | Settings changes to approve |
| propose, proposal (a setting) | send for approval, waiting for approval |
| maker-checker, two-person, second person (on working screens) | another admin approves |
| issue (a draft matrix or model) | put in force |
| Provenance, Where it comes from | (History only) Source |
| Stated, Observed, Assumed (as chips) | (History only) From a written rule, Usual practice, Assumed |
| (invented), Recorded by demo loader | (History only) |
| Not set (as a chip with an essay) | Not set (plain text) |
| band family, Three band families | value bands |
| core routing, From core routing | standard route |
| routing rules | approval routes |
| boundary ruling, boundary inclusive | exact amount at a limit |
| matter | the record's own name (requisition, variation…), or "item for approval" |
| regime | rule set |
| Approve (A), Recommend (R), Propose (P), JR | Approve, Recommend, Propose, Recommend jointly |
| overridden | changed |
| SULIT · withheld | Hidden (SULIT) |
| gate, Gate met | check, Ready |
| exercise, sourcing exercise | tender, quotation (the method's name); the list is "Tenders & quotations" |
| case, Contracts (the menu) | project, Projects |
| act, acts | action |
| recorded on behalf | recorded for {name} |
| supersede(d) | replace(d) |
| retire(d) | no longer used |
| lapse(d) | expired |
| attestation | confirmation |
| pinned | fixed for this tender |
| deliverable kind | type of work |
| taxonomy | categories |
| window (invitation window) | tender period |
| unattributed | before sign-in |
| organisation's day | today |
| recusal, recused | stepped aside |
| Not built yet, Not emailed | (nothing: do not promise or apologise) |

**Kept, because they are the customer's own terms:** Indent, Quorum, SULIT, S.O., BQ, DAL, Tender Board, routing sheet.
Each gets an info popover the first time it appears on a screen.

**Rules:**
- An action label is a verb.
- A refusal names what blocks and what to do, in 20 words or fewer. Its clause goes in `RuleInfo` (NFR-USE-002).
- No code on screen (AGENTS rule 5).
- The budgets of note 0005 apply.

## 7. Requirement trace (every default, fold, move, hide and removal)

The row numbers are the research's.

**Treatment codes:**
- **Top:** an essential.
- **Adv:** under the Advanced fold.
- **R-pack:** loaded STATED by the RSAJ pack.
- **G-pack:** loaded ASSUMED by the generic pack.
- **Move:** placed elsewhere.
- **Hide:** not rendered until its module ships.
- **Remove:** dropped.

Every row keeps its data, its editor and its History. Only where the row shows changes.

| Rows | Group | Required by | Treatment | How the requirement stays met |
| --- | --- | --- | --- | --- |
| 1–4 | Organisation details, logo, structure, cost centres | FR-CRT-002, NFR-GEN-001, FR-REQ-001, FR-REQ-007, NFR-SEC-001 | Top (people); checklist 1 and 2 | Unchanged editors |
| 5 | Sites | prototype | Adv | Unchanged |
| 6 | Time zone | build ruling | G-pack (Asia/Kuala_Lumpur), Adv | Editable; sittings no longer blocked |
| 7, 8 | Sign-in and portal branding | sign-in programme | Adv | Unchanged |
| 9 | Two-person queue | NFR-SEC-004, FR-APR-020 | Move to My approvals, tab "Settings changes" (5.7) | Same list and same decisions; covered by the switch, on before go-live (ADR 0043 D3) |
| 10–12 | People, roles, assignments | NFR-SEC-001, FR-APR-001/002/007, FR-SUP-001 | Top; checklist 3 | Unchanged |
| 13 | Permissions grid | NFR-SEC-001, NFR-SEC-004 | Adv | Unchanged (role templates from spec 5.4 are a later pack entry; SP-19) |
| 14 | Delegation | FR-APR-011, FR-APR-012 | Adv (people), not moved (SP-13) | Unchanged |
| 15 | Reporting lines | FR-APR-010, FR-APR-011 | Adv | Unchanged |
| 16 | Sign-in accounts | NFR-SEC-005 | Merge into People (5.3) | Every account action still reachable (test) |
| 17 | Sign-in settings | NFR-SEC-006 | G-pack, Adv (system) | Sign-in no longer closed on a new organisation |
| 18, 19 | Value bands, routing rules | FR-MTD-001/002/003, FR-APR-001–004, FR-REQ-009 | Top; R-pack as a **draft**; checklist 4 (confirm = put in force) | Nothing routes until a named person puts it in force (ADR 0043 D2) |
| 20–22 | Terms bands, funder's rules, rejection destination | FR-AWD-007, FR-REQ-006, FR-APR-013, FR-APR-016 | Adv; 22 G-pack (back to the originator) | Unchanged |
| 23 | Draft and issue lifecycle | FR-APR-020 | Kept | Put in force is where the checker attaches |
| 24 | Simulator | prototype | "Test a route" button | Unchanged logic |
| 25, 26 | Committees, membership | FR-CTE-001/002, FR-OPN-001 | Top; R-pack (six committees, no members); checklist 5 | Unchanged |
| 27–29 | Quorum, not-approved outcomes, opening panel | FR-CTE-003, FR-CTE-009, FR-OPN-002, FR-CTE-011 | R-pack (3, the three outcomes, 2), Adv | A vote against can now be recorded; `assessQuorum` unchanged |
| 30 | Alternate voting, voting rule, labels | build rulings | Adv | Unchanged |
| 31–35 | Funding routes, methods, contract types, bases, proposal items | FR-REQ-004–006, FR-MTD-004/006/011/012/013 | R-pack, Adv | Unchanged editors |
| 36–38 | Justification reasons, classifications, mixed-scope threshold | FR-MTD-009/011/014 | Adv | Unchanged |
| 39 | Notifications | FR-APR-018, FR-VND-008, FR-BID-009, FR-SUP-013, FR-LAD-012 | Top (system); starter rules with email in step 7 (SP-16) | Unchanged until step 7 |
| 40, 43, 45 | Endorsement, committee gates, recheck days | FR-REQ-003, FR-REQ-005, FR-REQ-012; build | Adv | Unchanged |
| 41 | Budget check source | FR-REQ-007 | Top (contracts-payments); checklist 15 | Unchanged |
| 42 | ERP number formats | FR-REQ-002, FR-AWD-006 | R-pack, Adv | Unchanged |
| **44** | Splitting window, aggregate, justifier | **Superseded** (founder removed FR-REQ-015, 2026-10-05) | **Remove** (5.8; columns dropped) | Split-check history kept and still labelled |
| 46, 47 | Budget ledger and controls | FR-REQ-007/008; prototype | Adv (contracts-payments); moves to Reports in step 7 (SP-12) | Unchanged |
| 48 | Finance sync | NFR-INT-001 | Adv (system) | Unchanged |
| 49 | Remaining payment settings | FR-PAY-002 | Adv (contracts-payments) | Unchanged (batch A removed the unread ones) |
| 50–52, 55, 58 | Measurement, estimate roles, qualifications, rates, scope approval | FR-EST-003/004/008, FR-MTD-010, FR-REQ-012/014 | Adv | Unchanged |
| 51, 56, 57 | Estimate lead time, methods needing estimate, bases on BQ | FR-EST-006/007, FR-MTD-013 | R-pack, Adv | Unchanged |
| **53** | Bill templates and sections | **Superseded** by SR-09 | **Hide** while `onScreenBillUsed` is false; drop later (SP-6) | On-screen bills of exercises pinned true still work |
| **54** | Spec-panel columns, the two switches | **Superseded** by SR-08, SR-09 | Switches R-pack false; columns **hidden** while false; drop later (SP-6) | ADR 0035's per-exercise pins kept |
| 59, 60 | Tender document parts, template files | FR-DOC-001/002/013, SR-11 | Top; R-pack parts | Unchanged |
| 61, 63, 65 | Clauses, restriction stamp, online bid file rules | FR-DOC-003/004/009/011/014, SR-13/14, NFR-SEC-007 | Adv | Unchanged |
| 62 | Registration bodies | FR-DOC-005, FR-VND-003 | R-pack; linked from Suppliers & portal | Unchanged editor (in Tender documents) |
| 64 | Pack per method | FR-DOC-013 | R-pack, Adv | Unchanged |
| 66 | Window rules | FR-ADV-004/006/007 | Top; R-pack (14 days, 2 days, 14:30) | Unchanged checks |
| 67 | Publication channels | FR-ADV-001 | R-pack, Adv | Unchanged |
| 68 | Fee floors | FR-ADV-008 | Top; checklist 6 | Unchanged |
| 69 | Holidays and weekend | FR-ADV-005 | Top; G-pack weekend; checklist 7 for dates (SP-7) | Unchanged checks |
| 70, 71 | Receipt and opening per method | FR-BID-003/007/011, FR-OPN-001, FR-ADV-012, SR-14 | Adv | Unchanged |
| 72 | Opening policy; Malay Grand Summary words | FR-OPN-005/010; NFR-LNG-001 | Adv; the Malay fields deleted from the screens (5.5; English only); columns dropped later | Go-live condition unchanged |
| 73 | Sale mode, channel, simulator | SR-10, SR-13 | R-pack sale mode ONLINE; channel unset (paper path until LIVE); simulator Adv (system) | Simulator still a go-live item |
| 74 | Bid sealing and attestations | FR-BID-001, NFR-SEC-003 | Adv (system); covered by the switch like any setting (ADR 0043 D3) | LIVE issue conditions unchanged |
| 75 | Evaluation models | FR-EVL-006/007/008/009 | Top; R-pack as **drafts**; checklist 8 | Put in force by a named person |
| 76 | Qualitative aspects | FR-EVL-003 | R-pack, Adv | Unchanged |
| 77–80 | Evaluation policy, anonymised scoring, readers, routes | FR-EVL-005/014/017/020 | Adv | Unchanged |
| 81 | Award clocks | FR-AWD-003/006/009 | Top; R-pack (14, 7) | Unchanged |
| 82–88 | Units, copy recipients, letter variants, conditions, insurance, issuers, non-award | FR-CON-001, FR-AWD-004/007/010/012/013/014 | Adv; 83 and 84 R-pack | Unchanged |
| 89 | Letter templates | FR-AWD-003 | Linked from System › Templates; checklist 14 | Unchanged editor |
| 90–92 | Legal office and signatory, contract parts, controlled copy | FR-CON-003/005/006/007/012, FR-AWD-002 | Adv; 91 and 92 R-pack | Unchanged |
| 93–95, 96a, 97, 98 | Supervision, payment, variation, time and damages, clocks, certificate forms | FR-SUP-001/003/005/010, FR-PAY-007/014–016/021, FR-VAR-009/024, FR-LAD-012, FR-EOT-*, FR-CRT-001/007 | Adv; R-pack 70% and the half-retention point | Unchanged |
| **96b** | Termination, nominated parties, design bond, release points, final account | FR-TRM-014, FR-NSC-*, FR-CMP-017, FR-FIN-* | **Hide** until close-out ships; design bond R-pack loaded | Close-out is parked after go-live (Award & Contract v2 §1) |
| 99 | Contractor may sign in the portal | build | Adv (default unchanged) | Unchanged |
| 100, 102 | Registration values; entity, country, state and bank lists | FR-VND-001/003/005 | Existing RSAJ loader; G-pack lists | Registration no longer blocked by an empty list (SR-01) |
| 101 | Supplier document types | FR-VND-002/004 | Top; R-pack; checklist 9 | Unchanged |
| 103 | Notices, expiry bands, standing rules | FR-VND-004/008/010, FR-ADV-010, FR-BID-008 | R-pack (90/60/30/7); verification notice G-pack; Adv | Unchanged |
| 104 | Blacklist first-offence period | build | Adv | Unchanged |
| 105, 106 | Personal data notice, limits, help contact | RSEC-6, FR-VND-006 | Notice and help contact Top (checklists 11 and 12); limits G-pack, Adv | RSEC-6 go-live condition unchanged |
| 107 | Declaration wording | FR-VND-005/006 | Top; checklist 10 (the customer's text; never a product default) | Unchanged |
| 108 | Suspension and blacklist reasons | FR-VND-010 | R-pack, Adv | Unchanged |
| 109–112 | Classes, upload rules, legal holds, lowering a class | NFR-SEC-002/007, NFR-RET-001/002, BD-DS-11 | G-pack classes and upload rules; Adv; lowering stays always two-person | Uploads no longer refused on a new organisation |
| 113–118 | Templates, signature blocks, distribution, printed fields, corrections, terms | FR-CRT-001/002/004/006/010/011, NFR-SIG-003 | Templates Top (system); the rest Adv | Unchanged |
| 119, 120 | Routing sheet types, ICC targets | FR-CRT-007/008, FR-APR-018 | R-pack, Adv (approvals) | Unchanged |
| 121 | Numbering | NFR-USE-004, FR-CON-002, FR-ADV-014 | R-pack (RSAJ patterns); G-pack (generic); Adv (system) | Unchanged |
| 122 | Audit trail | FR-APR-015, NFR-AUD-003/006, FR-RPT-010 | Read-only under System › Advanced | Unchanged; History drawers everywhere |

**What the simplification does not cut:**
- the rule and clause at each decision point, through `RuleInfo` (NFR-USE-001, FR-APR-019);
- refusals in rule terms (NFR-USE-002);
- two-person approval, on before go-live, and always for record corrections (NFR-SEC-004, FR-APR-020);
- the audit trail (FR-APR-015, NFR-AUD-*);
- the award-to-contract rules C-3: FR-AWD-001, 003, 004, 006, 008 and 009, and FR-CON-002. These are untouched.

## 8. Open decisions (made here, for the product owner)

Each decision states the recommendation it carries.

- **SP-1. Generic and RSAJ packs.** The generic pack holds no authority value: no DAL, committees, thresholds, fees or day
  counts. A second customer gets generic values plus the checklist, never RSAJ's DAL. *Recommend: as written.*
- **SP-2. Confirming the DAL means putting the draft in force.** No separate "confirmed" table. Evaluation models work the
  same way.
  - **SP-2a.** The slashed DAL codes JR/R and JR/P are transcribed as the test fixture reads them (JR, P), each with its
    reason, but load as ASSUMED with that reading as the source, not STATED. `rsaj-pack.test.ts` exempts only those rows
    from "none ASSUMED". The joint partner office stays unmodelled, and that is a question for RSAJ. *Ruled (product
    owner, 2026-10-23): changed to ASSUMED as here.*
- **SP-3. The switch default.**
  - The schema default is ON, so existing organisations stay on.
  - The generic pack sets it OFF only when it creates the `SecurityPolicy` row of a new organisation at setup.
  - The development fill sets it OFF on a demo database.

  *Recommend: as written. Setup is before go-live, and one administrator must be able to configure.*
- **SP-4. While the switch is off, a save applies directly, with no `ConfigurationChange` row.** The changes made by one
  person are the audit rows with a person actor that carry the fixed reason `ONE_PERSON_REASON` (ADR 0043 D3, 4.5 G1).
  This keeps the change table's database guards absolute. *Ruled (product owner, 2026-10-23): as written, with this
  wording.*
- **SP-5. The founder's database gets the development fill and the generic pack, not the RSAJ pack.** The RSAJ lists would
  land beside the demo's invented ones. *Recommend: as written. A fresh RSAJ organisation shows the RSAJ pack.*
- **SP-6. Rows 53 and 54 are hidden now, not dropped.**
  - Why: `BqTemplate` is still read when an on-screen bill starts (`sourcing/[id]/scope/actions.ts`). ADR 0035 pins the
    switches on each exercise, and `onScreenBillUsed` is read in 24 files.
  - Now: the RSAJ pack sets both switches false, and their cards render only while a switch is true.
  - The drop is a backlog item, gated on a pre-check that no exercise in draft is pinned true.

  Only row 44 is a schema drop now. *Recommend: as written.*
- **SP-7. No gazette holiday dates are shipped.** They change every year, and a wrong date moves a closing. The generic
  pack sets the weekend (Saturday and Sunday); checklist 7 asks for this year's dates. *Recommend: as written.*
- **SP-8. The generic pack ships Bank Negara Malaysia's list of licensed commercial banks**, with its access date as the
  source. *Recommend: yes. Registration needs a bank list, and the list is a public fact.*
- **SP-9. Legal texts (terms, false declaration, GIRO, personal data notice) are never in a pack.** Only the development
  fill has invented ones, and the checklist still reads "todo" for them. *Recommend: as written.*
- **SP-10. Routes stay the same.** The `/configuration` URL stays; the menu says "Settings". The six sections are static
  folders, and every old page stays as an edit page. *Recommend: as written. There are no broken links.*
- **SP-11. The checklist has no confirmation table.** "Confirm" items are confirmed by putting the draft in force; the
  others are done when their rows exist. *Recommend: as written.*
- **SP-12. No Reports item in the sidebar until step 7 builds Reports.** Budget stays under Contracts & payments ›
  Advanced until then. *Recommend: as written.*
- **SP-13. Delegation ("I'm away" on the person's own page) is not moved now.** It stays in People › Advanced and is
  reconsidered in step 7. *Recommend: as written.*
- **SP-14. The tender stepper shows 5 phases.** The founder's approval of 2026-10-23 overrides ruling 7 / GAP-F1's
  12-step display. The SR v2 §3 step names stay as "Step n of m" under the current phase, and the server gates are
  unchanged. *Recommend: as written.*
- **SP-15. The "Email sender" checklist item is hidden until step 7 builds email.** It is not shown as "not set".
  *Recommend: as written.*
- **SP-16. Notification starter rules come with email in step 7, not in the generic pack.** The rules name offices, which
  are the customer's. *Recommend: as written.*
- **SP-17. Stepper colours:** done is emerald, current is the design system's brand indigo (not a separate blue), and
  amber is for warnings only. *Recommend: as written.*
- **SP-18. Provenance leaves working screens entirely,** including contract figures.
  - It stays in the data and in History.
  - At a decision point, `RuleInfo` flags OBSERVED ("Usual practice, not a written rule") and ASSUMED ("Assumed, not
    from a written rule").
  - Gap warnings (a route assumed because no rule matches, a quorum not set, a plain "Not set") stay visible on screen,
    not in popovers.
  - AGENTS.md's Provenance section is amended in 4.8 to say this.

  *Recommend: as written.*
- **SP-19. Role templates from spec 5.4 for the permissions grid are not in the packs now.** That is a later pack entry.
  *Recommend: defer.*
- **SP-20. Page title format:** "<Page> · Perolehan", using the product name, not the organisation's. *Recommend: as
  written.*
- **SP-21. Settings shows in the sidebar only** to holders of `configuration.draft`, `configuration.issue` or `audit.read`,
  and to administrators. Edit buttons show only to `configuration.draft` holders. *Recommend: as written.*
- **SP-22. Record corrections and lowering a classification are never covered by the switch.** *Recommend: as written.*
- **SP-23. Packs refuse to load into an organisation whose switch is on.** A live organisation changes through people.
  The one exception: the development fill, on a database where `demoIsLoaded` holds, may turn the switch off itself,
  audited as a SYSTEM actor with the founder's 2026-10-23 instruction as the reason; it refuses on any other database. ADR
  0043 D3 names it as the only exception. *Ruled (product owner, 2026-10-23): with this exception.*
  *Recommend: as written.*

## 9. Risks and dependencies

- **Security triggers change (4.1).** A mistake there weakens a Must control. Mitigations:
  - a security review (4.8) before rollout;
  - a db test for each refusal;
  - the `ConfigurationChange` guards are left untouched on purpose.
- **Transcription errors in the RSAJ pack** carry legal weight. Mitigations:
  - every entry cites its clause;
  - the DAL and the evaluation models load only as drafts;
  - the figures are checked against the fixture;
  - the product owner signs off before the first load.
- **Writes to `perolehan` may be blocked** by the auto-mode classifier, as on 2026-10-23. The founder may need to run the
  four commands in 4.8 himself.
- **The four deployment environment values** must be set for the register to open. A pack cannot set them.
- **A concurrent builder** is in `src/app/projects/**` and `src/lib/inbox/**`. 6.6 is gated on it, and 6.5 does not touch
  `src/lib/inbox`. The 5.1 `ProvenanceBadge` change reaches project screens without editing their files.
- **The text-snapshot and comparator lists** move a lot. Only the serial steps (5.9 and 6.8) edit the comparator scripts
  and the baseline.
- **Dependencies on later steps:**
  - step 7 builds email (checklist 13; "Not emailed" goes for good; notification starter rules);
  - step 7 builds Reports (sidebar item; budget ledger move) and global search and paging (the views and search still
    filter one page, as batch C noted);
  - step 8, Wave V: design note 0004 planned "ADR 0040, online award return", but **0040 is taken** by the language layer
    and this plan takes 0043. Wave V's ADR must take the next free number (0044 or later).
