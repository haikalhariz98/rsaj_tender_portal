# The simple Project workspace: build plan

**Status:** Accepted for building, 2026-10-22. Written by the solution architect. The decisions are in ADR 0042
(`docs/notes/architecture/0042-the-simple-project-workspace.md`), and the binding input is the product owner's rulings PW-1 to PW-21
of 2026-10-22 (decisions log). This plan replaces `docs/notes/plans/wave-p-build-plan.md`, which is kept and marked Superseded.

**The founder's words.** "it should be simple Create document in project/ can add approval afterward> upload document or request
document from vendor/RSAJ > RSAJ review or approved> if reject the respective party provided remarks, supplier resubmit > until it
approved that all. it should be simple no figure or anything."

**Order of work** (founder, 2026-10-22):
1. registration group 5;
2. this workspace, with every pending item (PW-21);
3. wave V;
4. a simplicity pass over the Project and Requisition screens.

**Gate.** The founder's go-ahead of 2026-10-22 replaces AC-7 (PW-1). Step 1 starts when registration fix group 5 is committed. CPD's
written acceptance is a go-live condition (backlog), not a build gate.

**What this plan does not build** (PW-4, PW-7, PW-13, PW-16, PW-17):
- document numbers, revision letters, document types, review targets, due days, days waiting, overdue, counts on a document, charts;
- "approved with comments", a revise/rejected split, final rejection, withdrawal, acknowledge;
- a `SupplierNotice` table, the bell, email;
- stored team members, team roles, `projects.exchange.oversee`, member requests;
- typed money or day fields on the six kinds.

## 0. Rules every step follows

- **Next.js 16.** Read `node_modules/next/dist/docs/` before writing a page or a route:
  - `01-app/03-api-reference/03-file-conventions/page.md` (`params` is a `Promise`);
  - `route.md` (`RouteContext`);
  - `01-app/01-getting-started/07-mutating-data.md`.
  A Server Action body is capped at 1 MB, so files always go through a Route Handler first (ADR 0011 D5).
- **Schema steps: steps 1 and 7 only.**
  - The founder's database `perolehan` only ever receives NEW migrations. Never edit or squash an applied migration, never
    `migrate reset` it, and never run `db:reset` against it.
  - Name each migration folder so it sorts after the newest folder on disk at build time. Today that is the other builder's
    untracked `20261118000100_portal_application_frozen`.
  - After each migration is applied, run `npx prisma generate`, then restart the dev server (`npm run dev`). The running server holds
    the old generated client.
  - Run `npm run db:roles` after the migration, so the append-only revokes reach the new tables (`src/lib/auth/db-role.ts`).
- **Lock order.** Contract (`withLockedContract`), then the `ProjectDocument` row (`SELECT id FROM "ProjectDocument" WHERE id = $1
  FOR UPDATE`).
  - No other row lock.
  - Staging a file takes no contract lock. `storeUpload` never runs inside `withLockedContract`.
  - The window count at staging takes the portal account's own row (`SupplierAccount`, `FOR UPDATE`), never the `Supplier` row and
    never with the contract lock.
- **Every act:**
  1. the `PROJECT_WORKSPACE` act-status row;
  2. the PW-5 authority on the locked rows;
  3. the pure faults on the locked rows;
  4. the guarded write;
  5. the audit row with before and after (`writeAudit`, `diffFields`), in the same transaction;
  6. the staff notices, through `writeNotices` (`src/lib/inbox/notices.ts`);
  7. the act slot (`beginAct` and `act.write(tx, id)`) for staff acts.
- **Words.** English only. Codes never reach a screen. The organisation is named by its configured name (`l.org.name`), never
  "RSAJ".
- **Screens** use only `PageHeader`, `Tabs`, `DataList`, `Card`/`CardHeader`/`CardBody`, `KeyValues`, `Badge`, `Button`/`ButtonLink`,
  `Field`/`Input`/`Select`, `Callout` and `EmptyState`. No one-off variants. Explanations go behind info popovers (design note 0005).
- **Builders.** One builder at a time, two jobs at most. A builder who needs to change a name or a signature below raises it with
  the architect first.

## 1. What exists today (verified 2026-10-22)

| Need | Where |
| --- | --- |
| Contractor reach | `supplierHoldsContract`, `src/lib/portal/projects/visibility.ts:19`; the held, locked contract for a supplier act: `inHeldContract`, `src/lib/portal/projects/submission-store.ts:58` |
| Organisation authority at the act | `recorderFaultToday`, `src/lib/supervision/load.ts:88`; `soOfficeOn` `:76`; `delegationFactsOf` `:65`; `ActNeed`, `src/lib/supervision/authority.ts:44` |
| The pattern of a staff act | `answerContractorSubmission`, `src/app/documents/review-actions.ts:34`: `staffForAct("TRANSACTION")`, `beginAct`, `withLockedContract`, row lock, `recorderFaultToday {act: "CONTRACTOR_COMMUNICATION"}`, guarded `updateMany`, `act.write`, `writeAudit` |
| Contract lock | `withLockedContract`, `src/lib/contract/repo.ts:74`; lock-order scan `src/lib/contract/lock-order.test.ts` (`CONTRACT_ACT_FILES` at `:28`) |
| Act × status table | `ACT_STATUS`, `src/lib/contract/act-status.ts`; tests `act-status.test.ts`, `act-status-pin.test.ts` (with `act-status-pin.fixture.ts`), `act-status-scan.test.ts`, `act-status-screens.test.ts`, `act-status-edges.test.ts` |
| Case tabs | `CASE_TABS.project`, `src/lib/contract/case-tabs.ts:23`; labels `CASE_TAB_WORDS`, `src/lib/contract/case-page-words.ts:31` (`documents` `:46`, `submissions` `:47`); "Submissions waiting" `:237` |
| Staff tabs today | "submissions": `src/app/projects/[id]/submissions-tab.tsx` (renders `src/app/projects/submissions-panel.tsx`); "documents" (certificates): `src/app/projects/[id]/documents-panel.tsx`; dispatched in `src/app/projects/[id]/page.tsx:261-264`; Team: `TeamPanel`, `src/app/projects/[id]/supervision-panels.tsx:183` |
| `/projects` "Submissions waiting" | `src/app/projects/page.tsx:68,85,138`; `src/app/projects/submissions-view.tsx`; counts `reviewCounts`, `src/lib/portal/projects/review-store.ts:58` |
| Legacy submissions | `ContractorSubmission`, `prisma/schema.prisma:13135`; `ContractorSubmissionKind` `:13095`; `ContractorSubmissionOutcome` `:13105`; `sendSubmission`, `submission-store.ts:72`; route `src/app/supplier/projects/submit/route.ts`; `KIND_SHAPE`, `src/lib/portal/projects/submission.ts:45` |
| Flood bound precedent | `SUBMISSION_WINDOW_MINUTES = 60`, `SUBMISSIONS_PER_WINDOW = 30`, `submission.ts:90-91` |
| Statutory declaration safeguards | `confirmSupplierPassword` (`src/app/supplier/projects/submit/route.ts:27`); `contractorSigningFaultOf`, `src/lib/portal/projects/signing-store.ts:12`; slot `ContractorSubmission.submittedBy`, `src/lib/auth/act-slots.ts:472` |
| Portal project tabs | `PROJECT_TABS`, `src/lib/portal/projects/types.ts:9`; page `src/app/supplier/projects/[id]/page.tsx:33,43`; panels `panels.tsx`; overview counts `overviewTab`, `src/lib/portal/projects/workspace-store.ts:54` |
| Store | `DocumentAttachment`, `schema.prisma:4708`; `AttachmentPurpose` `:4487`; `DocumentStorePolicy` `:4591`; `DocumentAccessEvent` `:4848`; `storeUpload`/`storeUploadTx`, `src/lib/documents/service.ts:160,178`; `logAccess` `:62`; staff staging route `src/app/api/documents/route.ts`; staff download `src/app/api/documents/versions/[id]/route.ts`; supplier upload precedent `src/app/supplier/registration/upload/route.ts` |
| Owner plumbing | `ownerOf`, `withLockedOwner`, `src/lib/documents/owners.ts`; `OwnerFacts`, `purposeFits`, `ownerState`, `src/lib/documents/attach.ts`; `src/lib/documents/owner-facts.ts`; `src/lib/documents/targets.ts`; `subjectOfOwner`, `src/lib/documents/entitlement.ts:74`; `src/lib/documents/demo-wipe-plan.ts`; scan `src/lib/documents/owner-check.test.ts` |
| Staged-for marks | `src/lib/documents/staged-for.ts` (`STAGED_FOR_DELEGATION`, `STAGED_FOR_TEMPLATE_FILE`, `templateFileRefusal`) |
| Upload rules editor | `saveStorePolicy`, `src/app/configuration/documents/core.ts`; two-person path `stageEdit("documents.saveStorePolicy")`, `actions.ts`; `policyView`, `src/lib/documents/audit-view.ts` |
| Staff notices | `StaffNotice`, `schema.prisma:13055`; `STAFF_NOTICE_KINDS`, `src/lib/inbox/kinds.ts`; last CHECK change `prisma/migrations/20261110000000_staff_notices_indent_and_commencement` |
| Act slots | `ACT_SLOTS`, `NOT_AN_ACT` (`:415`), `SUPPLIER_ACT_SLOTS`, `LABEL_MS`, `src/lib/auth/act-slots.ts`; tests `act-slots.test.ts`, `act-wiring-scan.test.ts` (`NOT_BUILT`) |
| Append-only grants | `APPEND_ONLY_TABLES`, `src/lib/auth/db-role.ts:23` |
| Supplier export | `src/lib/suppliers/data-export-fields.ts` (`EXPORT_COLUMNS`, `OUT_MODELS`, `ContractorSubmission: "NOT_YET_EXPORTED"` at `:382`); `data-export.test.ts`; `src/lib/portal/data-export-store.ts` |
| Briefing | `recordBriefing`, `src/app/projects/[id]/actions.ts:730`; drawer `src/app/projects/[id]/editors.tsx:362`; `briefingMissing`, `src/lib/contract/sign.ts:170` |
| Where kinds are recorded | Programme card: `src/app/projects/[id]/supervision-panels.tsx:386` (Site, section "start"); valuations: Payments › "valuations" (`claimReceivedOn`, `src/app/projects/[id]/payment-actions.ts:203,217`); delay notice: `recordDelayNotice`, `src/app/projects/[id]/time-actions.ts:84` (no staff screen today) |
| Demo data | `npm run demo:load` (`prisma/demo.ts load`); the contractor's projects fixture `prisma/demo-my-projects.ts` |

