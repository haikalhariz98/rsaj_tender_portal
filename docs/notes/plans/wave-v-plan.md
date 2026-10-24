# Wave V plan: online award return and supply invoices

- **Date:** 2026-10-24.
- **Author:** solution architect.
- **Decision record:** ADR 0045 (`docs/notes/architecture/0045-online-award-return-and-supply-invoices.md`).
- **Scope, as the founder set it (2026-10-24):** "then wave V", after global search and export. The brief for the wave has
  two parts:
  - **V-1.** The contractor accepts the PO or indent online in the portal, in place of the paper acceptance page, with the
    finance system's number shown. It can raise a query. RSAJ sees both on the project.
  - **V-3.** A supply contractor uploads a Delivery Order and an invoice against the contract and tracks it. RSAJ verifies and
    records. Payment stays with finance. Works and services keep certified claims.
- **V-2 is already covered** by waves 3b and 3c, both committed (AC-32). Only its log line is owed (§8).
- **The gate.** Design note 0004 AC-35 and AC-48 held wave V until Part 2 was through. Two things release it (WV-1):
  - PW-1 (2026-10-22) replaced Part 2's AC-7 gate, and the Project workspace is built (ADR 0042);
  - the founder said "then wave V" on 2026-10-24.
- **How the brief is read.** It is read against AC-31, which is binding. "Accept online" is an **online return**:
  - the signing-authority account, after entering its password again, uploads the wet-signed scans and types the page's fields;
  - an officer verifies them, and only then is the award accepted (FR-AWD-003, FR-AWD-008, spec line 4654);
  - the contractor accepts the Letter of Acceptance or the indent, not the finance system's PO;
  - there is no decline and no accept-with-changes (FR-CON-004).
- **Standing rules:**
  - Desktop only. English only. Minimal words, with explanations in `RuleInfo` popovers. Dropdowns wherever the values are known.
  - No customer value in product code. No email (ADR 0044). No approve-by-email.
  - One schema step in flight at most. This wave has **one**, V1.
  - **One builder at a time** (founder, 2026-10-24), with at most one light read-only agent beside it. §3 lists which steps
    could pair if that rule is lifted. Until it is, run them serially in the order given.
  - **Every screen step ends with:**
    - `npm run typecheck`, `npm run lint` and `npm test`;
    - `npm run test:db` for the store steps;
    - a `scripts/text-snapshot.mjs` before and after, diffed;
    - a sibling-screen check (AGENTS.md).
  - **Files other builders hold right now** (uncommitted in the tree): `src/app/projects/page.tsx`, `src/app/projects/rows.ts`,
    `src/lib/award/repo.ts`, `src/lib/contract/case-load.ts`, `src/lib/search/fields.ts`, `src/app/suppliers/**` and
    `src/app/committees/**`.
    - No step here edits `src/app/projects/page.tsx`, `rows.ts`, `search/fields.ts`, `suppliers/**` or `committees/**`.
    - V2 edits `src/lib/award/repo.ts`, and V5 may edit `case-load.ts`. Each starts only after `git status` shows that path clean.

## 1. What exists

- **The award return.**
  - An officer types it from paper (`recordReturn`, `src/app/awards/actions.ts:940`).
  - The pure rules are in `src/lib/award/stage-two.ts`: `RETURN_SCANS`, `acceptancePageFaults`, `countedReturnComplete` and
    `instrumentReturned`.
  - Acceptance is decided in one place, `acceptOnCompleteReturn` (`src/lib/award/return-acceptance.ts`). It moves the award from
    ISSUED to ACCEPTED as soon as the record and its live scans are complete.
  - The scans are award attachments under `SIGNED_LETTER`, `DECLARATION`, `AUTHORISATION` and `ACCEPTANCE_PAGE`, one live
    attachment each (`HOLDS_ONE_DOCUMENT`).
- **The commitment number.**
  - `Award.erpCommitmentNo` and `erpCommitmentKind` are typed by an officer (`recordCommitment`), behind `CommitmentGateway` and
    `manualCommitment` (`src/lib/integration/award-commitment.ts`).
  - The staff overview panel shows it (`src/app/projects/[id]/award/overview-panel.tsx:92`). The portal does not.
- **The portal.**
  - It lists a contract from ISSUED (`STANDING_AWARD`, `src/lib/portal/projects/visibility.ts`). Everything is keyed by
    `contractId`.
  - The password step-up is `confirmSupplierPassword` (`src/app/supplier/projects/documents/version/route.ts`), and who may sign
    is decided by `contractorSigningFaultOf` (`src/lib/portal/projects/signing-store.ts`).
  - Uploads are staged first, outside any lock, and pinned by the act (`src/lib/project-docs/portal-upload.ts`, ADR 0042 D8).
  - The rolling window bound is in `src/lib/project-docs/bounds.ts`.
- **The Project workspace** (ADR 0042) opens only from EXECUTED (`PROJECT_WORKSPACE` in `src/lib/contract/act-status.ts:116`).
  - Its class must not be SULIT (`src/lib/documents/project-class.ts`).
  - Its kinds are `ContractorSubmissionKind`, listed in `SUBMISSION_KINDS` (`src/lib/portal/projects/types.ts:14`).
  - Exhaustive maps of the kinds are in `src/lib/portal/projects/labels.ts`, `src/lib/portal/projects/submission.ts` and
    `src/lib/project-docs/taken-up.ts`.
- **Certificate payments.** `FinancePayment` holds one row per certificate (`certificateId` required and unique). It is written
  by `recordFinancePayment` (`src/lib/payment/finance-write.ts`) with the act slot `FinancePayment.person`.
- **Contract types.**
  - `ContractType.interimPaymentRule` is free text, with one row `provenance` (BD-613-128).
  - A contract reaches its type through `award.exercise.contractTypeCode`.
  - The editor is `src/app/configuration/reference-data/{core.ts,editors.tsx}`.
  - The RSAJ pack loads Work, Service, Supply and Consultancy (`prisma/rsaj/starter-pack/purchasing.ts:40`).
- **SULIT reads of files.** A SULIT document with no attachment has no subject. It is withheld from everyone but its uploader
  (`src/lib/documents/entitlement.ts:174`). That is why the online return's files need an owner (ADR 0045 D1).
- **Notices.**
  - `StaffNotice` kinds are a closed list (`src/lib/inbox/kinds.ts`) with a database CHECK.
  - Recipients come from `NotificationRule`, as in `loadClockPlan` (`src/lib/award/clock-notices.ts:16`).
  - The rule list is `NOTIFICATION_EVENTS`.

