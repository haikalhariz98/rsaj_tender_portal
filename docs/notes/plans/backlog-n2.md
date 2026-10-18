# N2: a supplier exports its own data (PDPA right of access): build plan

**Status (2026-10-19): ready to build.** Written by the solution architect for backlog item N2 (backlog row "A supplier exports its own
data", the go-live condition from the product owner's ruling on log line 1875(8), decisions log line 1944). This plan declares contracts.
The signatures in section 3 are what the builders write, not code that exists. Nothing here needs the founder, CPD, RSAJ or an outside
service. The public-copy database role stays FOUNDER-RESERVED (log line 1937). This item adds no grant and does not depend on one.

**No ADR.** The change is one additive audit table and a classification list. Both are reversible, and `AuditExport` (FR-APR-015) is the
precedent for "one row per export, with the file's digest". The judgement calls are decisions-log lines (section 5), not a record.

## 1. What exists today

- **Who is signed in.** `requireSupplier()` / `supplierGet()` in `src/app/_auth/supplier.ts` give a `SupplierActor` (`src/lib/auth/types.ts`)
  whose `supplierId` is the session's only. `src/app/_auth/supplier-reach.test.ts` holds every portal page, handler and loader to that.
  `toSupplierAuditActor(actor)` is the audit actor for a supplier's own act.
- **Public paths.** `src/lib/auth/routes.ts` (`SUPPLIER_AUTH_PAGES`, `SUPPLIER_REGISTRATION_GETS`, and others) and `PUBLIC_PAGES` in
  `src/lib/portal/surface.ts`. A portal path that is not listed is not served on the public copy.
- **What the account reads today (the IN set is exactly this; no new right):**
  - Company identity and address: `loadCompanySummary` (`src/lib/portal/registration/summary-store.ts`). It renders list labels, not codes.
  - Contacts: `loadContactsSummary` (same file), read SULIT as the step-5 summary reads them.
  - Declarations: `loadDeclarationsSummary` (same file).
  - Bank details: `loadBankTab` (`src/lib/portal/company/company-store.ts`). It shows the in-force, waiting and not-in-order versions only,
    and writes a `SulitAccessEvent` per version through `writeSupplierSulitEvent(..., OWN_RECORD)` (`src/lib/auth/creditor-access-store.ts`).
  - Documents and their grades or codes: `loadDocumentsTab` and `companyDocument` (`company-store.ts`), shown as
    `"<code> — <label>"`. The live files come from `DocumentAttachment` → `DocumentVersion`. The tokened download link is
    `SUPPLIER_REGISTRATION_GETS.file?id=<versionId>&t=<token>` (`src/app/supplier/company/panels.tsx:426`).
    `verificationNote` is shown only when the state is NOT_IN_ORDER (`panels.tsx:439`).
  - Standing: `standingOf` (`src/lib/suppliers/standing-repo.ts`) and `standingView` (`src/lib/portal/company/standing-view.ts`). Event facts
    come from `standingEventFacts`, which already blanks the reason of a cancellation.
  - Applications and outcomes, with the office's remarks and the resubmission items: `loadRegistrationStatus`
    (`src/lib/portal/registration-status-repo.ts`), with words from `src/lib/portal/registration-status.ts`.
  - Purchases, payment attempts and downloads: `src/lib/portal/bids/purchase-read.ts`, `list-store.ts` (`loadMyExercises`) and the bid
    workspace. Exercise names reach a supplier only through these, under the restricted-exercise visibility (`src/lib/portal/bids/visibility.ts`).
  - Online bid receipts: `loadBidScreen` (`src/lib/bids/online/my-bids-store.ts`) and `submissionViews` (`my-bids.ts`). The card is
    `src/app/supplier/bids/[id]/receipt-card.tsx`, using `RECEIPT_WORDS`.
- **The supplier's History (staff side).** `supplierHistory` (`src/lib/suppliers/repo.ts:354`) finds a row by `entityId` in its id list, or
  by `entityLabel` starting with `"<supplier reference> ·"`. Entity names and labels are in `SUPPLIER_ENTITY` and `SUPPLIER_ENTITY_LABEL`
  (`src/lib/suppliers/audit-view.ts`). Audit writers are `writeAudit` and `auditedCreate` (`src/lib/audit/record.ts`). `AuditAction` is
  CREATE / UPDATE / DELETE only.
- **Scans a new table or route must satisfy.** `src/lib/auth/supplier-act-slots.test.ts` (every `SupplierAccount` relation is a slot or
  is accounted for); `src/lib/auth/act-wiring-scan.test.ts`; `supplier-reach.test.ts`; `scripts/check-ui.mjs`.
- **Pin pattern.** `src/lib/auth/slot-columns.test.ts` reads `prisma/schema.prisma` as text.
- **Words.** `Words { en; ms }` / `w()` (`src/lib/contract/labels.ts`); `Bi` (`src/components/ui/bilingual.tsx`) is the portal's way to
  render both. `PrintButton` exists only in `src/app/supplier/bids/[id]/print-button.tsx`.
- **Latest migration:** `20261111000000_staff_ui_language`. **Latest ADR:** 0040.

## 2. The target

1. **`/supplier/account/data`**: a printable page for any signed-in active account of the supplier, built from the design system
   (`PageHeader`, `Card`, `KeyValues`, `DataList`, `Callout`, `Bi`), with a Print button and a "Download (JSON)" button.
2. **`/supplier/account/data/file`**: a GET that returns one JSON file of the same content, built by the same pure function.
3. **One pure selector** in `src/lib/suppliers/data-export.ts` with a closed allow-list. Every scalar column of every classified model is
   IN or OUT with a reason. Every model with a field typed `Supplier`, `SupplierAccount` or `SupplierContact` is classified or listed
   OUT-as-a-model. Two pins fail on a new column or on a new supplier-linked table that nobody has classified.
4. **Each export is audited on the supplier.** It writes one `SupplierDataExport` row with its audit row (CREATE), labelled
   `"<reference> · Data export"` so it lands on the supplier's History. Its `changes` carry only the form, the section counts and the
   digest, never an exported value. The bank and contact reads also write their `SulitAccessEvent`s, as today.
5. **What is left out is said.** The page and the file both say that the office's internal notes are not included, and how to ask the
   office for them. The wording reuses the existing office wording ("the procurement office", as `LastSignIn` says it) or a configured
   contact. It never uses a literal address.
6. **Standing does not block it.** Ruling 1875(3) lets a barred supplier sign in to read. The export is a read, so it is not behind the
   standing act gate.

## 3. Contracts

```ts
// src/lib/suppliers/data-export-fields.ts — the closed allow-list
export type OutReason = "SECRET" | "STAFF_ONLY" | "STAFF_IDENTITY" | "SEALED" | "INTERNAL_KEY" | "TECHNICAL" | "NOT_SHOWN_TODAY";
export type Classified = "IN" | { out: OutReason };
export const EXPORT_COLUMNS: {
  Supplier; SupplierContact; SupplierAccount; SupplierApplication; ApplicationDecision; ResubmissionItem; SupplierDocument;
  SupplierDocumentValue; CreditorProfile; RegistrationDeclaration; StandingEvent; DocumentPurchase; PaymentAttempt; PurchaseDownload; OnlineBid;
} /* each: Record<column, Classified>, satisfies-checked */;
export const OUT_MODELS: Readonly<Record<string, OutReason>>; // every other model with a field typed Supplier, SupplierAccount or SupplierContact
//   (whatever the column is named: PortalApplication.acceptedSupplierId, SulitAccessEvent.actorSupplierAccountId, ...), e.g.
//   StandingRequest STAFF_ONLY, OnlineBidFile/OnlineBidPart SEALED, PortalApplication NOT_SHOWN_TODAY,
//   SupplierSession/SignInEvent/OneTimeCode SECRET, RegistrationDraft NOT_SHOWN_TODAY (wizard state), SulitAccessEvent/DocumentAccessEvent
//   TECHNICAL, SiteDiaryEntry/ContractorSubmission NOT_SHOWN_TODAY (contracts, parked), ...
export function inColumns<M extends keyof typeof EXPORT_COLUMNS>(model: M): Record<string, true>; // a Prisma `select` from the IN set
```

The OUT columns that matter (the builder classifies the rest, and the pin forces every one):
`Supplier.registrationNoKey, erpVendorCode, erpSyncedAt`; `SupplierAccount.passwordHash, loginKey, failedAttempts, lockedUntil,
mustChangePassword, resetNoticePending, disabledReason`; `SupplierDocument.note` (verificationNote is IN only when NOT_IN_ORDER);
`StandingEvent.note, checklist, flaggedDocumentIds, withdrawnReason` and every `*PersonId`; `ApplicationDecision.policySnapshot`;
`CreditorProfile.verificationNote` unless NOT_IN_ORDER; `DocumentPurchase.checks, receiptRecordedByPersonId`;
`OnlineBid.sealedManifest, manifestDek, sealedDeclaration, declarationDek, manifestCipherSha256, declarationCipherSha256, keyId,
insertedXact, statusXact`. `SupplierAccount.loginName` is IN only for a contact that is open (ruling 1875(7)).

```ts
// src/lib/suppliers/data-export.ts — pure
export const EXPORT_FORMAT = "perolehan-supplier-export";
export const EXPORT_VERSION = 1;
export interface SupplierExportSource { /* rows exactly as data-export-store.ts reads them with inColumns(), plus derived
  readings already computed by the existing pure functions (standingView, submissionViews, bankState, list labels) */ }
export interface ExportFile { name: string; type: string; size: string; lodgedOn: string; versionId: string; path: string } // path has NO token
export interface ExportSection { key: ExportSectionKey; title: Words; rows: ExportRow[] }       // key is a stable English JSON key, never shown
export interface ExportRow { label: Words; value: string | Words | null; files?: ExportFile[] }
export type ExportSectionKey = "company" | "contacts" | "accounts" | "declarations" | "bank" | "documents" | "standing"
  | "standingChanges" | "applications" | "purchases" | "bidReceipts";
export interface SupplierExport {
  format: typeof EXPORT_FORMAT; version: typeof EXPORT_VERSION; generatedAt: string; // organisation's date-time words
  organisation: string; supplier: { reference: string; name: string };
  sections: ExportSection[];
  leftOut: Words[]; // internal notes, and how to ask the office
}
export function buildSupplierExport(src: SupplierExportSource, ctx: { generatedAt: Date; timeZone: string | null; officeName: string }): SupplierExport;
export function exportJson(e: SupplierExport): string;              // stable key order, LF, trailing newline
export function exportFileName(e: SupplierExport, day: string): string; // "supplier-data-<reference>-<YYYY-MM-DD>.json"
export function exportAuditChanges(e: SupplierExport, form: "FILE" | "PAGE", sha256: string | null): FieldChange[]; // counts and digest only
```

The JSON keys are stable English. Dates in the file are ISO (`YYYY-MM-DD` for a day, an ISO instant for a moment), and the page formats
them through `src/lib/format.ts` (`formatDate`, `formatOrgDateTime`). Enumerated values are labels as `{ en, ms }`, never configuration codes: an entity type, state, bank or account
type is its list label. Money (`DocumentPurchase.amount`) is the `Decimal` as a string, formatted by `src/lib/format.ts`, never a float.

```prisma
// migration 20261112000000_supplier_data_export (additive)
enum SupplierExportForm { FILE PAGE }
model SupplierDataExport {
  id String @id @default(cuid())
  organisationId String;  organisation Organisation @relation(fields: [organisationId], references: [id], onDelete: Restrict)
  supplierId String;      supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  accountId String;       account SupplierAccount @relation("SupplierDataExportedBy", fields: [accountId], references: [id], onDelete: Restrict)
  sessionId String
  form SupplierExportForm
  sectionCounts Json      // { company: 1, contacts: 2, ... } and no values
  sha256 String?          // of the file's bytes, for FILE
  generatedAt DateTime @default(now())
  @@index([organisationId, supplierId, generatedAt])
}
```

```ts
// src/lib/portal/data-export-store.ts — reads keyed by the actor only
export async function exportSupplierData(actor: SupplierActor, form: "FILE" | "PAGE", now?: Date):
  Promise<{ export: SupplierExport; json: string; fileName: string; liveLinks: Map<string /*versionId*/, true> } | null>;
// One transaction: read with inColumns(), the SULIT events (contacts, bank versions) as today, buildSupplierExport,
// the SupplierDataExport row and its audit row via auditedCreate (entity SUPPLIER_ENTITY.dataExport, label "<reference> · Data export").

// src/lib/auth/routes.ts
export const SUPPLIER_DATA_EXPORT = { page: "/supplier/account/data", file: "/supplier/account/data/file" } as const;
```

## 4. Steps

**Step 1. The allow-list, the selector and the words** (domain-engineer)
- Write `src/lib/suppliers/data-export-fields.ts`, `src/lib/suppliers/data-export.ts` and `src/lib/suppliers/data-export-words.ts` per
  section 3.
- Add `dataExport: "SupplierDataExport"` to `SUPPLIER_ENTITY` in `src/lib/suppliers/audit-view.ts`, plus its `SUPPLIER_ENTITY_LABEL`
  entry (en/ms: "Data export" / "Eksport data") and `fieldLabel` words for the form, the counts and the digest.
- Append the section 5 lines to `docs/notes/decisions-log.md`.
- Tests: `data-export.test.ts`. The fixture rows carry a sentinel in every OUT column, and the test asserts that no sentinel appears in
  `exportJson` or in `exportAuditChanges`.
  - Pin (a): every scalar of each `EXPORT_COLUMNS` model, read from `prisma/schema.prisma` as text (the `slot-columns.test.ts` pattern),
    is classified, and nothing classified is missing from the schema.
  - Pin (b): every model with a field whose type is `Supplier`, `SupplierAccount` or `SupplierContact`, read from the schema text as
    `supplier-act-slots.test.ts` reads `SupplierAccount` relations, is in `EXPORT_COLUMNS` or `OUT_MODELS`. Nothing is listed that the
    schema lacks.
  - Other assertions: verificationNote only when NOT_IN_ORDER; loginName only for an open contact; no `ExportFile.path` contains `t=`;
    codes never appear as values; every `Words` in the new files has a non-empty `ms`; the `leftOut` notice is present.
- **Done when:** `npx vitest run src/lib/suppliers` passes, and deleting one entry from `EXPORT_COLUMNS` (or adding a scalar to `Supplier`
  in a scratch copy of the schema text) fails pin (a) or (b). `NODE_OPTIONS=--max-old-space-size=14000 npm run check` passes.

**Step 2. The table and the store** (data-modeler)
- Add the migration `20261112000000_supplier_data_export` (section 3) through `npx prisma migrate diff --from-config-datasource
  --to-schema prisma/schema.prisma --script`. Apply it to `perolehan_native_check`, then to `perolehan`, confirm the diff is empty, and run
  `npx prisma generate`.
- Account for the new `SupplierAccount` relation in `src/lib/auth/supplier-act-slots.test.ts`'s registry, and for the new audited entity
  in `act-wiring-scan.test.ts` if its scan requires it.
- Write `src/lib/portal/data-export-store.ts`. It reuses the existing readers in section 1 rather than restating them, and selects through
  `inColumns()`.
- Tests: `src/lib/portal/data-export.db.test.ts` on scratch seeds suppliers A and B with sentinels in all of B's rows and in A's OUT
  columns (`note`, a VERIFIED document's verificationNote, the standing note, `erpVendorCode`, `passwordHash`, `loginKey`, an
  `OnlineBid`'s sealed bytes). It asserts:
  - A's export contains none of them.
  - One `SupplierDataExport` row and one audit row are written per call, and the audit row appears in `supplierHistory` for A, not for B.
  - The SULIT events are written with `OWN_RECORD`.
  - A supplier that is suspended or blacklisted still gets its export.
- **Done when:** `npm run test:db` passes (except the known `holding-edit.db.test.ts` scratch failure), the migration diff is empty on both
  databases, and `npm run check` passes. **The dev server needs a restart after `prisma generate`.** Say so in the hand-off. Do not
  restart it yourself.

**Step 3. The file route** (api-engineer)
- Add `SUPPLIER_DATA_EXPORT` to `src/lib/auth/routes.ts` and both paths to `PUBLIC_PAGES` in `src/lib/portal/surface.ts`.
- Write `src/app/supplier/account/data/file/route.ts` (read `node_modules/next/dist/docs` for route handlers first). It calls
  `supplierGet(request, <new FormPurpose>)` first (register the purpose wherever `FormPurpose` values are listed, starting at
  `src/lib/auth/form-token.ts`), then `exportSupplierData(actor, "FILE")`, and answers `application/json; charset=utf-8`
  with `Content-Disposition: attachment; filename="<exportFileName>"` and `Cache-Control: no-store`. The digest is computed on the exact
  bytes sent.
- Tests: a handler test beside the route (pattern: `src/app/supplier/bids/handlers.test.ts`) covers: refused when not signed in; refused on
  a cross-site request; the body parses and its sha256 equals the stored row's. `supplier-reach.test.ts` passes unchanged in its rules.
- **Done when:** `npx vitest run src/app/supplier src/app/_auth src/lib/portal` passes, and `npm run check` passes.

**Step 4. The page, the link, and closing the row** (frontend-engineer)
- Move `PrintButton` to `src/components/ui/print-button.tsx` and update the bids import.
- Write `src/app/supplier/account/data/page.tsx`. It calls `requireSupplier()`, then `exportSupplierData(actor, "PAGE")`, and renders each
  section with `PageHeader`, `Card`, `KeyValues` and `DataList` through `Bi`, plus the `leftOut` `Callout`. A document's file opens through
  a fresh tokened `SUPPLIER_REGISTRATION_GETS.file` link, built with `issueFormToken` as `panels.tsx` does. The page has a Print button and
  a "Download (JSON)" `ButtonLink` to the file route with its token. Add print-only CSS through Tailwind `print:` utilities only.
- Link the page from `src/app/supplier/account/page.tsx` ("Your data" card) with `prefetch={false}`. Rendering the page writes an
  export audit row, and a prefetch must not record an export the supplier never opened. If `ButtonLink` (`src/components/ui/button.tsx`)
  does not pass `prefetch` through, extend it. The Download link takes `prefetch={false}` too.
- Move the backlog row in `docs/notes/backlog.md` to built, citing this plan.
- Tests: a jsdom test (`.ts`, `createElement`) checks that every section title and the left-out notice render in both languages, and that
  no configuration code is in the text. Compare the page with `/supplier/account` and `/supplier/company` at desktop width: header, card
  spacing and list styling.
- **Done when:** both links are `prefetch={false}`; `npm run check`, `npx vitest run src/app/supplier src/components/ui` and
  `npm run test:db` pass; and the full Linux suite
  (`powershell -NoProfile -File scripts/test-linux.ps1`) passes before this last commit.

## 5. Judgement calls (step 1 appends each as a "- 2026-10-19 · ..." line in the decisions log)

1. The office's internal notes (`SupplierDocument.note`, `StandingEvent.note`, `StandingRequest`, the standing checklist, withdrawn
   reasons) are left out, and the export says so and how to ask the office. **Question for the founder:** does the customer's PDPA
   reading require them on request?
2. `PortalApplication` (the intake copy, whose words were carried onto the supplier record) is OUT as not shown today. Product-owner
   question.
3. Bank details are the bank tab's set only (in force, waiting, not in order). Superseded versions would be a wider read than today.
   Product-owner question.
4. Paper bid envelopes (`BidEnvelope` without an `OnlineBid`) are not on the portal today, so they are OUT. Bid receipts are the online
   submissions' receipts as the receipt card shows them. Product-owner question.
5. `erpVendorCode` / `erpSyncedAt` are OUT as an internal integration key. Product-owner question.
6. The JSON carries list labels, not configuration codes (rule 5), and ISO dates. The document links in the file carry no form token, because a token in
   a saved file would outlive its purpose. Only the printable page carries live links.
7. Opening the printable page and downloading the file are each an export and each audited (`PAGE` / `FILE`).
8. There is no standing gate on the export (ruling 1875(3)).
9. There is no ADR, for the reason given at the top of this plan.