## 2. Step 1 — data-modeler: one schema change (two migration folders)

**Changes the schema.** Each new value of an existing enum must be its own migration (BD-613-112), because `ALTER TYPE ... ADD VALUE`
cannot be used in the same transaction that replaces the purpose CHECK. So step 1 is:
- `<ts>_enum_purpose_project_document_file/migration.sql`: `ALTER TYPE "AttachmentPurpose" ADD VALUE 'PROJECT_DOCUMENT_FILE';`
- `<ts+1>_project_workspace/migration.sql`: everything else below.

This is a technical split, not a departure from PW's "one migration". Apply both, run `prisma generate`, then `db:roles`, then restart
the dev server.

### 2.1 Prisma declarations (exact)

```prisma
/// Which side of the contract a project document's versions come from (ADR 0042 D1, PW-5, PW-8). Set at creation, never changed.
enum ProjectSide {
  CONTRACTOR
  ORGANISATION
}

/// A decision on one version: an approver's (APPROVED, REJECTED; PW-6, PW-7) or the mark on a version of one of the six kinds
/// (TAKEN_UP, RETURNED; PW-9).
enum ProjectDocumentOutcome {
  APPROVED
  REJECTED
  TAKEN_UP
  RETURNED
}

/// A document in a contract's Project workspace (ADR 0042 D1). Created with its first version or its first request, so never empty.
/// Its state is never stored: `documentState` (src/lib/project-docs/state.ts) derives it.
model ProjectDocument {
  id             String       @id @default(cuid())
  organisationId String
  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Restrict)
  contractId     String
  contract       Contract     @relation(fields: [contractId], references: [id], onDelete: Restrict)

  title String
  note  String      @default("")
  /// The side whose versions this document holds: the creator's when the creator uploads first, the other side when the creator asks for it.
  side  ProjectSide
  /// One of the six kinds (PW-9), on a CONTRACTOR document only, picked by the contractor at its first version. Null: an ordinary document.
  kind  ContractorSubmissionKind?

  createdByPersonId          String?
  createdByPerson            Person?          @relation("ProjectDocumentCreatedBy", fields: [createdByPersonId], references: [id], onDelete: Restrict)
  createdBySupplierAccountId String?
  createdBySupplierAccount   SupplierAccount? @relation("ProjectDocumentCreatedBySupplier", fields: [createdBySupplierAccountId], references: [id], onDelete: Restrict)
  createdAt                  DateTime

  versions  ProjectDocumentVersion[]
  requests  ProjectDocumentRequest[]
  approvers ProjectDocumentApprover[]

  @@index([contractId, createdAt])
  @@index([organisationId])
}

/// One version: shown as "Version {number}" with its day and uploader (PW-4). Its files are DocumentAttachment rows (purpose
/// PROJECT_DOCUMENT_FILE). Append-only.
model ProjectDocumentVersion {
  id             String          @id @default(cuid())
  organisationId String
  organisation   Organisation    @relation(fields: [organisationId], references: [id], onDelete: Restrict)
  documentId     String
  document       ProjectDocument @relation(fields: [documentId], references: [id], onDelete: Restrict)

  /// 1, 2, 3 within the document. Not the store's DocumentVersion.versionNo.
  number Int
  note   String @default("")

  uploadedByPersonId          String?
  uploadedByPerson            Person?          @relation("ProjectDocumentVersionUploadedBy", fields: [uploadedByPersonId], references: [id], onDelete: Restrict)
  uploadedBySupplierAccountId String?
  uploadedBySupplierAccount   SupplierAccount? @relation("ProjectDocumentVersionUploadedBySupplier", fields: [uploadedBySupplierAccountId], references: [id], onDelete: Restrict)
  /// Server time, and the organisation's day from the server's clock (FR-EOT-001 for a delay notice).
  uploadedAt DateTime
  uploadedOn DateTime

  /// True when the document had no live approver at upload (PW-8). Written with the row; an ORGANISATION version with this true is shared
  /// with the contractor at once, and adding an approver later never hides it.
  noApproversAtUpload Boolean

  /// The request this version answers, if it answers one.
  requestId String?                 @unique
  request   ProjectDocumentRequest? @relation(fields: [requestId], references: [id], onDelete: Restrict)

  /// STATUTORY_DECLARATION only: when the password was asked again (the attribution carries the signature). Step 6 writes it.
  signedAt DateTime?

  files     DocumentAttachment[]
  decisions ProjectDocumentDecision[]

  @@unique([documentId, number])
  @@index([organisationId, uploadedAt])
}

/// A request for a document, to a side (PW-5). Open while no version names it. Append-only.
model ProjectDocumentRequest {
  id             String          @id @default(cuid())
  organisationId String
  organisation   Organisation    @relation(fields: [organisationId], references: [id], onDelete: Restrict)
  documentId     String
  document       ProjectDocument @relation(fields: [documentId], references: [id], onDelete: Restrict)

  /// Always the document's side, and never the asker's own.
  toSide ProjectSide
  note   String      @default("")

  requestedByPersonId          String?
  requestedByPerson            Person?          @relation("ProjectDocumentRequestedBy", fields: [requestedByPersonId], references: [id], onDelete: Restrict)
  requestedBySupplierAccountId String?
  requestedBySupplierAccount   SupplierAccount? @relation("ProjectDocumentRequestedBySupplier", fields: [requestedBySupplierAccountId], references: [id], onDelete: Restrict)
  requestedAt                  DateTime

  answeredBy ProjectDocumentVersion?

  @@index([documentId])
}

/// A named approver of a document (PW-6). Removed once, with a reason, before deciding the current version.
model ProjectDocumentApprover {
  id             String          @id @default(cuid())
  organisationId String
  organisation   Organisation    @relation(fields: [organisationId], references: [id], onDelete: Restrict)
  documentId     String
  document       ProjectDocument @relation(fields: [documentId], references: [id], onDelete: Restrict)

  personId String
  person   Person @relation("ProjectDocumentApprover", fields: [personId], references: [id], onDelete: Restrict)

  addedByPersonId String
  addedBy         Person   @relation("ProjectDocumentApproverAddedBy", fields: [addedByPersonId], references: [id], onDelete: Restrict)
  addedAt         DateTime

  removedAt         DateTime?
  removedByPersonId String?
  removedBy         Person?   @relation("ProjectDocumentApproverRemovedBy", fields: [removedByPersonId], references: [id], onDelete: Restrict)
  removeReason      String    @default("")

  decisions ProjectDocumentDecision[]

  @@index([documentId])
}

/// A decision on one version (PW-6, PW-7, PW-9). Append-only.
model ProjectDocumentDecision {
  id             String                 @id @default(cuid())
  organisationId String
  organisation   Organisation           @relation(fields: [organisationId], references: [id], onDelete: Restrict)
  versionId      String
  version        ProjectDocumentVersion @relation(fields: [versionId], references: [id], onDelete: Restrict)

  /// The approver who decided (APPROVED, REJECTED). Null for TAKEN_UP and RETURNED.
  approverId String?
  approver   ProjectDocumentApprover? @relation(fields: [approverId], references: [id], onDelete: Restrict)

  outcome ProjectDocumentOutcome
  remarks String                 @default("") @db.Text

  decidedByPersonId String
  decidedBy         Person   @relation("ProjectDocumentDecidedBy", fields: [decidedByPersonId], references: [id], onDelete: Restrict)
  decidedAt         DateTime
  decidedOn         DateTime

  @@unique([versionId, approverId])
  @@index([versionId])
}
```

**Changes to existing models:**