## 2. Contracts (frozen in V1, before anything uses them)

### 2.1 Schema (V1, one step, two migration files)

```prisma
enum PaymentRoute { CERTIFIED_CLAIM DELIVERY_ORDER_INVOICE }
// ContractorSubmissionKind gains SUPPLY_CLAIM. AttachmentPurpose gains DELIVERY_ORDER and SUPPLY_INVOICE.

model ContractType {          // + one column; no provenance of its own (BD-613-128)
  paymentRoute PaymentRoute?  // typed twin of interimPaymentRule. Null: not set.
}

model DocumentStorePolicy {   // + one column
  awardReturnClassId String?  // ADR 0045 D1: must be a SULIT class. Null: online return refused, naming the setting.
  awardReturnClass   DocumentClass? @relation("AwardReturnClass", fields: [awardReturnClassId], references: [id], onDelete: Restrict)
}

model AwardOnlineReturn {     // insert-only; the decision columns set once (trigger); one undecided row per award (partial unique)
  id                           String   @id @default(cuid())
  organisationId               String
  awardId                      String
  submittedBySupplierAccountId String
  submittedAt                  DateTime // server, to the second
  submittedOn                  DateTime // the organisation's day from the same moment: the received day of every item (WV-3)
  stepUpAt                     DateTime
  // WORK_INDENT only (empty and null for a Letter of Acceptance); CHECK: all set together, or none
  signatoryName String  @default("")
  icNumber      String  @default("")   // SULIT, as AwardReturn.icNumber
  occupation    String  @default("")
  address       String  @default("")
  capacity      String  @default("")
  witnessName   String  @default("")
  contractorSigned Boolean?            // true when lodged; CHECK true or null
  stampAffixed     Boolean?
  witnessSigned    Boolean?
  verifiedByPersonId String?
  verifiedAt         DateTime?
  refusedByPersonId  String?
  refusedAt          DateTime?
  refusedReason      String   @default("")
  // CHECK: not both verified and refused; refused needs a reason
  files DocumentAttachment[]           // the new owner, purposes = RETURN_SCANS of the award's instrument
  @@index([awardId])
}

model AwardQuery {            // insert-only; answer columns set once (trigger)
  id                        String   @id @default(cuid())
  organisationId            String
  awardId                   String
  body                      String   @db.Text   // 1..2000
  askedBySupplierAccountId  String
  askedAt                   DateTime
  answer                    String   @default("") @db.Text
  answeredByPersonId        String?
  answeredAt                DateTime?
  @@index([awardId, askedAt])
}

model SupplyInvoicePayment {  // write-once (trigger); never updated or deleted
  id               String   @id @default(cuid())
  organisationId   String
  contractId       String
  documentId       String   @unique  // the SUPPLY_CLAIM ProjectDocument
  versionId        String            // its verified (TAKEN_UP) version
  paidOn           DateTime
  batchNo          String
  amount           Decimal  @db.Decimal(18, 2)  // > 0, CHECK
  personId         String            // act slot SupplyInvoicePayment.person
  note             String   @default("")
  recordedAt       DateTime
  @@index([contractId])
}

model DocumentAttachment {    // + one owner
  awardOnlineReturnId String?
  awardOnlineReturn   AwardOnlineReturn? @relation(fields: [awardOnlineReturnId], references: [id], onDelete: Restrict)
  @@index([awardOnlineReturnId])
}
```

- **Migration A** (enum values only: `ALTER TYPE … ADD VALUE` cannot be used in the transaction that adds it):
  - `SUPPLY_CLAIM`;
  - `DELIVERY_ORDER`;
  - `SUPPLY_INVOICE`;
  - `PaymentRoute`.
- **Migration B** (everything else):
  - the tables, columns, indexes and triggers;
  - the one-owner CHECK and the purpose CHECK **replaced whole**:
    - `awardOnlineReturnId` takes only the four return purposes;
    - `projectDocumentVersionId` takes `PROJECT_DOCUMENT_FILE`, `DELIVERY_ORDER` and `SUPPLY_INVOICE`;
  - `ContractorSubmission.kind <> 'SUPPLY_CLAIM'`;
  - the `StaffNotice.kind` CHECK widened by `AWARD_RETURN_LODGED` and `AWARD_QUERY_RAISED`;
  - the ADR 0042 decision trigger left as it is: it keys on `kind IS NULL`, so SUPPLY_CLAIM takes TAKEN_UP and RETURNED.
    **Check this; do not assume it.**

### 2.2 Pure rules (V2 and V6)

```ts
// src/lib/award/online-return.ts (pure)
export type OnlineReturnState = "NONE" | "WAITING" | "VERIFIED" | "REFUSED";
export interface OnlineReturnPage {            // WORK_INDENT only
  signatoryName: string; icNumber: string; occupation: string; address: string; capacity: string; witnessName: string;
  contractorSigned: boolean; stampAffixed: boolean; witnessSigned: boolean;   // each must be true to lodge
}
export interface OnlineReturnFacts {
  awardStatus: string; instrument: InstrumentKind; today: Day | null;
  paperStarted: boolean;        // any AwardReturn received day or acceptance field recorded, or any live return scan on the award
  waiting: boolean;             // an undecided AwardOnlineReturn exists
  classSet: boolean;            // DocumentStorePolicy.awardReturnClassId set and SULIT
  signingFault: string | null;  // contractorSigningFaultOf
}
export type OnlineReturnFault =
  | "NOT_ISSUED" | "ALREADY_WAITING" | "PAPER_STARTED" | "CLASS_NOT_SET" | "NO_ZONE" | "NOT_SIGNING_AUTHORITY"
  | "SCAN_MISSING" | "SCAN_NOT_TAKEN"            // a scan for each RETURN_SCANS[instrument]; no other
  | "PAGE_NOT_TAKEN"                             // page fields posted for a Letter of Acceptance
  | AcceptanceFault;                             // reused from stage-two.ts for the indent's page (RECEIVED_ON excluded: the day is the server's)
export function lodgeFaults(f: OnlineReturnFacts, i: { scans: readonly ReturnScan[]; page: OnlineReturnPage | null }): Finding[];
export function verifyFaults(f: { awardStatus: string; state: OnlineReturnState }): Finding[];   // ISSUED and WAITING only
export function refuseFaults(f: { awardStatus: string; state: OnlineReturnState; reason: string }): Finding[];
/// The AwardReturn fields a verified row writes: every item's received day is `submittedOn`; whereHeld "Lodged online".
export function returnRecordFromOnline(instrument: InstrumentKind, row: OnlineReturnRow): ReturnRecord;
export function onlineReturnState(rows: readonly { verifiedAt: Date | null; refusedAt: Date | null }[]): OnlineReturnState; // latest row decides
export type QueryFault = "NOT_ISSUED" | "BODY_REQUIRED" | "BODY_TOO_LONG" | "ALREADY_ANSWERED" | "ANSWER_REQUIRED" | "ANSWER_TOO_LONG";
export const QUERY_MAX = 2000;
```