```prisma
// DocumentAttachment (schema.prisma:4708): a new owner, after portalApplicationCreditor
  /// ADR 0042 D1: a version of a Project workspace document (its files).
  projectDocumentVersionId String?
  projectDocumentVersion   ProjectDocumentVersion? @relation(fields: [projectDocumentVersionId], references: [id], onDelete: Restrict)
  @@index([projectDocumentVersionId])

// AttachmentPurpose (schema.prisma:4487), last value (its own migration)
  /// ADR 0042 D1: a file of a Project workspace document's version, on the version.
  PROJECT_DOCUMENT_FILE

// DocumentStorePolicy (schema.prisma:4591)
  /// ADR 0042 D7 (PW-14): the class every Project workspace file takes. Must be classified and not SULIT. Null: not set, and nothing can be created or uploaded in the workspace, naming the setting.
  projectDocumentClassId String?
  projectDocumentClass   DocumentClass? @relation("ProjectDocumentClass", fields: [projectDocumentClassId], references: [id], onDelete: Restrict)

// DocumentClass
  projectDocumentPolicies DocumentStorePolicy[] @relation("ProjectDocumentClass")

// Organisation
  projectDocuments         ProjectDocument[]
  projectDocumentVersions  ProjectDocumentVersion[]
  projectDocumentRequests  ProjectDocumentRequest[]
  projectDocumentApprovers ProjectDocumentApprover[]
  projectDocumentDecisions ProjectDocumentDecision[]

// Contract
  projectDocuments ProjectDocument[]

// Person
  projectDocumentsCreated        ProjectDocument[]         @relation("ProjectDocumentCreatedBy")
  projectVersionsUploaded        ProjectDocumentVersion[]  @relation("ProjectDocumentVersionUploadedBy")
  projectRequestsMade            ProjectDocumentRequest[]  @relation("ProjectDocumentRequestedBy")
  projectApproverOf              ProjectDocumentApprover[] @relation("ProjectDocumentApprover")
  projectApproversAdded          ProjectDocumentApprover[] @relation("ProjectDocumentApproverAddedBy")
  projectApproversRemoved        ProjectDocumentApprover[] @relation("ProjectDocumentApproverRemovedBy")
  projectDocumentDecisions       ProjectDocumentDecision[] @relation("ProjectDocumentDecidedBy")

// SupplierAccount
  projectDocumentsCreated  ProjectDocument[]        @relation("ProjectDocumentCreatedBySupplier")
  projectVersionsUploaded  ProjectDocumentVersion[] @relation("ProjectDocumentVersionUploadedBySupplier")
  projectRequestsMade      ProjectDocumentRequest[] @relation("ProjectDocumentRequestedBySupplier")
```

### 2.2 SQL in `<ts+1>_project_workspace` (after Prisma's generated DDL)

- **`ProjectDocument`:**
  - CHECK `num_nonnulls("createdByPersonId", "createdBySupplierAccountId") = 1`;
  - CHECK `"kind" IS NULL OR "side" = 'CONTRACTOR'`;
  - CHECK `length(btrim("title")) > 0`;
  - trigger: DELETE refused; on UPDATE, only `kind` may change, and only from NULL to a value.
- **`ProjectDocumentVersion`:**
  - CHECK `num_nonnulls("uploadedByPersonId", "uploadedBySupplierAccountId") = 1`;
  - CHECK `"number" >= 1`;
  - trigger: UPDATE and DELETE refused;
  - on INSERT, the uploader's side must match the document's side: CONTRACTOR needs `uploadedBySupplierAccountId`, ORGANISATION
    needs `uploadedByPersonId`.
- **`ProjectDocumentRequest`:**
  - CHECK `num_nonnulls("requestedByPersonId", "requestedBySupplierAccountId") = 1`;
  - trigger: UPDATE and DELETE refused;
  - on INSERT, `toSide` equals the document's side, and the asker is on the other side.
- **`ProjectDocumentApprover`:**
  - partial UNIQUE `("documentId", "personId") WHERE "removedAt" IS NULL`;
  - CHECK `("removedAt" IS NULL) = ("removedByPersonId" IS NULL)`;
  - CHECK `"removedAt" IS NULL OR length(btrim("removeReason")) > 0`;
  - trigger: DELETE refused; on UPDATE, only `removedAt`, `removedByPersonId` and `removeReason` change, once, from unset;
  - on INSERT, refused when the document has a `kind`.
- **`ProjectDocumentDecision`:**
  - CHECK `("outcome" IN ('APPROVED','REJECTED')) = ("approverId" IS NOT NULL)`;
  - CHECK `"outcome" NOT IN ('REJECTED','RETURNED') OR length(btrim("remarks")) > 0`;
  - partial UNIQUE `("versionId") WHERE "approverId" IS NULL` (one mark per version of a kind);
  - trigger: UPDATE and DELETE refused. On INSERT:
    - APPROVED and REJECTED are refused on a document with a `kind`, and TAKEN_UP and RETURNED on one without;
    - the approver row is live (`removedAt IS NULL`) and its `personId` equals `decidedByPersonId`;
    - the version is the document's highest `number`;
    - `decidedByPersonId` is not the version's `uploadedByPersonId`.
- **`DocumentAttachment`:**
  - drop and re-create `DocumentAttachment_one_owner` with `projectDocumentVersionId` added to the `num_nonnulls(...) = 1` list;
  - drop and re-create `DocumentAttachment_purpose_owner` with `PROJECT_DOCUMENT_FILE` allowed only with `projectDocumentVersionId`;
  - copy both from their last definition in `prisma/migrations/20261117001000_one_submission_registration/migration.sql:225-235`,
    so no existing owner or purpose is dropped.
- **`StaffNotice`:** drop and re-create the kind CHECK with the full list in `kinds.ts`, adding `PROJECT_DOCUMENT_TO_APPROVE`,
  `PROJECT_DOCUMENT_FROM_CONTRACTOR` and `PROJECT_DOCUMENT_REQUESTED`. The last definition is
  `20261110000000_staff_notices_indent_and_commencement`.
- **The trigger functions** raise with a message naming the rule, as the `DocumentVersion` trigger (migration `20261007100100`) does.

### 2.3 Code that changes with the schema (or the schema-wide scans fail)

- **`src/lib/inbox/kinds.ts`.** Add the three kinds, with their labels:
  - `PROJECT_DOCUMENT_TO_APPROVE`: "Document to approve";
  - `PROJECT_DOCUMENT_FROM_CONTRACTOR`: "Document from the contractor";
  - `PROJECT_DOCUMENT_REQUESTED`: "Document asked for by the contractor".
  Update the header comment's migration list.
- **`src/lib/contract/act-status.ts`.** This is TypeScript, not SQL.
  - Add `"PROJECT_WORKSPACE"` to `CONTRACT_ACTS`, after `"CERTIFICATE"`.
  - Add `PROJECT_WORKSPACE: executed(PC, MGC, FCI, T)` to `ACT_STATUS`.
  - Extend `act-status.test.ts`, `act-status-pin.test.ts` and its fixture, `act-status-scan.test.ts` and `act-status-screens.test.ts`
    to the new row. Do not loosen them.
- **`src/lib/auth/act-slots.ts`.** Register every new `Person` relation.
  - Slots, with no `holder` until step 4 wires them:
    - `ProjectDocument.createdByPerson` "Raised by";
    - `ProjectDocumentVersion.uploadedByPerson` "Sent by";
    - `ProjectDocumentRequest.requestedByPerson` "Requested by";
    - `ProjectDocumentApprover.addedBy` "Recorded by";
    - `ProjectDocumentApprover.removedBy` "Recorded by";
    - `ProjectDocumentDecision.decidedBy` "Decided by".
    Use existing `LABEL_MS` labels only; add no Malay.
  - `NOT_AN_ACT`: `ProjectDocumentApprover.person`: "The approver named: who is asked to decide, not who acted. The act is the
    addition, whose slot is `ProjectDocumentApprover.addedBy`."
  - `src/lib/auth/act-wiring-scan.test.ts` `NOT_BUILT`: one entry per new slot, each with a writer regex (for example
    `/projectDocumentDecision\.create/`). Step 4 removes them.
- **The document store's owner plumbing** learns owner kind `projectDocumentVersion`:
  - `src/lib/documents/attach.ts` (`OwnerFacts`, `purposeFits`, `ownerState`);
  - `owners.ts` (`ownerOf`). `withLockedOwner` refuses this kind: only the workspace acts attach to it;
  - `owner-facts.ts`;
  - `targets.ts`: not a target of the generic Attach drawer, as the bill version is not;
  - `entitlement.ts`: `subjectOfOwner` resolves to the version's contract;
  - `demo-wipe-plan.ts`;
  - `labels.ts`: purpose label "Project document file".
  `owner-check.test.ts` must list the new owner and purpose, and pass.
- **`src/lib/auth/db-role.ts`.** Add `ProjectDocumentVersion`, `ProjectDocumentRequest` and `ProjectDocumentDecision` to
  `APPEND_ONLY_TABLES`. `ProjectDocument` and `ProjectDocumentApprover` stay out, because each has one write-once update.
- **`src/lib/suppliers/data-export-fields.ts`.** `ProjectDocument`, `ProjectDocumentVersion` and `ProjectDocumentRequest` name a
  supplier account, so add them to `OUT_MODELS` as `"NOT_YET_EXPORTED"`. Step 5 moves them into `EXPORT_COLUMNS`.

### 2.4 Done when

- `npx prisma migrate dev` applies both folders to a scratch database, and `npm run typecheck`, `npm run lint` and `npm test` pass.
- New `src/lib/project-docs/schema.db.test.ts` proves:
  - a version UPDATE and DELETE are refused;
  - a second decision by the same approver on one version is refused;
  - an APPROVED decision on a document with a kind is refused, and a TAKEN_UP decision on one without a kind is refused;
  - a decision on a version that is not the latest is refused;
  - a decision by the version's own uploader is refused;
  - an approver row on a document with a kind is refused;
  - `kind` set twice is refused;
  - a contractor-side version uploaded by a person is refused;
  - an attachment with both `contractId` and `projectDocumentVersionId` is refused;
  - an existing owner of every kind still inserts (the owner list from `owner-check.test.ts`);
  - a `StaffNotice` of each new kind inserts, and an unknown kind is refused.
- `act-slots.test.ts`, `act-wiring-scan.test.ts`, `data-export.test.ts`, `owner-check.test.ts` and the act-status tests pass,
  unweakened.

## 3. Step 2 — domain-engineer: pure `src/lib/project-docs/**`, with tests

No database access in any file below except `side-store.ts` and `register.ts`. Each pure file has a `.test.ts`. `Finding` is
`Finding` from `@/lib/contract/types`.

```ts
// src/lib/project-docs/types.ts
export type Side = "CONTRACTOR" | "ORGANISATION";
export type DocKind = SubmissionKind; // from "@/lib/portal/projects/types": the six kinds, reused
export type Outcome = "APPROVED" | "REJECTED" | "TAKEN_UP" | "RETURNED";
export type Actor =
  | { side: "ORGANISATION"; personId: string; authorityToday: boolean }   // authorityToday: recorderFaultToday {act: CONTRACTOR_COMMUNICATION} passed
  | { side: "CONTRACTOR"; accountId: string };                           // inHeldContract passed
export interface VersionFacts { id: string; number: number; uploaderPersonId: string | null; uploaderAccountId: string | null; noApproversAtUpload: boolean; requestId: string | null; uploadedOn: string }
export interface ApproverFacts { id: string; personId: string; removed: boolean }
export interface DecisionFacts { versionId: string; approverId: string | null; outcome: Outcome; remarks: string }
export interface RequestFacts { id: string; toSide: Side; answered: boolean }
export interface DocumentFacts { side: Side; kind: DocKind | null; versions: readonly VersionFacts[]; approvers: readonly ApproverFacts[]; decisions: readonly DecisionFacts[]; requests: readonly RequestFacts[] }

// src/lib/project-docs/state.ts — the one source of a document's state (PW-12)
export type DocumentState =
  | "REQUESTED"            // an open request; waits on its toSide
  | "WAITING_FOR_APPROVAL" // the latest version, live approvers, none rejected, not all approved; waits on ORGANISATION
  | "APPROVED"             // every live approver approved the latest version; final
  | "REJECTED"             // a live approver rejected the latest version; waits on the document's side
  | "SHARED"               // the latest version, no approver, no kind; waits on nobody
  | "RECEIVED"             // a kind, the latest version not yet marked; waits on ORGANISATION
  | "TAKEN_UP"             // a kind, the latest version taken up; final
  | "RETURNED";            // a kind, the latest version returned; waits on CONTRACTOR
export interface DocumentReading { state: DocumentState; waitsOn: Side | null; pendingApproverPersonIds: readonly string[]; latest: VersionFacts | null; final: boolean; openRequest: RequestFacts | null }
export function documentState(d: DocumentFacts): DocumentReading;
// An open request wins (it is the newest act). Otherwise the latest version and the live approvers' decisions on it decide.

// src/lib/project-docs/faults.ts — one function per act; each returns every fault, never the first only
export type CreateFault = "NO_AUTHORITY" | "CLASS_NOT_SET" | "TITLE_REQUIRED" | "TITLE_TOO_LONG" | "NOTE_TOO_LONG" | "NO_FILES" | "TOO_MANY_FILES" | "KIND_NOT_CONTRACTOR" | "KIND_WITH_APPROVERS" | "APPROVERS_NOT_ORGANISATION" | "REQUEST_OWN_SIDE";
export function createFaults(i: { actor: Actor; classSet: boolean; title: string; note: string; first: { upload: { files: number; kind: DocKind | null } } | { request: { toSide: Side; note: string } }; approverCount: number }): Finding<CreateFault>[];

export type UploadFault = "NO_AUTHORITY" | "CLASS_NOT_SET" | "NOT_YOUR_SIDE" | "FINAL" | "NO_FILES" | "TOO_MANY_FILES" | "NOTE_TOO_LONG" | "KIND_NOT_CONTRACTOR" | "KIND_ALREADY_SET" | "KIND_WITH_APPROVERS" | "DECLARATION_NOT_SIGNED";
export function uploadFaults(i: { actor: Actor; classSet: boolean; doc: DocumentFacts; files: number; note: string; kind: DocKind | null; signed: boolean }): Finding<UploadFault>[];
// NOT_YOUR_SIDE: the actor's side is not doc.side. FINAL: APPROVED or TAKEN_UP. KIND_ALREADY_SET: a kind offered on a document that has one or has a version.
// A new version is accepted in every state but the final ones; approvals never carry over (PW-6). It answers the open request, if any.

export type RequestFault = "NO_AUTHORITY" | "OWN_SIDE" | "FINAL" | "ALREADY_WAITING" | "NOTE_TOO_LONG";
export function requestFaults(i: { actor: Actor; doc: DocumentFacts; note: string }): Finding<RequestFault>[];
// The request goes to doc.side. OWN_SIDE: the actor is on doc.side. ALREADY_WAITING: an open request, or the state already waits on doc.side (REJECTED, RETURNED). Accepted only when SHARED.

export type AddApproverFault = "NOT_ORGANISATION" | "NO_AUTHORITY" | "APPROVER_NO_AUTHORITY" | "ALREADY_APPROVER" | "FINAL" | "KIND_TAKES_NO_APPROVERS";
export function addApproverFaults(i: { actor: Actor; doc: DocumentFacts; personId: string; personAuthorityToday: boolean }): Finding<AddApproverFault>[];

export type RemoveApproverFault = "NOT_ORGANISATION" | "NO_AUTHORITY" | "NOT_LIVE" | "DECIDED_CURRENT" | "LAST_APPROVER" | "WOULD_APPROVE" | "FINAL" | "REASON_REQUIRED" | "REASON_TOO_LONG";
export function removeApproverFaults(i: { actor: Actor; doc: DocumentFacts; approverId: string; reason: string }): Finding<RemoveApproverFault>[];
// LAST_APPROVER: no live approver would remain. WOULD_APPROVE: every remaining live approver has approved the latest version (Approved with no decision act).

export type DecideFault = "NOT_ORGANISATION" | "NO_AUTHORITY" | "NOT_AN_APPROVER" | "OWN_VERSION" | "NOT_CURRENT" | "ALREADY_DECIDED" | "NOT_WAITING" | "REMARKS_REQUIRED" | "REMARKS_TOO_LONG";
export function decideFaults(i: { actor: Actor; doc: DocumentFacts; versionId: string; outcome: "APPROVED" | "REJECTED"; remarks: string }): Finding<DecideFault>[];
// NOT_WAITING: the state is not WAITING_FOR_APPROVAL (another approver rejected it, or it is approved).

export type MarkFault = "NOT_ORGANISATION" | "NO_AUTHORITY" | "NO_KIND" | "NOT_CURRENT" | "ALREADY_MARKED" | "REMARKS_REQUIRED" | "REMARKS_TOO_LONG";
export function markFaults(i: { actor: Actor; doc: DocumentFacts; versionId: string; outcome: "TAKEN_UP" | "RETURNED"; remarks: string }): Finding<MarkFault>[];

export const TITLE_MAX = 200;
export const NOTE_MAX = 2000;
export const REMARKS_MAX = 4000;

// src/lib/project-docs/visibility.ts — PW-8
export function contractorSeesVersion(doc: DocumentFacts, v: VersionFacts): boolean;
//   CONTRACTOR document: true. ORGANISATION document: v.noApproversAtUpload, or v is the latest and documentState(doc).state === "APPROVED".
export const contractorSeesRemarks = (doc: Pick<DocumentFacts, "side">): boolean => doc.side === "CONTRACTOR";
export type ContractorView = { shown: "VERSIONS"; versionIds: readonly string[] } | { shown: "BEING_PREPARED" };
export function contractorView(doc: DocumentFacts): ContractorView;   // no visible version: "Being prepared by {organisation}"
/// A contractor's download: the version is visible to it, and neither the document's classification nor its class's is SULIT or unset.
export function contractorMayDownload(i: { versionVisible: boolean; documentClassification: SecurityClass | null; classClassification: SecurityClass | null }): boolean;
/// "Waiting for you" (PW-13): an open request to the contractor, or a CONTRACTOR document REJECTED or RETURNED.
export function waitingForContractor(doc: DocumentFacts): boolean;

// src/lib/project-docs/bounds.ts — PW-15, technical constants (see §3.1)
export const PROJECT_FILES_PER_VERSION = 20;
export const PROJECT_UPLOAD_WINDOW_MINUTES = 60;
export const PROJECT_FILES_PER_WINDOW = 60;
export const PROJECT_BYTES_PER_WINDOW = 256n * 1024n * 1024n;
export type WindowFault = "TOO_MANY_FILES_IN_WINDOW" | "TOO_MANY_BYTES_IN_WINDOW";
export function windowFaults(i: { filesInWindow: number; bytesInWindow: bigint; incomingBytes: bigint }): Finding<WindowFault>[];
export type StagedFault = "NOT_STAGED_FOR_PROJECT" | "NOT_YOURS" | "ALREADY_ATTACHED" | "WITHDRAWN" | "WRONG_CLASS" | "DUPLICATE";
/// Each staged file the act would pin (ADR 0042 D8). recordedBy* are the store version's; actor is the act's.
export function stagedFileFaults(files: readonly { versionId: string; stagedFor: string | null; recordedByPersonId: string | null; recordedBySupplierAccountId: string | null; attachments: number; withdrawn: boolean; documentClassId: string }[], actor: Actor, projectClassId: string): Finding<StagedFault>[];

// src/lib/documents/staged-for.ts (added beside the two existing marks)
export const STAGED_FOR_PROJECT_DOCUMENT = "project-document";

// src/lib/project-docs/notices.ts — PW-13
export type WorkspaceEvent =
  | { event: "VERSION_WAITS_ON_APPROVERS"; versionId: string; approverPersonIds: readonly string[] }
  | { event: "CONTRACTOR_UPLOADED"; versionId: string; soHolderIds: readonly string[]; soActingIds: readonly string[] }
  | { event: "CONTRACTOR_REQUESTED"; requestId: string; soHolderIds: readonly string[]; soActingIds: readonly string[] };
export function noticeTargets(e: WorkspaceEvent): { kind: StaffNoticeKind; subjectEntity: "ProjectDocumentVersion" | "ProjectDocumentRequest"; subjectId: string; recipientPersonIds: string[] };
//   recipients de-duplicated; subjectId is the version or request id, so Version 2 notifies again despite the unique key.
// Title and body builders live in src/lib/inbox/notices.ts beside contractorSubmissionNotices: they carry the contract label, the
// document title and the contractor's name, and never a figure.

// src/lib/project-docs/taken-up.ts — PW-9
/// Where a taken-up kind is recorded. Null: no staff screen records it (see §11, item 3).
export function takenUpWhere(kind: DocKind): { stage: "project"; tab: "site" | "payments"; section: string } | null;
//   WORK_PROGRAMME → site/start; INTERIM_CLAIM, MATERIALS_ON_SITE → payments/valuations; DELAY_NOTICE, DEFECTS_RECTIFIED, STATUTORY_DECLARATION → null

// src/lib/project-docs/labels.ts — English words; never a code on screen
export const STATE_WORDS: Readonly<Record<DocumentState, string>>;   // "Asked for", "Waiting for approval", "Approved", "Rejected", "Shared", "Received", "Taken up", "Returned"
export function waitsOnWords(r: DocumentReading, orgName: string): string | null;   // "Waiting on the contractor" | `Waiting on ${orgName}` | null
export function faultText(f: Finding): string;
export const BEING_PREPARED = (orgName: string) => `Being prepared by ${orgName}`;
export const versionLabel = (n: number) => `Version ${n}`;

// src/lib/project-docs/side-store.ts — a reader, not pure
/// The organisation's side on a day (PW-16): S.O. holders, acting holders and representatives in force, each with its office label and
/// whether it may act (PW-5). Built from soOfficeOn and delegationFactsOf, never restating recorderFaultToday's rule.
export async function organisationSideOn(l: LoadedContract, s: SupervisionRows, day: string, client: Tx): Promise<{ personId: string; name: string; capacity: "SO" | "ACTING" | "REPRESENTATIVE"; officeLabel: string; mayAct: boolean }[]>;
```