```ts
// src/lib/documents/award-return-class.ts (pure) — as project-class.ts, inverted
export function awardReturnClassFault(chosen: { classification: SecurityClass | null } | null): string | null; // must be SULIT
export function eligibleAwardReturnClasses<C extends { classification: SecurityClass | null }>(classes: readonly C[]): C[];
// src/lib/documents/staged-for.ts
export const STAGED_FOR_AWARD_RETURN = "award-return";
```

```ts
// src/lib/project-docs/kinds-offered.ts (pure)
export type PaymentRoute = "CERTIFIED_CLAIM" | "DELIVERY_ORDER_INVOICE";       // mirrors the enum; types-schema test holds them equal
export function kindsOffered(route: PaymentRoute | null): DocKind[];
//   DELIVERY_ORDER_INVOICE → every kind but INTERIM_CLAIM and MATERIALS_ON_SITE, plus SUPPLY_CLAIM
//   CERTIFIED_CLAIM or null → today's six
export const SUPPLY_FILE_PURPOSES = ["DELIVERY_ORDER", "SUPPLY_INVOICE"] as const;
export type SupplyFilePurpose = (typeof SUPPLY_FILE_PURPOSES)[number];
/// SUPPLY_CLAIM: at least one file of each; PROJECT_DOCUMENT_FILE refused. Any other kind or none: only PROJECT_DOCUMENT_FILE.
export function versionFileFaults(kind: DocKind | null, purposes: readonly string[]): Finding[];
```

```ts
// src/lib/payment/supply.ts (pure)
export function supplyPaymentFaults(i: {
  verifiedOn: Day | null; already: boolean; batchNo: string; paidOn: Day; today: Day; amount: Sen | null;
}): Finding[];   // NOT_VERIFIED, PAYMENT_ALREADY_RECORDED, BATCH_REQUIRED, FUTURE_DATE, PAID_BEFORE_VERIFIED, AMOUNT_REQUIRED, AMOUNT_NOT_POSITIVE
export type SupplyClaimState = "WITH_ORGANISATION" | "RETURNED" | "VERIFIED" | "PAID";
export function supplyClaimState(reading: DocumentReading, paid: boolean): SupplyClaimState;
```

### 2.3 Portal routes (V3 and V7)

Every route is guarded in the portal's order, before the body is read: the public copy, the Origin guard, a bounded body, the
signed form token, then who is signed in (`supplierPost`). The supplier always comes from the session. A contract that is not
the session's supplier's gets the same 404 for every cause.

| Route | Body | Answer |
| --- | --- | --- |
| `POST /supplier/projects/award-return/upload` | multipart: `contractId`, `scan` (one of the instrument's `RETURN_SCANS`), `file` | 201 `{ok, versionId, name, bytes}`; 404, 413, 415, 422 (with the words), 429 (window) |
| `POST /supplier/projects/award-return/submit` | JSON: `contractId`, `files: {[scan]: versionId}`, `page?: OnlineReturnPage`, `password` | 201 `{ok, onlineReturnId}`; 400 field errors; 403 password or signing refused; 404; 409 changed; 422 |
| `POST /supplier/projects/award-query` | JSON: `contractId`, `body` | 201 `{ok, queryId}`; 400; 404; 422 not issued |
| `POST /supplier/projects/documents/create` and `/version` (changed in V7) | as today, plus optional `files: {versionId, purpose: SupplyFilePurpose}[]`, taken only with kind `SUPPLY_CLAIM`. `versionIds` and `files` are exclusive (400 for both). | as today |

### 2.4 Staff server actions (V5 and V8)

These go in the existing award actions file, `src/app/awards/actions.ts`:
- **`verifyOnlineReturn`** (`id`), with the act slot `AwardOnlineReturn.verifiedBy`. The same person is written to
  `AwardReturn.receivedByPersonId`, and the act-wiring scan covers both columns.
- **`refuseOnlineReturn`** (`id`, `reason`), with the act slot `AwardOnlineReturn.refusedBy`.
- **`answerAwardQuery`** (`id`, `answer`), with the act slot `AwardQuery.answeredBy`.

This one goes in `src/app/projects/[id]/payment-actions.ts`:
- **`recordSupplyPayment`** (`documentId`, `paidOn`, `batchNo`, `amount`, `note`), with the act slot
  `SupplyInvoicePayment.person`.

Each is guarded by `staffForAct("TRANSACTION")`.

## 3. Build order

The founder's rule is one builder at a time, so the default is serial, in this order: V1, V2, V3, V4, V5, V6, V7, V8, V9, V10.
If two builders are allowed again, these pairs share no file:

| Wave | Builder A (heavy) | Builder B (medium) | Schema |
| --- | --- | --- | --- |
| V-a | V1 Schema and migrations (data-modeler) | (none: everything waits on the client) | **yes** |
| V-b | V2 Online return and queries, lib (domain-engineer) | (none: V3 to V5 call it) | no |
| V-c | V6 Supply claims, lib (domain-engineer) | V3 Portal routes for the return and queries (api-engineer) | no |
| V-d | V5 Staff screens for the return and queries (frontend-engineer) | V4 Portal screens for the return and queries (frontend-engineer) | no |
| V-e | V8 Staff screens for supply invoices (frontend-engineer) | V7 Portal routes and screens for supply invoices (api-engineer, frontend-engineer) | no |
| V-f | V9 Pack values and demo data (domain-engineer, light) | (none) | no |
| V-g | V10 End-to-end check, reviews, fix round, records (test-engineer, security-auditor, code-reviewer, docs-writer) | (none) | no |

V-d and V-e pair two medium steps, which is lighter than heavy plus medium. V6 may also pair with V4 or V5 instead of V3: none of
the three shares a file with it.

## 4. Steps

### V1. Schema and migrations

- **Agent:** data-modeler. Serial. **Migration: yes** (two files, §2.1).
- **Files:**
  - `prisma/schema.prisma`;
  - `prisma/migrations/2026112900000{0,1}_wave_v_{enums,tables}/migration.sql`;
  - `src/lib/inbox/kinds.ts`, with the two kinds, their labels and the header comment's migration list;
  - `src/lib/notifications/events.ts` (`NOTIFICATION_EVENTS`): `award.return.lodged` and
    `award.query.raised`;
  - `src/lib/documents/types.ts` and `src/lib/documents/owners.ts`: the new owner kind `awardOnlineReturn` with its purposes,
    and the two new purposes with their owner;
  - `src/lib/documents/labels.ts`, with purpose labels "Delivery order" and "Invoice";
  - `src/lib/portal/projects/types.ts` (`SUBMISSION_KINDS` + `SUPPLY_CLAIM`), and the three exhaustive maps that then fail to
    compile (`portal/projects/labels.ts`, `portal/projects/submission.ts`, `project-docs/taken-up.ts`). Each gets a
    `SUPPLY_CLAIM` entry; `takenUpWhere` points to `{stage: "project", tab: "payments", section: "supply"}`.
- **Tests:**
  - a migration db test (`src/lib/award/online-return-schema.db.test.ts`):
    - the insert-only and set-once triggers on `AwardOnlineReturn`, `AwardQuery` and `SupplyInvoicePayment` refuse an update of
      any other column and a second decision;
    - the partial unique index refuses a second undecided return;
    - the attachment CHECKs accept each owner with its own purposes, and refuse `DELIVERY_ORDER` on an award and
      `SIGNED_LETTER` on a project version;
    - `ContractorSubmission` refuses `SUPPLY_CLAIM`;
    - a `StaffNotice` of each new kind inserts;
  - the existing one-owner migration test (it lists every owner) gains the new owner;
  - `kinds.ts`'s source test (kinds equal the CHECK) passes;
  - the existing `types-schema.test.ts` mirrors pass, and `PaymentRoute` is added to them.
- **Done when:**
  - `npm run db:migrate` applies both files on a scratch database;
  - `npx prisma generate`, typecheck and every test above pass;
  - no existing migration test is weakened.

### V2. Online return and queries: the lib

- **Agent:** domain-engineer. Serial.
- **Starts after:** `src/lib/award/repo.ts` is committed by its current builder.
- **Migration:** no.
- **Files:**
  - **new:**
    - `src/lib/award/online-return.ts` (pure, §2.2);
    - `src/lib/award/return-store.ts`: the `recordReturn` core moved out of the action, so the paper and online paths share it.
      It covers the SULIT write refusal, the not-before-issue and not-after-today checks, the update, the audit pair and the
      call to `acceptOnCompleteReturn`;
    - `src/lib/award/online-return-store.ts`: `lodgeOnlineReturn`, `verifyOnlineReturn`, `refuseOnlineReturn`, `askAwardQuery`
      and `answerAwardQuery`, each under the award's lock (the contract, then the award, in the canonical order of
      `inHeldContract` for the supplier acts);
    - `src/lib/award/return-upload.ts`: `preflightReturnUpload` and `storeReturnFile`, mirroring `portal-upload.ts`:
      - the contract held;
      - the award ISSUED with no waiting return;
      - the signing authority;
      - the class set and SULIT;
      - the media types and size;
      - the window, reusing `bounds.ts`'s constants and counting every store version the account staged.
    - `src/lib/documents/award-return-class.ts`.
  - **changed:**
    - `src/lib/documents/staged-for.ts` (`STAGED_FOR_AWARD_RETURN`);
    - `src/lib/documents/owner-scope.ts` and `owner-facts.ts` (the new owner's SULIT scope is the award's exercise; it is frozen
      once decided);
    - `src/lib/documents/service.ts` (`loadStorePolicy` returns `awardReturnClassId`);
    - `src/lib/award/repo.ts` (`LoadedAward` includes the latest online return with its attachments, and the queries);
    - `src/app/awards/actions.ts`:
      - `recordReturn` calls `return-store.ts`;
      - it refuses while an online return waits (WV-4);
      - the staff attach of a return purpose is refused while one waits, through the award's owner facts, not in the action;
    - `src/lib/auth/act-slots.ts`, with the three slots in §2.4;
    - `src/lib/inbox/notices.ts`, with the drafts for the two kinds;
    - `src/lib/award/clock-notices.ts`: `loadClockPlan`'s recipient lookup is generalised to take an event key, and the clock
      callers keep their behaviour.
- **What the acts do:**
  - **`lodgeOnlineReturn`.** It is given a supplier actor and `stepUpAt`. It:
    1. runs `lodgeFaults` on the locked rows;
    2. inserts the row with `submittedAt` and `submittedOn` from one server moment;
    3. pins each staged version to the row as an attachment. It refuses a version that was not staged with
       `STAGED_FOR_AWARD_RETURN`, was staged by another account, is already attached or is not in the class;
    4. writes the audit rows. The IC number is shown masked in the audit snapshot (`mask.ts`);
    5. writes the notices to the recipients of `award.return.lodged`.
  - **`verifyOnlineReturn`.** It:
    1. runs `verifyFaults`;
    2. builds the `AwardReturn` fields with `returnRecordFromOnline`;
    3. runs the `return-store.ts` core with the verifying person as `receivedBy`;
    4. attaches each of the row's versions to the award under its purpose, through the same attach rules as
       `attachDocument`'s core;
    5. sets the row verified;
    6. calls `acceptOnCompleteReturn`.

    Any refusal writes nothing.
  - **`refuseOnlineReturn`** sets the refusal and its reason. Nothing is attached to the award.
  - **`askAwardQuery`** (ISSUED only) and **`answerAwardQuery`** (an answer, once). A query writes no clock field (AC-31).
- **Tests:**
  - `online-return.test.ts`:
    - every `lodgeFaults` code;
    - the indent page faults are reused, with RECEIVED_ON excluded;
    - a Letter of Acceptance with page fields gives PAGE_NOT_TAKEN;
    - `returnRecordFromOnline` sets every day to `submittedOn`;
    - `onlineReturnState`'s latest row decides.
  - `award-return-class.test.ts`: not ours, unclassified, INTERNAL and PUBLIC are refused; SULIT is accepted.
  - `online-return.db.test.ts` (`test:db`):
    - lodging leaves the award ISSUED, and `instrumentReturned` is false;
    - verifying moves it to ACCEPTED, with the scan snapshot holding the pins and the received days equal to the lodged day
      when verification is two days later;
    - refusing leaves it ISSUED, with no award attachment;
    - a second lodge while one waits is refused;
    - a lodge after a paper item is recorded is refused, and so is `recordReturn` while a return waits;
    - another supplier's account gets 404;
    - a query moves neither `indentReceivedOn` nor any award date;
    - an officer without SULIT read on the exercise is refused verification, and the read is logged;
    - the staged file of another account is refused;
    - both notice kinds reach the rule's office holders, and with no rule nobody is told.
  - The existing return tests (`return-scans.test.ts`, `stage-two.test.ts`, `register.db.test.ts`) pass unchanged.
  - The act-wiring scan passes, extended for the three slots.