### 3.1 The technical bounds (PW-15), logged as technical, not policy

| Constant | Value | Reason |
| --- | --- | --- |
| `PROJECT_FILES_PER_VERSION` | 20 | A drawing set or a claim with its back-up fits in one version. More than 20 files in one version is a sign of a script, or of a set that should be split into documents. The act refuses a version over it, and the form says so. |
| `PROJECT_UPLOAD_WINDOW_MINUTES` | 60 | The same window as `SUBMISSION_WINDOW_MINUTES`, so the portal has one rhythm. |
| `PROJECT_FILES_PER_WINDOW` | 60 | Three full versions an hour from one account. That is far above a contractor's working pace, and it stops a script from filling the store. |
| `PROJECT_BYTES_PER_WINDOW` | 256 MiB | Bytes live in Postgres `bytea` and are never deleted (ADR 0011 D1, D3). One account cannot add more than about 6 GB a day, even scripted. Each file is still capped by the customer's `maxBytes` and the deployment's `DOCUMENT_MAX_BYTES`. |

- The window bound applies to portal accounts: the external surface.
- Staff staging goes through the existing staff upload route, and staff are bounded per version only, as every other staff upload is
  today.
- The window is counted from `DocumentVersion` rows by `recordedBySupplierAccountId` and `storedAt`. Staged-but-unpinned files count,
  because staging is where a flood would land.

### 3.2 Done when (vitest, pure)

- **The founder's loop**, as one test in `state.test.ts`:
  1. the organisation creates a document and asks the contractor for it: REQUESTED, waits on CONTRACTOR;
  2. it adds an approver: still REQUESTED;
  3. the contractor uploads Version 1: WAITING_FOR_APPROVAL, waits on ORGANISATION, the approver pending;
  4. the approver rejects with remarks: REJECTED, waits on CONTRACTOR, and `contractorSeesRemarks` is true;
  5. the contractor uploads Version 2: WAITING_FOR_APPROVAL, and the Version 1 rejection does not count;
  6. the approver approves: APPROVED, final, waits on nobody.
- **Visibility and approvers:**
  - an organisation document with an approver at upload is BEING_PREPARED to the contractor until approved, then shows that version;
  - a version uploaded with no approver stays visible after an approver is added;
  - two approvers: one approval leaves WAITING_FOR_APPROVAL; a rejection by the second gives REJECTED, and a later approval by the
    first is NOT_WAITING;
  - an approver who uploaded the version is refused (OWN_VERSION);
  - an approver without authority today is refused (NO_AUTHORITY), and so is a person proposed without it (APPROVER_NO_AUTHORITY);
  - removing the last approver, or one whose removal leaves only approvals, is refused;
  - removing an approver who decided the current version is refused.
- **Kinds and sides:**
  - a document with a kind is never APPROVED: `addApproverFaults` gives KIND_TAKES_NO_APPROVERS, and `decideFaults` cannot reach
    APPROVED. TAKEN_UP is final; RETURNED waits on CONTRACTOR and needs remarks;
  - a contractor cannot add an approver, decide, mark, or upload to an ORGANISATION document;
  - an organisation person cannot upload to a CONTRACTOR document;
  - a request to one's own side is refused; a second request while one is open is refused; a request while REJECTED is refused;
  - Reject and Returned with blank remarks are refused, and Approve with blank remarks is accepted.
- **Bounds:** at 20 files a version is accepted, and at 21 it is refused; the window refuses at 61 files and at 256 MiB + 1 byte; a
  staged file of another actor, another class, already attached, or not staged for a project is refused.
- **Notices:** each event's recipients are exactly PW-13's, de-duplicated (an S.O. who is also an approver gets each kind once).
- **Words:** `STATE_WORDS` and every fault have English words, with no code in them (a scan, as `labels.test.ts` elsewhere).

## 4. Step 3 — api-engineer, then frontend-engineer: configuration, the project document class

**No schema change.**

- **`src/app/configuration/documents/core.ts` `saveStorePolicy`:**
  - read `projectDocumentClassId` only when the form posts it (`present.has("projectDocumentClassId")`, as `saveDocumentClass`
    does). A proposal staged without the field and decided later then never blanks it;
  - refuse a class of another organisation: "Choose one of this organisation's document classes.";
  - refuse an unclassified class: "Set this class's classification first. A project file is downloaded by the contractor, so its
    class must be classified.";
  - refuse a SULIT class: "A contractor downloads project files, so their class cannot be SULIT. Choose another class.";
  - write it in the `upsert`.
- **`src/lib/documents/audit-view.ts` `policyView`:** take the project class name too, so the audit row shows the class by name,
  before and after.
- **`src/lib/documents/service.ts` `loadStorePolicy`:** return `projectDocumentClassId`.
- **`src/app/configuration/documents/editors.tsx` and `page.tsx`:**
  - a `Select` "Class for project files" beside the bid-file class;
  - unset reads "Not set: nothing can be added to a project's documents until it is set";
  - the select offers only classified, non-SULIT classes.
- **The two-person path is unchanged.** `stageEdit("documents.saveStorePolicy")` already stages the whole form for a second person.
- **Done when:**
  - db test: a SULIT class is refused;
  - db test: an unclassified class is refused;
  - db test: a proposal without the field leaves the stored class unchanged when decided;
  - db test: the audit row names the class before and after;
  - `two-person-scan.test.ts` passes;
  - the Documents configuration screen shows "Not set" on a fresh organisation.

## 5. Step 4 — api-engineer, then frontend-engineer: staff acts and screens

**No schema change.**

### 5.1 The store: `src/lib/project-docs/store.ts`