- **Done when:** every test above passes, and `recordReturn`'s observable behaviour on the paper path is unchanged.

### V3. Portal routes for the return and queries

- **Agent:** api-engineer.
- **Migration:** no.
- **Files:**
  - **new:**
    - `src/app/supplier/projects/award-return/upload/route.ts`;
    - `src/app/supplier/projects/award-return/submit/route.ts`;
    - `src/app/supplier/projects/award-query/route.ts`;
    - `src/lib/award/online-return-api.ts`: the body parsers, with an unknown field refused 400, as `portal-api.ts` does;
    - `src/app/supplier/projects/award-return/handlers.test.ts`.
- **Work:**
  - The routes follow §2.3.
  - The submit route asks the password only after the body parses and after a read-only check that the contract is the
    supplier's and the account may sign, as `versionSigns` does. So nobody spends a lockout count for nothing.
  - Upload never holds a contract lock.
- **Tests (handlers):**
  - the guard order (Origin, size, token, session);
  - 404 alike for an unknown contract, another organisation's and another contractor's;
  - a wrong password is 403, counts towards the lockout and writes nothing;
  - an account without signing authority is 403 before the password is asked;
  - a `scan` not in the instrument's list is 400;
  - a posted `page` on a Letter of Acceptance is 400;
  - a query of 2,001 characters is 400.
- **Done when:** the handler tests pass, and `npm run test:db` passes for the V2 store through the routes.

### V4. Portal screens for the return and queries

- **Agent:** frontend-engineer.
- **Migration:** no.
- **Files:**
  - **new:** `src/app/supplier/projects/[id]/award-return-card.tsx` and `src/app/supplier/projects/[id]/award-return-drawer.tsx`;
  - **changed:**
    - `src/app/supplier/projects/[id]/panels.tsx` (OverviewPanel);
    - `src/lib/portal/projects/workspace-store.ts`. `OverviewView.facts` gains
      `commitment: {kind: "INDENT" | "PURCHASE_ORDER", number: string} | null`, and the view gains
      `award: {instrument, state: OnlineReturnState, issuedOn, validUntil: string | null, refusedReason, mayLodge: string | null, queries: {...}[]}`;
    - `src/app/supplier/projects/[id]/waiting-for-you.tsx`;
    - `src/app/supplier/projects/page.tsx`, with a "To accept" chip on an ISSUED award.
- **Screen (minimal words):**
  - **Overview, while the award is ISSUED.** One card, "Accept the award".
    - **Facts:** the instrument, the day it was issued, the indent number or "Purchase order {no}" when recorded (WV-14 words),
      and "Valid until {day}" for an indent with validity set.
    - **One primary button, "Accept".** If the account may not sign, the button is not drawn. A `RuleInfo` popover says only
      someone who may sign for the company can accept, and that the office sets who.
    - **The drawer:**
      - one file picker per scan, each uploading to the staging route on choice;
      - for an indent:
        - Signatory, read-only: the signed-in contact's name;
        - Capacity, prefilled from the contact's designation;
        - IC number;
        - Occupation;
        - Address, prefilled from the supplier's registered address;
        - Witness name;
        - three required ticks: "Signed", "Witnessed", "Company stamp";
      - Password;
      - the button "Accept and send".

      A `RuleInfo` popover holds: "Your signed scans are the record. Changes go through a variation, not here."
    - **The state line:**
      - waiting: "Sent {day} · Being checked";
      - refused: a warn `Callout`, "Returned: {reason}", and "Send again";
      - verified: "Accepted {day}", and the card shows its facts only.
  - **Questions.** `MoreActions` holds "Ask a question". Under the card, a list of questions with their answers, or "Waiting for
    an answer".
  - **The portal home's "Waiting for you"** lists "Accept {contract number}" while there is nothing waiting and nothing verified.
- **Tests:**
  - `award-return-screen.test.ts` (server markup): the state lines; no Accept button without signing authority; no Purchase
    order line when it is not recorded; the IC number never rendered after lodging;
  - `workspace-store` unit cases for `commitment` and `award`.
- **Done when:**
  - the tests pass;
  - the text-snapshot diff of `/supplier/projects/[id]` shows only the new card's text;
  - the card matches the portal's Documents and Payments cards (sibling check).

### V5. Staff screens for the return and queries; the return class

- **Agent:** frontend-engineer.
- **Starts after:** `src/lib/contract/case-load.ts` is committed by its current builder, if this step needs to touch it.
- **Migration:** no.
- **Files:**
  - **new:**
    - `src/app/projects/[id]/award/online-return-card.tsx`;
    - `src/app/projects/[id]/award/queries-card.tsx`;
  - **changed:**
    - `src/app/projects/[id]/award/return-panel.tsx` and `award-view.tsx`;
    - `src/app/awards/actions.ts` (the three server actions, §2.4) and `src/app/awards/editors.tsx` (the Verify confirm, the
      Refuse drawer with its reason, the Answer drawer);
    - `src/lib/contract/primary-action.ts`: "Verify the return" while one waits, on the Award stage;
    - `src/app/configuration/documents/{core.ts,editors.tsx,page.tsx}`: "Class for returned award documents", a dropdown of
      `eligibleAwardReturnClasses`, saved on the two-person path beside the project class;
    - `src/lib/setup/checklist.ts` and `checklist-repo.ts`: one set item, "Class for returned award documents", under
      contracts and payments.
- **Screen:**
  - **The Return panel**, while a return waits or was refused, shows the card "Sent online". It holds:
    - who sent it and when;
    - for an indent, the page fields, with the IC number through the SULIT read: masked, and logged when shown;
    - the files, with download links;
    - the state.

    Verify is the header's one primary action. Refuse sits in `MoreActions`.
  - **The Questions card** on the Award stage lists each question with an "Answer" row action, and shows nothing when there are
    none.
  - **The inbox** shows the two notice kinds. Their links open the Award stage's Return tab.