The transactional cores. The server actions and the portal routes both call them, so neither restates a rule. Each core:
- takes an actor, an `ActWriter` (staff) or nothing (supplier) and its input;
- runs inside `withLockedContract` (staff) or `inHeldContract` (supplier);
- then takes the `ProjectDocument` row lock.

```ts
export async function createDocument(a: WorkspaceActor, i: { contractId: string; title: string; note: string; first: { upload: { stagedVersionIds: string[]; note: string; kind: DocKind | null; stepUpAt: Date | null } } | { request: { note: string } }; approverPersonIds: string[] }, act: ActWriter | null): Promise<{ documentId: string; versionId: string | null }>;
export async function addVersion(a: WorkspaceActor, i: { contractId: string; documentId: string; stagedVersionIds: string[]; note: string; kind: DocKind | null; stepUpAt: Date | null }, act: ActWriter | null): Promise<{ versionId: string; number: number }>;
export async function requestDocument(a: WorkspaceActor, i: { contractId: string; documentId: string; note: string }, act: ActWriter | null): Promise<{ requestId: string }>;
export async function addApprover(a: StaffWorkspaceActor, i: { contractId: string; documentId: string; personId: string }, act: ActWriter): Promise<{ approverId: string }>;
export async function removeApprover(a: StaffWorkspaceActor, i: { contractId: string; documentId: string; approverId: string; reason: string }, act: ActWriter): Promise<void>;
export async function decideVersion(a: StaffWorkspaceActor, i: { contractId: string; documentId: string; versionId: string; outcome: "APPROVED" | "REJECTED"; remarks: string }, act: ActWriter): Promise<void>;
export async function loadDocumentFacts(tx: Tx, documentId: string): Promise<DocumentFacts>;   // read under the lock
// WorkspaceActor = { kind: "STAFF"; actor: StaffActor } | { kind: "SUPPLIER"; actor: SupplierActor }
```

**The order inside each core:**
1. `actStatusFault("PROJECT_WORKSPACE", status)`.
2. The organisation's today (refuse "Time zone not set").
3. For staff, PW-5: `recorderFaultToday(l, sv, personId, { act: "CONTRACTOR_COMMUNICATION" }, today, so?.office ?? null, today, tx)`.
   `addApprover` runs it a second time for the **named** person, and `decideVersion` runs it for the approver.
4. Lock the document; `loadDocumentFacts`.
5. Read the staged store versions (`stagedFileFaults`) and the policy's `projectDocumentClassId`.
6. The pure faults.
7. Insert.
8. Pin each staged store version: a `DocumentAttachment` with `projectDocumentVersionId` and purpose `PROJECT_DOCUMENT_FILE`, and
   the store `Document` filed as the generic attach act files it.
9. `writeAudit`.
10. `writeNotices`, through `noticeTargets`. The S.O. holder and acting ids come from `soOfficeOn`.
11. `act.write(tx, id)` for staff.

`noApproversAtUpload` is the live-approver count under the lock, at the version's insert.

### 5.2 Server actions: `src/app/projects/[id]/document-actions.ts`

`createProjectDocument`, `uploadProjectVersion`, `requestProjectDocument`, `addProjectApprover`, `removeProjectApprover`,
`decideProjectVersion`. Each one:
- starts with `staffForAct("TRANSACTION")`;
- reads the form with `FormReader` (no schema library is installed);
- calls `beginAct(actor, data, "<slot key>", { personField, onBehalf: false })`;
- calls the store, catches `attributionRefusalState`, and revalidates `/projects` and `/projects/[id]`.

Slot keys:

| Action | Slot |
| --- | --- |
| `createProjectDocument` | `ProjectDocument.createdByPerson` (plus `ProjectDocumentVersion.uploadedByPerson` or `ProjectDocumentRequest.requestedByPerson` through `writeAlso`) |
| `uploadProjectVersion` | `ProjectDocumentVersion.uploadedByPerson` |
| `requestProjectDocument` | `ProjectDocumentRequest.requestedByPerson` |
| `addProjectApprover` | `ProjectDocumentApprover.addedBy` |
| `removeProjectApprover` | `ProjectDocumentApprover.removedBy` |
| `decideProjectVersion` | `ProjectDocumentDecision.decidedBy` |

- In `act-slots.ts`, give each slot `holder: "TRANSACTION"` and its `entryPoints`, and remove its `NOT_BUILT` entry from
  `act-wiring-scan.test.ts`. A decision is the officer's own act, not a signature: `signatureClass` is false (see §11, item 5).
- Add `src/app/projects/[id]/document-actions.ts` and `src/lib/project-docs/store.ts` to `CONTRACT_ACT_FILES` in
  `src/lib/contract/lock-order.test.ts`.
- **Staff staging.** `src/app/api/documents/route.ts` accepts `stagedFor=project-document`. For it, the route ignores any posted
  class and uses `projectDocumentClassId`, refusing while it is unset, with the setting's name.

### 5.3 Screens

- **The Project › "submissions" tab id.** `src/app/projects/[id]/submissions-tab.tsx` renders the new list first, as a `Card` with a
  `DataList`, from `src/lib/project-docs/register.ts`:
  - columns: title (a link), kind label, day of the latest version, state words, who it waits on;
  - filters: All, "Waiting on the contractor", `Waiting on ${org}`, Approved;
  - a "New document" drawer;
  - the legacy queue stays below it, unchanged, until step 6.
- **The document page:** `src/app/projects/[id]/documents/[documentId]/page.tsx`.
  - `PageHeader`: the title, a state `Badge`, and the facts: side, kind, who it waits on.
  - Each version as a `Card`: "Version n", the day, the uploader, the note, its files (name, size, "Not scanned", download as
    attachment), and its decisions with remarks.
  - An approvers `Card`: each named, with pending, approved or rejected on the current version, and add and remove drawers.
  - The actions: Upload a new version, Ask for it, Approve, Reject.
  - Actions the reader may not take are shown blocked, with the reason (`Blocked`, `ActGate`), never hidden without a word.
  - Reading follows `caseVisibility`: a HIDDEN case is a 404.
- **The approver picker** lists `organisationSideOn(...).filter(x => x.mayAct)`.
- **No count** beside a tab. No figure on the page.

### 5.4 Done when

- **db tests** (`src/lib/project-docs/store.db.test.ts`):
  - the founder's loop end to end through the store, with an audit row per act and the notices: the approver told at Version 1 and
    again at Version 2;
  - two concurrent approvals of the last pending approver give one APPROVED and no error row;
  - a staff member with no S.O. office and no delegation is refused every act, and reads the document;
  - a representative whose letter omits contractor communication is refused;
  - an approver who lost authority between being added and deciding is refused at the decision;
  - creating while the project class is unset is refused, naming the setting;
  - a 21-file version is refused;
  - a staged file of another person is refused;
  - an act before EXECUTED and on a CLOSED contract is refused, and on TERMINATED is allowed.
- `act-wiring-scan.test.ts`, `act-slots.test.ts` and `lock-order.test.ts` pass, extended.
- The text snapshot of the Project stage shows the new list above the legacy queue.

## 6. Step 5 — api-engineer, then frontend-engineer: the portal

**No schema change.** Portal routes follow `src/app/supplier/projects/submit/route.ts`: the portal guard first, then the store, then
`refusalReply`.

- **Staging:** `POST /supplier/projects/documents/upload`, at `src/app/supplier/projects/documents/upload/route.ts`. Multipart, one
  file, form fields `contractId` and `file`. The order, before the body is read:
  1. `supplierUploadPost(request, "projects")`;
  2. `uploadLimiter`;
  3. the contract is held (`supplierHoldsContract`, else 404);
  4. the class is set;
  5. the stated length is held to the cap.
  Then `storeUpload`, with `stagedFor: STAGED_FOR_PROJECT_DOCUMENT`, the class `projectDocumentClassId` and
  `recordedBySupplierAccountId`. Its `hooks.before` locks the `SupplierAccount` row and runs `windowFaults` on the counted rows.
  It returns `{ versionId }`. The precedent is `src/app/supplier/registration/upload/route.ts`.
- **Act routes**, JSON, each calling the step 4 store with a `SUPPLIER` actor:
  - `POST /supplier/projects/documents/create`: title, note, then either the staged version ids or a request note;
  - `POST /supplier/projects/documents/version`;
  - `POST /supplier/projects/documents/request`.
  In this step, the upload carries **no kind**: the kind picker arrives in step 6 (see §11, item 2).
- **The file route:** `GET /supplier/projects/documents/file/[attachmentId]`.
  - The attachment's version is reached through a contract the account holds, else 404. The answer is the same for another
    contractor's, a missing one and another organisation's.
  - `contractorSeesVersion` must pass, else 404.
  - `contractorMayDownload` reads the current `Document.classificationSnapshot` and `DocumentClass.classification`.
  - `logAccess` writes a `DocumentAccessEvent` with `actorSupplierAccountId`, for every download and every refusal.
  - The file is served as an attachment, and the page beside it says "Not scanned".
- **Screens:**
  - the portal project page's "submissions" tab id (`src/app/supplier/projects/[id]/page.tsx`, `panels.tsx`) shows the new list
    first, with the legacy list and send form below it until step 6;
  - the document page is `src/app/supplier/projects/[id]/documents/[documentId]/page.tsx`. It names the organisation, never an
    officer, shows no access log, and shows organisation remarks to nobody;
  - "Waiting for you" (`waitingForContractor`) appears on the portal home (`src/app/supplier/page.tsx`) and on the project page's
    overview, as a `DataList`. Wording is per design note 0005.
- **Data export (PW-19):**
  - move `ProjectDocument`, `ProjectDocumentVersion` and `ProjectDocumentRequest` from `OUT_MODELS` into `EXPORT_COLUMNS`. Each
    column is IN or OUT with a reason. `ProjectDocumentDecision.remarks` is IN only on CONTRACTOR documents, and `decidedBy` is
    `STAFF_IDENTITY`;
  - `src/lib/portal/data-export-store.ts` reads the documents of the supplier's accounts, their versions, their files' names and
    sizes, and the remarks the portal shows. The files download through the export's existing file route.
- **Done when:**
  - db test: another contractor's create, version, request and file get 404;
  - db test: a contractor cannot read an organisation version that waits for approval, nor its remarks;
  - db test: the window refuses the 61st file in an hour;
  - db test: a class raised to SULIT after upload is refused to the contractor at download and logged as REFUSED;
  - db test: every download writes a `DocumentAccessEvent` with the supplier actor;
  - db test: pinning another account's staged file is refused;
  - db test: `storeUpload` never runs under the contract lock (the route stages; the act pins);
  - `data-export.test.ts` passes, with the new columns classified;
  - `src/app/_auth/supplier-reach.test.ts` and `projects.db.test.ts` pass, unweakened.

## 7. Step 6 — domain-engineer, then api-engineer, then frontend-engineer: the six kinds move in

**No schema change.**

- **The kind picker.**
  - The portal create and version routes accept `kind`, set on the document at its first version (`uploadFaults`).
  - For STATUTORY_DECLARATION, the route asks the password (`confirmSupplierPassword`) before the transaction, and the store runs
    `contractorSigningFaultOf`.
  - Add `slot("ProjectDocumentVersion", "uploadedBySupplierAccount", "Signed by", { signatureClass: true })` to
    `SUPPLIER_ACT_SLOTS`, and write it with `attributeSupplierAct` for a declaration's version only, as `sendSubmission` does.
  - A declaration is never recorded from paper (AC-59): there is no staff path for it.
- **Taken up and Returned.**
  - Staff act `markProjectVersion` in `src/app/projects/[id]/document-actions.ts`, core `markVersion` in `store.ts`.
  - Slot: `ProjectDocumentDecision.decidedBy`, with the entry point added.
  - "Taken up" shows `takenUpWhere(kind)` as a `ButtonLink` built by `caseHref`.
  - FR-SUP-006 scrutiny and approval stay the `WorkProgramme` acts. Claims are certified on Payments.
- **The old path closes in this step:**
  - `src/app/supplier/projects/submit/route.ts` answers 410, saying "Send it from Documents";
  - `sendSubmission` is removed, or left with no caller and a scan pinning that;
  - the portal send form is removed;
  - `answerContractorSubmission` stays for unanswered legacy rows.
- **Legacy rows in the one list.** `register.ts` reads `ContractorSubmission` rows too, marked "Earlier record". They open on the
  existing review drawer, with their stored answer and fields, read-only once answered.
- **Readers of both sources:**
  - `reviewCounts` (`review-store.ts:58`) and the portal `overviewTab` counts;
  - `/projects?view=submissions` becomes "Documents waiting" (`case-page-words.ts:237`), listing both sources;
  - the new "Waiting for me" filter: I am a pending approver on the latest version, or I hold or act in the contract's S.O. office
    today and the row waits on the organisation with no pending approver.
- **The renames** (tab ids unchanged; `case-tabs.ts` untouched):
  - `CASE_TAB_WORDS.submissions` becomes "Documents" and `CASE_TAB_WORDS.documents` becomes "Certificates";
  - the portal tab label "Submissions" becomes "Documents" (`src/app/supplier/projects/[id]/page.tsx:43`).
- **The legacy service-level editor** (`ContractorSubmissionSetting`, `src/app/configuration/post-award/core.ts`) is taken off the
  screen. Nothing new reads it. The table and its rows stay (see §11, item 6).
- **Done when:**
  - `projects.db.test.ts` and `src/app/supplier/projects/handlers.test.ts` are rewritten to the new path, citing PW-11;
  - old `ActAttribution` rows on `ContractorSubmission` still resolve;
  - a delay notice is received with the server's day and time;
  - a declaration without the password is refused, and one with it writes the signed attribution;
  - a kind cannot be approved;
  - the submit route answers 410;
  - an unanswered legacy row can still be answered;
  - "Documents waiting" counts both sources;
  - the text snapshots of the staff and portal project pages show the renamed tabs, with no field lost.

## 8. Step 7 — data-modeler, then domain-engineer, then api-engineer, then frontend-engineer: team lists, then the kick-off meeting

**Changes the schema** (the kick-off tables). One new migration folder, sorted after the newest. Run `prisma generate` and
`db:roles`, then restart the dev server.

### 8.1 The team, read-only (no schema)

- `TeamPanel` (`src/app/projects/[id]/supervision-panels.tsx:183`) gains a `Card`, "Contractor's portal accounts": the awardee's
  active `SupplierAccount` rows.
- Names come through the existing SULIT read for contact details (`src/lib/auth/sulit-access.ts`, supplier scope). Without that
  right, the row reads "Portal account" with its status.
- It is read-only, and links to `supplierAccounts.manage` only where the reader holds it.
- The portal project overview (`src/app/supplier/projects/[id]/panels.tsx`) lists the S.O. and the representatives in force, with
  their offices, read-only (`organisationSideOn`, from step 2). It names people and offices only, with no contact details.
- **Done when:**
  - db test: a disabled account is not listed;
  - db test: a reader without the contact SULIT right sees no name;
  - db test: the portal list shows a representative whose letter was revoked yesterday as gone today.

### 8.2 The kick-off meeting (PW-18)

```prisma
/// The contract's one kick-off meeting (ADR 0042 D10, PW-18), from EXECUTED. Changed only before it is held; then frozen.
model KickOffMeeting {
  id             String       @id @default(cuid())
  organisationId String
  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Restrict)
  contractId     String       @unique
  contract       Contract     @relation(fields: [contractId], references: [id], onDelete: Restrict)

  /// When it meets: an instant, shown in the organisation's time zone.
  meetsAt    DateTime
  place      String @default("")
  /// Plain text, shown as text, never rendered as a link.
  onlineLink String @default("")
  agenda     String @db.Text

  scheduledByPersonId String
  scheduledBy         Person   @relation("KickOffScheduledBy", fields: [scheduledByPersonId], references: [id], onDelete: Restrict)
  scheduledAt         DateTime

  heldOn                 DateTime?
  heldRecordedByPersonId String?
  heldRecordedBy         Person?   @relation("KickOffHeldRecordedBy", fields: [heldRecordedByPersonId], references: [id], onDelete: Restrict)
  heldRecordedAt         DateTime?
  /// The minutes: a Project document of side ORGANISATION, with no approver, shared for information.
  minutesDocumentId      String?          @unique
  minutesDocument        ProjectDocument? @relation("KickOffMinutes", fields: [minutesDocumentId], references: [id], onDelete: Restrict)

  attendance KickOffAttendance[]
}

/// Who attended (PW-18): ticked from either side, or another name. Written once, with the held record.
model KickOffAttendance {
  id                String         @id @default(cuid())
  organisationId    String
  organisation      Organisation   @relation(fields: [organisationId], references: [id], onDelete: Restrict)
  meetingId         String
  meeting           KickOffMeeting @relation(fields: [meetingId], references: [id], onDelete: Restrict)
  /// Null for another name, someone on neither side's list.
  side              ProjectSide?
  personId          String?
  person            Person?          @relation("KickOffAttendee", fields: [personId], references: [id], onDelete: Restrict)
  supplierAccountId String?
  supplierAccount   SupplierAccount? @relation("KickOffAttendeeAccount", fields: [supplierAccountId], references: [id], onDelete: Restrict)
  name              String @default("")

  @@index([meetingId])
}
// Back-relations: Organisation.kickOffMeetings, Organisation.kickOffAttendance, Contract.kickOffMeeting, ProjectDocument.kickOffMinutesOf
//   (KickOffMeeting? @relation("KickOffMinutes")), Person (KickOffScheduledBy, KickOffHeldRecordedBy, KickOffAttendee),
//   SupplierAccount (KickOffAttendeeAccount).
```

- **SQL:**
  - `KickOffMeeting`:
    - CHECK `length(btrim("place")) > 0 OR length(btrim("onlineLink")) > 0`;
    - CHECK that `heldOn`, `heldRecordedByPersonId`, `heldRecordedAt` and `minutesDocumentId` are all null or all set;
    - trigger: DELETE refused; once `heldOn` is set, no column changes. While it is null, only `meetsAt`, `place`, `onlineLink`
      and `agenda` change, or the four held columns are set together.
  - `KickOffAttendance`:
    - CHECK `num_nonnulls("personId", "supplierAccountId") <= 1`;
    - CHECK `"personId" IS NULL OR "side" = 'ORGANISATION'`;
    - CHECK `"supplierAccountId" IS NULL OR "side" = 'CONTRACTOR'`;
    - CHECK `("personId" IS NULL AND "supplierAccountId" IS NULL) = ("side" IS NULL)`;
    - CHECK that a row with no person and no account has a non-blank `name`;
    - trigger: UPDATE and DELETE refused.
  - Add `KickOffAttendance` to `APPEND_ONLY_TABLES`.