- **Tests:**
  - `primary-action.test.ts`: the new case;
  - a server-markup test of the card: the IC is masked without SULIT read; there is no Verify for a refused or verified row;
  - the configuration core: a non-SULIT class is refused with `awardReturnClassFault`'s words;
  - `checklist.test.ts`: the new item.
- **Done when:**
  - the tests pass;
  - the text-snapshot diff of a pre-issue case, an issued case with a waiting return and an accepted case drops nothing;
  - the Return panel matches the Approval and Distribution panels.

### V6. Supply claims: the lib

- **Agent:** domain-engineer.
- **Migration:** no.
- **Files:**
  - **new:**
    - `src/lib/project-docs/kinds-offered.ts`;
    - `src/lib/payment/supply.ts`;
    - `src/lib/payment/supply-write.ts` (`recordSupplyPayment`, mirroring `finance-write.ts`, under the contract's lock and the
      document's lock);
    - `src/lib/project-docs/supply-read.ts`: the supply-claim rows for staff and for the contractor, with their state, their
      payment and the amount as `Sen`. Display strings are formatted here, never in a component;
  - **changed:**
    - `src/lib/project-docs/store.ts`:
      - `createDocument` and `addVersion` refuse a kind not in `kindsOffered(route)`;
      - the act pins each file with its posted purpose, and runs `versionFileFaults`;
    - `src/lib/project-docs/portal-api.ts`, with the optional `files` and the "exclusive with `versionIds`" rule;
    - `src/lib/project-docs/labels.ts`: "Delivery order and invoice"; TAKEN_UP reads "Verified" on SUPPLY_CLAIM; the title label
      "Invoice number" on that kind;
    - `src/lib/project-docs/contractor-view.ts`: payment shown;
    - `src/lib/method/{types,labels,fixture}.ts` and `src/app/configuration/reference-data/core.ts`: `paymentRoute` read and
      saved, with no tag of its own (BD-613-128);
    - `src/lib/auth/act-slots.ts` (`SupplyInvoicePayment.person`).
- **The route** is read once per act from the contract's type. No contract type, or a type with the route unset, offers today's
  six.
- **Tests:**
  - `kinds-offered.test.ts`: the three routes;
  - `versionFileFaults` cases: a missing invoice, a missing delivery order, `PROJECT_DOCUMENT_FILE` on a supply claim,
    `DELIVERY_ORDER` on a drawing;
  - `supply.test.ts`: every fault, and a paid day equal to the verified day is accepted;
  - `supply.db.test.ts` (`test:db`):
    - on a Delivery Order route contract, the contractor creates a supply claim, an officer returns it, a new version is sent,
      it is verified, and payment is recorded;
    - a second payment is refused;
    - payment before verification is refused;
    - on a certified-claim contract a supply claim is refused, and so is an interim claim on a Delivery Order contract;
    - a route change leaves an existing claim readable and payable;
  - the existing project-docs suites pass, and the `kinds.db.test.ts` decision-trigger cases gain SUPPLY_CLAIM.
- **Done when:** every test above passes, and nothing in `FinancePayment` or its tests changed.

### V7. Portal routes and screens for supply invoices

- **Agent:** api-engineer (the routes), then frontend-engineer (the screens). Done as one step.
- **Migration:** no.
- **Files:**
  - `src/app/supplier/projects/documents/{create,version}/route.ts`: pass `files`. The parse is V6's;
  - `src/app/supplier/projects/[id]/document-drawers.tsx` and `document-form.ts`. For SUPPLY_CLAIM the drawer shows two file
    pickers ("Delivery order", "Invoice") and the title label "Invoice number". The kind list comes from `kindsOffered`;
  - `src/app/supplier/projects/[id]/panels.tsx` (PaymentsPanel). On a Delivery Order route contract the card "Invoices" comes
    first. Each row shows:
    - the invoice number;
    - the day sent;
    - a status chip: "With {organisation}", "Returned", "Verified", or "Paid {amount} on {day}, batch {no}".

    One button, "Send delivery order and invoice", opens the drawer with the kind set;
  - `src/lib/portal/projects/workspace-store.ts` (`paymentsTab` reads `supply-read.ts`);
  - `src/app/supplier/projects/documents/handlers.test.ts`.
- **Tests:**
  - handlers: `files` with any kind but SUPPLY_CLAIM is 422; `files` and `versionIds` together are 400;
  - a server-markup test of the Invoices card's four states;
  - no Invoices card on a certified-claim contract.
- **Done when:**
  - the tests pass;
  - the portal Payments and Documents snapshot diffs drop nothing;
  - the Invoices card matches the Payment certificates card.

### V8. Staff screens for supply invoices; the contract-type field

- **Agent:** frontend-engineer.
- **Migration:** no.
- **Files:**
  - `src/app/projects/[id]/payment-panels.tsx`: a headed section, "Supply invoices", on a Delivery Order route contract. It is
    an in-card `DataList` with the columns:
    - Invoice number, linking to the document page;
    - Sent;
    - Status;
    - Paid.

    `StatusCounts` above it reads "To verify n" and "To record payment n", with zeros hidden. The row action is "Record
    payment";
  - `src/app/projects/[id]/payment-editors.tsx`: the Record payment drawer, with:
    - Paid on (a date);
    - Batch number;
    - Amount (the shared money input);
    - Note;
    - the act slot's person field, as the certificate payment drawer has it;
  - `src/app/projects/[id]/payment-actions.ts` (`recordSupplyPayment`);
  - `src/app/configuration/reference-data/editors.tsx`: "How it is paid", a dropdown of "Certified claim", "Delivery order and
    invoice" and "Not set". No provenance tag beside it;
  - `src/lib/setup/checklist.ts` and `checklist-repo.ts`: one set item, "How each contract type is paid". It is done when every
    active contract type has a route.
- **Tests:**
  - the payments panel markup: the section is shown only on the Delivery Order route; the counts are right; there is no Record
    payment on an unverified or paid row;
  - the editor core round-trips the route, and "Not set" saves null;
  - `checklist.test.ts`.
- **Done when:**
  - the tests pass;
  - the `/projects/[id]?stage=project&tab=payments` snapshot diff drops nothing on a works contract;
  - the section matches the Valuations section.

### V9. Pack values and demo data

- **Agent:** domain-engineer (light).
- **Migration:** no.
- **Files:**
  - `prisma/rsaj/starter-pack/purchasing.ts`:
    - `paymentRoute` CERTIFIED_CLAIM on work and service, citing §6.13.2 and SK011;
    - DELIVERY_ORDER_INVOICE on supply, citing KP004 through the spec §4.5 interim-payment row ("Local Order plus bills/invoices plus Delivery Order") and scope register row 26;
    - consultancy left unset (WV-14).

    The pack's existing never-overwrite rule applies;
  - `src/lib/starter/rsaj-pack.test.ts`;
  - `prisma/demo-my-projects.ts`, `prisma/demo-award.ts` and `prisma/demo-payment.ts`:
    - one issued indent award with a waiting online return;
    - one issued Letter of Acceptance with a query;
    - one executed supply contract with three claims (with the organisation, returned, verified and paid);
  - `prisma/dev-fill.ts`: the award return class on the demo database only, as the project class is.
- **Done when:**
  - the pack test passes and a dry run on a scratch database writes the three values;
  - the demo loads on a fresh scratch database;
  - the `perolehan` database is updated only by the audited dev-fill path (founder, 2026-10-24).

### V10. End-to-end check, reviews, fix round and records

- **Agents:** test-engineer, then security-auditor and code-reviewer, then a fix round, then docs-writer.
- **The end-to-end check** is the document's demo path:
  1. start an award from a tender;
  2. approve it;
  3. issue the letter;
  4. **the contractor accepts online** (lodge, verify);
  5. lodge the bond on the contract;
  6. sign;
  7. hold the kick-off;
  8. submit a drawing, revise it and approve it;
  9. see every notice.

  Plus the supply path: send a supply claim, return it, send again, verify it and record payment.
- **Access checks:**
  - a contractor never sees another contractor's award or contract (404);
  - staff outside the case's visibility never see the return or the queries;
  - the return files are SULIT, and each read is logged;
  - nothing in the portal renders an IC number back.
- **The security review's focus:**
  - the step-up on submit;
  - staging by another account;
  - the window bound;
  - the SULIT write on verification;
  - the attachment CHECK replacement;
  - the new owner's SULIT scope.
- **Records:**
  - design note 0004's Wave V status table;
  - ADR 0045's status, once ruled;
  - the backlog: the go-live row (WV-15) and R-5;
  - the proposed log lines in §8.
- **Done when:** both reviews have no MUST open, and the records are committed.

## 5. Requirement trace

| Requirement | Where it is met | Step |
| --- | --- | --- |
| FR-AWD-003 (M): all three documents before acceptance | The online return carries the three scans. Acceptance happens only through `acceptOnCompleteReturn` after verification. | V2, V5 |
| FR-AWD-008 (M): every acceptance-page field | The indent's typed fields reuse `acceptancePageFaults`. The signature, witness and stamp are in the scan. | V2, V4 |
| Spec line 4654: the hybrid, a wet signature as a scan | Scans required. No click-only acceptance (WV-2). | V2 |
| FR-AWD-006 (M): 14 days, IN number consumed | The received day is the day lodged (WV-3). A query pauses nothing. The number is shown, never minted. | V2, V4 |
| FR-AWD-009: commencement | Untouched. It reads the stated start. | — |
| FR-CON-004 (M): two signatures for an amendment | No accept-with-changes and no decline online. Queries only. | V2, V4 |
| Spec §7.4: the ERP owns PO and IN numbers and payment | `CommitmentGateway` is unchanged. Payment is recorded by hand behind the internal contract (D7). | V4, V6 |
| INT-04, INT-05: the commitment number | Shown in the portal when recorded (D2). | V4 |
| §6.13.2: works paid on certified valuations | No invoice route for works or services. SUPPLY_CLAIM is not offered there. | V6 |
| Scope register row 26: supply DO with invoice | The SUPPLY_CLAIM kind, with both file purposes. | V6, V7 |
| Scope register row 39 and AC-33: no AP matching, no approval | Recorded and shown only. The amount is never compared. | V6, V8 |
| FR-PAY-019, INT-07: Finance's payment, manual adapter | `SupplyInvoicePayment`, beside `FinancePayment`. | V6, V8 |
| FR-MTD-011, FR-MTD-012 and BD-613-128 | `ContractType.paymentRoute`, nullable, with no tag of its own. | V1, V6, V8 |
| NFR-SIG-002: the scan bound to the record | Online-return attachments, copied to the award on verification. The scan snapshot is kept. | V2 |
| NFR-AUD-001 and the platform rule: every state change audited | Every act writes its before and after in its transaction. Triggers make the rows append-only. | V1, V2, V6 |
| NFR-SEC: SULIT IC number and files | A SULIT class, the SULIT write on verification, logged reads, nothing echoed to the portal. | V2, V5 |
| FR-MTD-007: restricted exercises | The awardee sees its own award. Staff follow `caseVisibility`. | V2, V5 |
| AC-5, AC-6, AC-31, AC-33, AC-34 | As above. | all |
| AC-32 (V-2) | Covered by waves 3b and 3c: a log line only. | §8 |
| PW-1 and spec line 864: [NET-NEW] self-service | A go-live condition (WV-15). | V10 |

## 6. Open decisions for the product owner

Each is built to its recommendation unless ruled otherwise.

- **WV-1. The gate.**
  - *Recommend:* record that the founder's "then wave V" (2026-10-24), together with PW-1, releases AC-35 and AC-48.
  - Part 2's CPD condition becomes the go-live condition in WV-15, not a build gate.
- **WV-2. Click-only acceptance.**
  - *Recommend:* add no column now. AC-31's switch arrives with R-5, as one nullable column and one branch.
  - Until then, acceptance always needs scans.
- **WV-3. The received day.**
  - *Recommend:* the organisation's day on the server at the moment of lodging, for every item.
  - Not the verification day, so the officer's queue never costs the contractor validity days.
- **WV-4. Paper and online on one award.**
  - *Recommend:* exclusive.
    - An online return is refused once any paper item or return scan is recorded.
    - While an online return waits, paper recording and a staff attach of a return purpose are refused.
  - A waiting return is not "returned" for BD-17. Cancellation stays open until verification.
- **WV-5. The return class.**
  - *Recommend:* a new `DocumentStorePolicy.awardReturnClassId`, which must be SULIT, because the page carries the IC number.
  - The verifier already needs SULIT access for the IC write.
  - The supplier-upload class is not reused: its retention and readers are the register's.
- **WV-6. Who may lodge, and who may ask.**
  - *Recommend:* lodging takes `contractorSigningFaultOf` (the organisation's switch and the contact's mark) plus the password.
  - Any active account of the awardee may ask a question.
- **WV-7. The query lifecycle.**
  - *Recommend:* asked only while ISSUED. One answer, set once.
  - The contractor reads it in the portal. There is no supplier notice.
  - After acceptance, questions go through the Project workspace once it opens.
- **WV-8. Notice recipients.**
  - *Recommend:* the offices named by the `NotificationRule` for each event, looked up for the requesting unit. With no rule,
    no office is told.
  - The case's primary action still shows "Verify the return".
  - The packs load no rule for these events, because which office receives returns is the customer's to set. Add RSAJ question
    33 (§7).
- **WV-9. The payment route: live or pinned.**
  - *Recommend:* read live from the contract's type. It decides only which kinds are offered.
  - A change never hides or blocks claims already sent.
- **WV-10. Kinds on a supply contract.**
  - *Recommend:* on the Delivery Order route, SUPPLY_CLAIM is offered, and INTERIM_CLAIM and MATERIALS_ON_SITE are not.
  - Elsewhere, today's six.
  - Interim certificates on a supply contract are **not** blocked in this wave. Ask RSAJ whether a supply contract ever takes
    one (question 34).
- **WV-11. Telling the two files apart.**
  - *Recommend:* two new purposes, `DELIVERY_ORDER` and `SUPPLY_INVOICE`, each required on every supply-claim version.
  - *Cheaper alternative:* one purpose and "at least two files". It enforces nothing about which is which.
- **WV-12. Typed fields on the claim.**
  - *Recommend:* none. The title carries the invoice number, and the files carry the amounts (ADR 0042 D4, PW-9).
  - Verification is the existing mark, reading "Verified", by D2 authority.
- **WV-13. The payment record.**
  - *Recommend:* paid on, batch number, and **amount paid (required, Decimal)** typed from Finance's remittance, with a note.
    The contractor's Payments tab then reads "Paid RM x on d, batch b", as it does for certificates.
  - No matching, and no budget-ledger write, as with `FinancePayment`.
  - *Alternative:* no amount ("Paid on d, batch b").
- **WV-14. Pack values and words.**
  - *Recommend:* the RSAJ pack sets Work and Service to Certified claim and Supply to Delivery order and invoice, STATED with
    their sources. Consultancy stays unset (question 35).
  - The portal says "Purchase order {no}" or "Indent {no}", never "ERP" or "D365".
- **WV-15. Go-live.**
  - *Recommend:* extend PW-1. Before the online return or supply invoices are used with real contractors, the log records CPD's
    written acceptance of both as [NET-NEW] (signer, date, document version).
  - Never inferred from a setting.
- **WV-16. The originals.**
  - *Recommend:* the verified online return is the return. `whereHeld` reads "Lodged online", and an officer may note where the
    originals are kept later, through the existing correction path.
  - Whether wet originals must still be posted is RSAJ's call under R-5.

## 7. Risks

- **The attachment CHECK replacement** (V1) must list every owner and purpose exactly. A missed owner breaks an unrelated upload.
  The existing one-owner migration test is the guard. Extend it; never relax it.
- **One store version on two owners.** On verification, the online return row and the award hold the same version. V2 must
  confirm that no unique index or attach rule refuses this outside the project files' one-pin index (PW-37). If one does, the
  verify act detaches from the row with a reason, and the plan's record changes in the log.
- **Two slots in one act.** The verify act writes two `Person` columns (`AwardOnlineReturn.verifiedByPersonId` and
  `AwardReturn.receivedByPersonId`). If `beginAct` takes one slot, both are written from the one attribution, and the act-wiring
  scan must say so explicitly, not by exemption.
- **The enum transaction.** `ADD VALUE` and its first use cannot share a transaction, hence two migration files.
- **The `ContractorSubmissionKind` widening** reaches every exhaustive map, and any `switch` on the kind without a default.
  Typecheck finds the maps; V1 also greps for `switch (` on the kind.
- **Silence with no rule.** WV-8 means a customer who loads no rule gets no inbox notice of a lodged return. The primary action
  and the Getting-started checklist do not cover notification rules. Watch this at the end-to-end check.
- **Live route reads** (WV-9): a type edited from Supply to Certified mid-contract stops new supply claims on live contracts.
  The two-person path is the control.
- **Builders in flight** hold `src/lib/award/repo.ts` and `src/lib/contract/case-load.ts`. V2 and V5 wait on them.
- **Memory.** Steps V1, V2 and V6 run the full typecheck and `test:db`. Run one at a time, with the dev server off.

## 8. Proposed decisions-log lines (not written by the architect)

- 2026-10-24 · Solution architect: wave V plan (`docs/notes/plans/wave-v-plan.md`) and ADR 0045 (online award return and supply
  invoices).
  - Ten steps; one schema step (V1, two migration files).
  - V-1 is an online return under AC-31: the signing-authority account, after entering its password again, uploads the wet-signed
    scans and, for an indent, types the page. An officer verifies it into the existing return, and `acceptOnCompleteReturn`
    accepts the award.
  - Queries are asked while the award is issued and pause no clock. There is no decline, no accept-with-changes and no
    click-only acceptance.
  - The commitment number is shown in the portal when recorded.
  - V-3 is a seventh Project workspace kind, "Delivery order and invoice", with two file purposes, offered by a typed nullable
    `ContractType.paymentRoute` (BD-613-128). It is verified by the existing mark, and Finance's payment is recorded by hand in
    `SupplyInvoicePayment` beside `FinancePayment`.
  - WV-1 to WV-16 go to the product owner.
- 2026-10-24 · Product owner (for the founder), to rule: wave V is released by the founder's "then wave V" (2026-10-24) and PW-1;
  AC-35 and AC-48 no longer hold it. CPD's acceptance becomes a go-live condition (WV-1, WV-15).
- 2026-10-24 · Product owner (for the founder): V-2 is covered by waves 3b and 3c (committed 2026-10-17). Online quotations use
  the sealed path, and no unsealed RFQ is built (AC-32, FR-BID-001).
- 2026-10-24 · Solution architect: ADR 0045 takes the place of the "ADR 0040, the award return may be lodged online" reserved in
  design note 0004 §7. Number 0040 is the staff-screen language layer.
- RSAJ questions to add to `docs/notes/rsaj-questions.md` (Still open):
  - **33.** Which office receives a contractor's online award return and its questions?
  - **34.** Does a supply contract ever take an interim payment certificate, or only the delivery order and invoice?
  - **35.** Is consultancy paid on certified claims?