- **Slots:** `KickOffMeeting.scheduledBy` and `KickOffMeeting.heldRecordedBy` ("Recorded by", `holder: "TRANSACTION"`).
  `KickOffAttendance.person` goes in `NOT_AN_ACT` (the attendee, not an actor). `KickOffAttendance` and `KickOffMeeting` are
  classified in `data-export-fields.ts`: attendance by the supplier's accounts is IN.
- **Pure** (`src/lib/project-docs/kick-off.ts`):
  ```ts
  export type KickOffFault = "NO_AUTHORITY" | "ALREADY_SCHEDULED" | "HELD" | "NOT_SCHEDULED" | "WHEN_REQUIRED" | "PLACE_OR_LINK_REQUIRED" | "AGENDA_REQUIRED" | "TOO_LONG" | "NO_MINUTES" | "NO_ATTENDANCE" | "HELD_IN_FUTURE";
  export function scheduleFaults(i: { authorityToday: boolean; exists: boolean; meetsAt: Date | null; place: string; onlineLink: string; agenda: string }): Finding<KickOffFault>[];
  export function changeFaults(i: { authorityToday: boolean; held: boolean; meetsAt: Date | null; place: string; onlineLink: string; agenda: string }): Finding<KickOffFault>[];
  export function heldFaults(i: { authorityToday: boolean; scheduled: boolean; held: boolean; heldOn: string | null; today: string; attendees: number; minutesFiles: number }): Finding<KickOffFault>[];
  // No briefing function here: the card calls briefingMissing(status, exists) from src/lib/contract/sign.ts:170 directly, never restating it.
  ```
- **Acts** in `src/app/projects/[id]/kick-off-actions.ts`, added to `CONTRACT_ACT_FILES`:
  - `scheduleKickOff`;
  - `changeKickOff`;
  - `recordKickOffHeld`. It creates the minutes document through `createDocument` (side ORGANISATION, no approver, title "Kick-off
    meeting minutes") from staged files, in the same transaction, then sets the held columns and writes the attendance rows.
  Each act runs `PROJECT_WORKSPACE`, the PW-5 check and the contract lock, then `SELECT ... FROM "KickOffMeeting" FOR UPDATE`.
- **Screen:**
  - a "Kick-off meeting" `Card` on the Project › Overview tab: not scheduled, scheduled (when, where, agenda), or held (attendance,
    minutes link);
  - while `briefingMissing(status, exists)` is true, a `ButtonLink` to the existing briefing drawer (`recordBriefing`,
    `editors.tsx:362`);
  - the portal overview shows the same card read-only, with the minutes downloadable through the step 5 file route.
- **Done when:**
  - a second meeting is refused;
  - scheduling before EXECUTED is refused;
  - a change after held is refused, by both the pure function and the trigger;
  - held needs attendance and minutes;
  - the minutes are visible to the contractor at once;
  - the briefing is never written by the meeting, and `briefingMissing` is unchanged (`sign.test.ts` passes untouched);
  - a person without PW-5 authority is refused every kick-off act.

## 9. Step 8 — close-out (data-modeler for the demo data; test-engineer; code-reviewer and security-auditor; the step's builders for the fix round; ui-guidelines-reviewer)

1. **Demo data** (data-modeler), through `npm run demo:load` only. A new `prisma/demo-project-documents.ts` is called from `prisma/demo.ts load`.
   It sets `projectDocumentClassId` on the demo organisation's store policy, and builds the founder's loop on the demo contract
   (`demo-my-projects.ts`'s contract), plus one delay notice taken up, one organisation draft being prepared, and one held kick-off.
   Nothing is seeded outside `demo:load`.
2. **test-engineer:** the gaps in the done-when lists, and the demo slice below as a db test.
3. **code-reviewer and security-auditor**, in parallel. The security walk:
   - another contractor never reaches a document or a file;
   - a contractor never reads an organisation remark or a draft;
   - a SULIT class never reaches a contractor;
   - staged files cannot be pinned across actors;
   - the window bound holds under parallel uploads.
4. **A fix round.**
5. **Text snapshots** (`scripts/text-snapshot.mjs`) of the staff Project stage, the document page, `/projects` and the portal project
   pages, before and after, diffed: no field, warning or provenance tag lost.
6. **The ui-guidelines-reviewer** over the same screens and their siblings.
7. **The log entry.**

**The demo slice: the founder's loop**, on a fresh scratch database after `demo:load`, signed in as the demo S.O. and the demo
contractor account:
1. The S.O. opens the contract's Documents tab, creates "Drainage layout", asks the contractor for it, and adds the demo engineer
   (a representative with contractor communication) as approver.
2. The contractor sees it under "Waiting for you" on the portal home, and uploads Version 1 (two PDFs).
3. The engineer has a "Document to approve" notice, and the S.O. a "Document from the contractor" notice.
4. The engineer rejects it, with the remarks "Invert levels missing at MH3".
5. The contractor sees "Rejected" with the remarks, and the organisation named, not the engineer. It uploads Version 2.
6. The engineer approves it. The register shows "Approved", and the contractor sees "Approved".
7. Every download in the walk has its `DocumentAccessEvent`. No screen shows a number, a count or a chart for the document.

## 10. Step 9 — security-auditor (C12), then test-engineer (the C2 and C4 snapshots): wave C verification (PW-21)

Wave C's code is built (`f959e680`, `b58c88f7`, `41d9f88b`, `dc49f39b`, `529df279`, `1d404453`, `503caea2`). What remains is
verification only:
- the C12 security re-audit of the review fix round and C13 (security-auditor);
- the C2 and C4 text snapshots, old page against new over one demo database;
- the browser checks. They are recorded as blocked until the `perolehan_vg_app` password, or a scoped reset, is available (backlog,
  "Waves G and C browser close-out").

Wave V stays out (PW-21).

## 11. Points the rulings left open, ruled here to a default (none blocks a step)

1. **When the workspace is open.** `PROJECT_WORKSPACE` is allowed from EXECUTED through PRACTICALLY_COMPLETE, MAKING_GOOD_COMPLETE,
   FINAL_CERTIFICATE_ISSUED and TERMINATED, and refused before execution, when cancelled and when closed. A terminated contract
   still exchanges documents, as its final account does; a closed one is a record.
2. **The kind picker lands in step 6, not step 5.** PW-11 says the old send path closes in the same step that opens the new upload,
   while the build order lists the declaration step-up under step 5. Step 5's upload therefore takes no kind. The kind picker, the
   step-up and closing `sendSubmission` land together in step 6, so there is never a time with two channels for a delay notice, or
   with none.
3. **Taken up with no screen to link to.** No staff screen records a delay notice (`recordDelayNotice` has no drawer), defects
   rectified, or a declaration. For those kinds, "Taken up" shows no link (`takenUpWhere` returns null). The link is added when the
   Time screen exists.
4. **Removing an approver** that would leave none, or would leave only approvals, is refused. Replace an approver by adding first.
5. **An approval is not a signature-class act.** It is the officer's own act in the system, attributed through its slot, with no
   password step-up. FR-SUP-006's programme approval keeps its signed `WorkProgramme.decidedBy` act. If the customer wants the
   password at every approval, it is one flag on the slot.
6. **The legacy service-level editor** is taken off the Configuration screen in step 6. Nothing new reads it, and a setting that
   drives nothing would overstate itself. The table and its rows stay.
7. **An organisation document waiting for approval is listed to the contractor**, by its title, with "Being prepared by
   {organisation}" (PW-8, as written). Its versions and remarks are not shown.
8. **Kick-off minutes are required to record the meeting held.** One act, no later "attach the minutes" act.
9. **A request goes only to the document's side, and only while the document is Shared.** At other times it either already waits on
   that side or is final.
10. **Step 1's two migration folders** are a technical split forced by BD-613-112, not a second schema step.

Each is listed in the step 0 report to the product owner, who rules on it or adopts it before the step that builds it. Item 2
departs from the rulings' build order as written: it moves the declaration's password step-up from step 5 to step 6.

## 12. Risks

- **Replacing the attachment CHECKs whole** can drop an owner. The step 1 db test inserts one attachment per existing owner, and
  `owner-check.test.ts` holds schema, CHECK and lib together.
- **Two records of contractor submissions** until the legacy rows stop mattering. Every counter reads both, and a scan lists the
  readers of `contractorSubmission` (`review-store.ts`, `workspace-store.ts`, `/projects`).
- **Files shared with the registration builder.** `src/app/supplier/page.tsx`, `src/lib/auth/db-role.ts` and the portal labels are
  being edited now. Steps 1 and 5 start only after registration group 5 is committed.
- **Configuration files** (`src/app/configuration/documents/**`) are shared. Step 3 runs only when nobody else holds them.
- **Postgres growth.** Bytes are never deleted. The window bound and the customer's `maxBytes` are the only brakes until object
  storage arrives behind the `BlobStore` façade.
