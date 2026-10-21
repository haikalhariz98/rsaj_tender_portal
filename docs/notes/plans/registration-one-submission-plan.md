# Supplier registration as one submission: build plan

Written 2026-10-21 by the solution architect from the product owner's rulings REG-1 to REG-6 of the same day (the scratchpad record
`reg-rulings-2026-10-21.md`, to be copied into the decisions log by step 1). The design record is
[ADR 0041](../architecture/0041-one-submission-supplier-registration.md). Commit `c2e2a8bc` (portal top strip, stepper sub-lines,
inert signed-in nav) is done and is not repeated here.

Four builder steps, **strictly one after another** (one builder at a time, laptop memory). Each step is committable on its own with
its gates green.

---

## 0. Decisions taken where the rulings leave a point open

Each is recorded in ADR 0041 and goes into the decisions log at step 1.

| # | Point left open | Decision | Why |
| --- | --- | --- | --- |
| O-1 | When the Supplier row is born | At the **last approval** of the route, in that step's transaction (ADR 0041 D6). | REG-1 forbids a submission creating one. A row created before the decision would hold the unique number for a rejected applicant, so "reapplying is a fresh application" (REG-3) would hit the register clash. |
| O-2 | What the route hangs on | The online application itself: `ApprovalInstance.portalApplicationId` (D5). | No supplier exists to hang a `SupplierApplication` on. |
| O-3 | "Reject through the route" | **Approve** is the route's last step. **Reject** is the officer's recorded outcome with verbatim reasons, as for paper and wizard applications today. A refused step returns the matter to the officer (D7). | One decision model across all channels. FR-VND-007 is unchanged. |
| O-4 | Where the agreements live | `RegistrationDeclaration` rows (GIRO, false declaration, TERMS). The notice is frozen and hashed on the TERMS row (D4). | One tick covers both texts, and the "signed text cannot be edited" check (`_count.signed`) keeps working. |
| O-5 | How "applicant, not signed in" is marked | Nullable `…PortalApplicationId` columns, plus `ActorKind.APPLICANT` (D3). | `SYSTEM` would say a machine acted. |
| O-6 | Bank details before approval | A separate `PortalApplicationCreditor`, promoted to `CreditorProfile` v1 at approval. | `CreditorProfile.supplierId` is NOT NULL and read in many places. Making it nullable would ripple through every reader. |
| O-7 | Honeypot order | Judged **immediately after the parse**, before any rule or write. | It is a body field and cannot be read before the body. |
| O-8 | `SupplierPolicy.onlineDeclarationReplacesPaper` | The register opens only when it is **true**. While null or false, `whatIsMissing` names it. | `approveFaults` blocks every PORTAL approval otherwise. An online applicant has no paper declaration to record, so the register would take applications that can never be approved. Founder point F-1. |
| O-9 | "Remove the 'result shows on your account page' text in `state.ts` for this path" | The new path never renders `wizardClosedWords`. Its success screen shows only the reference and `verificationNoticeEn`. The `SENT` words in `state.ts` stay for the legacy signed-in path, where the account page does show the result (`registration-status.ts`). | The ruling scopes the removal to this path, and the line is true on the legacy one. |
| O-10 | The text allowance in the body ceiling | A technical constant computed from `LIMITS` and `APPLICATION_LIMITS` (every text at its bound, plus multipart overhead). It is not policy. | Same footing as `MULTIPART_ALLOWANCE_BYTES`. |

Unchanged from the rulings:
- five steps;
- the terms card inside step 5;
- GIRO on step 4;
- the false declaration's own tick;
- no password at Submit on the public path;
- the activation code issued later, as today.

---

## 1. Data model (all in builder step 1)

### 1.0 Before anything is applied (REG-5)

Log a **read-only** count on the `perolehan` database:
- Use `psql` in the Postgres container started by `npm run setup`, inside `BEGIN READ ONLY; … ROLLBACK;`.
- Paste the output into the step's decisions-log entry. Step 4 repeats the same counts.

```sql
SELECT count(*) AS received_portal_applications FROM "PortalApplication" WHERE status = 'RECEIVED';
SELECT count(*) AS unsent_drafts FROM "RegistrationDraft" WHERE "submittedAt" IS NULL;
SELECT count(*) AS undecided_supplier_applications FROM "SupplierApplication"
  WHERE status IN ('RECEIVED','RESUBMISSION_REQUESTED') AND "lapsedRecordedAt" IS NULL;
```

Rules for the data:
- Nothing is deleted, cancelled or backfilled.
- No configuration row is written directly.
- Each migration statement below either adds something, or widens a CHECK or NOT NULL so that more is allowed. All existing rows
  already satisfy every widened constraint.

### 1.1 Migrations

Each enum value goes in its own migration, as the codebase does. The latest existing migration is
`20261116000000_portal_page_settings`.

| Migration | Content |
| --- | --- |
| `20261117000000_enum_declaration_kind_terms` | `ALTER TYPE "DeclarationKind" ADD VALUE 'TERMS_AND_CONDITIONS';` |
| `20261117000100_enum_portal_status_approved` | `PortalApplicationStatus` + `APPROVED` |
| `20261117000200_enum_portal_status_rejected` | `PortalApplicationStatus` + `REJECTED` |
| `20261117000300_enum_purpose_portal_document` | `AttachmentPurpose` + `PORTAL_APPLICATION_DOCUMENT` |
| `20261117000400_enum_purpose_portal_statement` | `AttachmentPurpose` + `PORTAL_APPLICATION_BANK_STATEMENT` |
| `20261117000500_enum_actor_kind_applicant` | `ActorKind` + `APPLICANT` |
| `20261117001000_one_submission_registration` | Everything in 1.2 to 1.5 |

### 1.2 New tables

Every new table has `organisationId` and a foreign key `ON DELETE RESTRICT`.

```prisma
enum PortalApplicationForm {
  STEP_ONE   /// the Phase 4a form (rows before this change are NULL and read as STEP_ONE)
  WHOLE      /// the one-submission form
}

/// A certificate as the applicant sent it. Frozen on insert, except for the officer's verification (trigger PA010).
model PortalApplicationDocument {
  id                  String   @id @default(cuid())
  organisationId      String
  portalApplicationId String
  typeId              String                     /// SupplierDocumentType
  typeLabelSnapshot   String
  /// The browser's row key ("new:…"), so a refusal and the staff page can point at the row as the applicant saw it.
  clientKey           String
  title               String   @default("")
  reference           String   @default("")
  issuingAuthority    String   @default("")
  expiresOn           DateTime?
  notApplicable       Boolean  @default(false)
  ratePercent         Decimal? @db.Decimal(5, 2)
  verification        VerificationState @default(NOT_CHECKED)
  verifiedByPersonId  String?
  verifiedOn          DateTime?
  verifiedAt          DateTime?
  verificationNote    String   @default("")
  createdAt           DateTime @default(now())
  values      PortalApplicationValue[]
  attachments DocumentAttachment[]
  @@unique([portalApplicationId, clientKey])
  @@index([portalApplicationId])
}

model PortalApplicationValue {          /// insert-only (trigger PA011)
  id                          String @id @default(cuid())
  organisationId              String
  portalApplicationDocumentId String
  registrationValueId         String
  kind                        RegistrationValueKind
  codeSnapshot                String
  labelSnapshot               String
  @@unique([portalApplicationDocumentId, registrationValueId])
}

/// The bank and beneficiary details as sent. SULIT from receipt (scope `creditorProfile`).
/// Content frozen. The trigger (PA012) allows only the verification columns, and one erasure (every content field to "" and `erasedAt` set).
model PortalApplicationCreditor {
  id                  String @id @default(cuid())
  organisationId      String
  portalApplicationId String @unique
  // the 13 CreditorInput fields, each String @default(""), named exactly as on CreditorProfile
  verification        VerificationState @default(NOT_CHECKED)
  verifiedByPersonId  String?
  verifiedOn          DateTime?
  verifiedAt          DateTime?
  verificationNote    String   @default("")
  erasedAt            DateTime?
  createdAt           DateTime @default(now())
  attachments DocumentAttachment[]
}

/// A spent register form token. Insert, then one update that sets the application (trigger PA013). Never deleted.
model PortalFormToken {
  id                  String   @id @default(cuid())
  organisationId      String
  tokenSha256         String   @unique @db.Char(64)
  issuedAt            DateTime
  consumedAt          DateTime
  portalApplicationId String?  @unique
}
```

### 1.3 New nullable columns on existing tables

| Table | Column(s) | Constraint change |
| --- | --- | --- |
| `PortalApplication` | `form PortalApplicationForm?`, `sentByPersonId String?` (FK Person; the route's requester), `decisionRemarks String?` (reasons as written, on REJECTED) | none |
| `ApprovalInstance` | `portalApplicationId String?` (FK, index) | `ApprovalInstance_supplier_matter` re-added as `num_nonnulls("supplierApplicationId","standingRequestId","specialPermissionId","portalApplicationId") = CASE WHEN "matterKind"='SUPPLIER' THEN 1 ELSE 0 END` |
| `DocumentAttachment` | `portalApplicationDocumentId String?`, `portalApplicationCreditorId String?` (FKs) | `DocumentAttachment_one_owner` and `DocumentAttachment_purpose_owner` re-added with the two owners and two purposes. Copy the latest definition from `20261115000100_published_schedule_owner` and add to it. |
| `DocumentVersion` | `recordedByPortalApplicationId String?` (FK) | `DocumentVersion_one_recorder`: `num_nonnulls(person, account, portalApplication) = 1` |
| `SupplierDocument` | `recordedByPortalApplicationId String?` (FK) | `SupplierDocument_one_recorder`: the same, over three columns |
| `CreditorProfile` | `enteredByPortalApplicationId String?` (FK). `enteredBySupplierAccountId` **DROP NOT NULL** | new `CreditorProfile_one_enterer`: `num_nonnulls(enteredBySupplierAccountId, enteredByPortalApplicationId) = 1` |
| `RegistrationDeclaration` | `portalApplicationId String?` (FK), `noticeSha256 Char(64)?`, `noticeFrozenEn String?`. `signedBySupplierAccountId` **DROP NOT NULL** | `RegistrationDeclaration_has_subject` widened to add `portalApplicationId`. New `RegistrationDeclaration_signer`: `"signedBySupplierAccountId" IS NOT NULL OR "portalApplicationId" IS NOT NULL`. New `RegistrationDeclaration_notice_on_terms`: `("kind"='TERMS_AND_CONDITIONS') = ("noticeSha256" IS NOT NULL AND "noticeFrozenEn" IS NOT NULL)`. New `@@unique([portalApplicationId, kind])` |
| `SupplierApplication` | `portalApplicationId String? @unique` (FK; the online application it was approved from) | none (`recorder_portal_only` already admits a null recorder on PORTAL) |
| `AuditEntry` | `actorPortalApplicationId String?` (no FK, like the supplier account) | `AuditEntry_actor_matches_kind` re-added with the `APPLICANT` branch: exactly that column set |
| `SupplierPolicy` | **none**. `uploadMaxFilesPerApplication`, `uploadMaxBytesPerApplication`, `uploadLimitProvenance`, `supplierUploadClassId` and `supplierBankStatementClassId` already exist (Phase 4b). The public path reuses them. | none |

### 1.4 Triggers

The `refuse_trail_change` function already exists. Reuse it where a table is insert-only.

| Trigger | What it allows |
| --- | --- |
| PA010 `PortalApplicationDocument_frozen` | No DELETE. An UPDATE may change only `verification`, `verifiedByPersonId`, `verifiedOn`, `verifiedAt`, `verificationNote` and `expiresOn` (the officer's confirmation of the expiry, as `verifyDocument` allows today). |
| PA011 `PortalApplicationValue_append_only` | No UPDATE or DELETE. |
| PA012 `PortalApplicationCreditor_frozen` | The verification columns may change. One erasure is allowed: every content field to `''` and `erasedAt` from null to set. Nothing else changes, and nothing is deleted. |
| PA013 `PortalFormToken_once` | One UPDATE only, setting `portalApplicationId` from null. No DELETE. |

The existing `RegistrationDeclaration_append_only` covers the new rows unchanged.

### 1.5 What the schema change ripples into (step 1 must compile)

- `prisma generate`.
- Every exhaustive `Record<DeclarationKind, …>` must gain `TERMS_AND_CONDITIONS`:
  - `src/lib/suppliers/registration-settings.ts` (`DECLARATION_KIND_WORDS`: "Terms and conditions");
  - `src/lib/portal/registration/summary.ts`;
  - `src/lib/suppliers/data-export-words.ts`;
  - `RegistrationContext.texts` in `types.ts`;
  - the fixture.
- `DECLARATION_KINDS` in `types.ts` gains the kind.
- Every switch over `ActorKind` or the `AuditActor` union must gain the `APPLICANT` case. Grep `kind === "SYSTEM"` and `actorKind` in
  `src/lib/audit/**` and `src/app/**/history*`. The label is "Applicant, not signed in".
- The SULIT field registry `src/lib/sulit-fields.ts` registers `PortalApplicationCreditor`'s 13 fields under scope `creditorProfile`.
- Any test that lists every model (the demo wipe plan `src/lib/documents/demo-wipe-plan.ts`, tenant scans, the act-slot registry
  pin) must list the new models.

---

## 2. Contracts (written verbatim by step 1, so that steps 2 to 4 build against them)

### 2.1 `src/lib/portal/register/contract.ts` (new; types and constants only, client-safe)

```ts
import type { AddressParts } from "@/lib/suppliers/step-one";
import type { CreditorInput, RegistrationStep } from "@/lib/portal/registration/types";

export const REGISTER_APPLICATION_PART = "application";              // the JSON part
export const documentFilePart = (clientKey: string) => `doc.${clientKey}`; // one or more files per row
export const STATEMENT_FILE_PART = "statement";
// The token travels in FORM_TOKEN_HEADER ("x-form-token"); the honeypot stays the multipart field HONEYPOT_FIELD.

export type AgreementKind = "GIRO_AUTHORISATION" | "FALSE_DECLARATION" | "TERMS_AND_CONDITIONS";

export interface PublicApplicationBody {
  company: {
    registeredName: string; registrationNo: string; entityTypeCode: string; countryCode: string;
    incorporatedOn: string; bumiputeraClaimCode: string | null; companyEmail: string;
    address: AddressParts;
    contact: { name: string; designation: string; email: string; phone: string };
  };
  documents: {
    clientKey: string; typeId: string; title: string; reference: string; issuingAuthority: string;
    expiresOn: string; notApplicable: boolean; ratePercent: string; valueIds: string[];
  }[];
  creditor: CreditorInput;
  signatory: { name: string; designation: string };
  agreements: { kind: AgreementKind; textVersionId: string; textSha256: string; confirmed: boolean }[];
  /// The SHA-256 of the Personal Data Notice the page showed. Judged with the TERMS tick.
  noticeSha256: string;
}

export interface FaultView { step: RegistrationStep; field: string | null; level: "block" | "warn" | "info"; message: string }

export type RegisterReply =
  | { ok: true; reference: string | null }   // null: a dropped bot (honeypot)
  | { ok: false; code: "VALIDATION"; message: string; faults: FaultView[] }
  | { ok: false; code: "FORM_EXPIRED" | "CLOSED" | "BUSY" | "TOO_LARGE" | "NO_LENGTH" | "UNREADABLE" | "TRY_AGAIN"; message: string };

export type TokenReply = { ok: true; token: string } | { ok: false; code: "CLOSED"; message: string };
export interface ValueHit { id: string; code: string; name: string; kind: string; bodyId: string }
```

`FaultView` moves here from `src/app/supplier/registration/reply.ts`, which re-exports it, so that the legacy wizard and the public
wizard share one shape.

### 2.2 Pure functions (each with a `.test.ts`)

| File | Signature | Notes |
| --- | --- | --- |
| `src/lib/auth/form-token.ts` | `signFormToken(secret, purpose, now, nonce?)` and `verifyFormToken(...)` | For `register`, the token is `issuedAt.nonce.mac(purpose\|issuedAt\|nonce)`, where `nonce` is 16 random bytes in base64url (22 characters), made by `issueFormToken`. A `register` token without a nonce is `MALFORMED`. Every other purpose is unchanged. |
| `src/lib/portal/register/ceiling.ts` | `registerBodyCeiling(s: { capBytes: bigint \| null; maxFiles: number \| null; maxBytes: bigint \| null }): bigint \| null` | `min(maxBytes, maxFiles × capBytes) + maxFiles × PART_OVERHEAD + REGISTER_TEXT_ALLOWANCE`. Null if any setting is unset. `REGISTER_TEXT_ALLOWANCE` is computed from `LIMITS` and `APPLICATION_LIMITS`. A test pins that a payload with every text at its bound fits. |
| `src/lib/portal/register/parse.ts` | `parsePublicApplication(json: unknown): Parsed<PublicApplicationBody>` | Hand-validated, strict. Wrong type, unknown key or list over its bound is a refusal (the `api.ts` style). `clientKey` must match `/^new:[A-Za-z0-9_-]{1,40}$/`, and keys are unique. |
| `src/lib/portal/register/held-draft.ts` | `heldDraft(body, fileCounts: ReadonlyMap<string, number>, statementCount: number): Draft` and `heldDeclarations(body): DeclarationInput[]` | Shared by the browser and the server. The signatory comes from `body.signatory` (the `declarationsAsSigned` rule). `giroConfirmed` and `giroTextSha256` come from the GIRO agreement. |
| `src/lib/portal/register/faults.ts` | `publicApplicationFaults(body, held: Draft, ctx: RegistrationContext, step1: PortalApplicationContext): StepFault[]` | Runs `portalApplicationFaults` (step `company`, fields from `PORTAL_FIELD_OF`), then `registrationFaults(held, ctx, heldDeclarations(body))`, then `termsFaults`. Words come from `registrationFaultText` and `APPLY.faults`. |
| `src/lib/portal/registration/declaration.ts` | `termsFaults(input: DeclarationInput \| undefined, noticeSha256: string, ctx): StepFault[]` | Step `review`, field `terms`. The faults are: text not set, notice not set, `TEXT_STALE` (id, hash or notice hash differ), and `NOT_CONFIRMED`. `declarationFaults` loops over all three kinds. |
| `src/lib/portal/register/file-facts.ts` | `portalFileFacts(app, docs, creditor, agreements, types, policy, today): FileFacts` | Maps held rows into the `FileFacts` that `approveFaults`, `submitFaults` and `decisionSnapshot` read. It sets `kind: "NEW"`, `supplierStatus: "APPLICANT"`, `channel: "PORTAL"`, `blacklist: null` and `cancellation: null` (a clash is the register flag, judged separately). |
| `src/lib/portal/register/summary-record.ts` | `summaryRecordOfHeld(state, config): SummaryRecord` and `summaryRecordOfPortal(rows, sulit): SummaryRecord` | So the step-5 review and the staff page both render `registrationSummary` and `RegistrationSummaryCards`. |
| `src/lib/portal/apply.ts` | `whatIsMissing(c: RegisterReadiness): Words[]` | Extended in step 2 (section 5). |

### 2.3 Client safety

The browser imports `faults.ts`, `declaration.ts`, `documents.ts`, `codes.ts`, `creditor.ts`, `summary.ts` and
`src/lib/portal/register/*`.

- **Step 1 moves `frozenWording` and `currentDeclarationText` out of `declaration.ts`.** They use `node:crypto`. They move into a
  new server-only `src/lib/portal/registration/declaration-text.ts`. The callers are `context-store.ts`, `submit-store.ts`,
  `src/lib/portal/company/bank-store.ts` and the summary stores. Hashes reach the browser as data.
- **A source-scan test**, `src/lib/portal/register/client-safe.test.ts`, walks those modules' imports and fails on any `node:` or
  `@/lib/db` import.

### 2.4 Route endpoints (all route handlers; the public copy refuses server actions)

| Path | Method | Purpose |
| --- | --- | --- |
| `/supplier/register/submit` (`SUBMIT_PATH`) | POST multipart | The one submission (section 3) |
| `/supplier/register/token` | GET | A fresh `register` token (`TokenReply`). Same-site check (`downloadRequestFault`), `no-store`. |
| `/supplier/register/values?body=&kind=&q=` | GET | Live `RegistrationValue`s of one body and kind. `q` must be at least 2 characters, and at most 50 hits come back (`ValueHit[]`). Token in `x-form-token`. Same-site. |

Both GET paths join `PUBLIC_PAGES` (or the GET allow list) in `src/lib/portal/surface.ts`. `surface.test.ts` gains them.

---

## 3. Server: the submit route (builder step 2)

The files are `src/app/supplier/register/submit/route.ts` (rewritten), `src/lib/portal/register/receive-store.ts` (new) and
`src/lib/portal/register/token-store.ts` (new). `src/app/supplier/register/receive.ts` and its test are removed. Their tests move to
the new files.

### 3.1 Guard order (each refuses with words, and none reads further)

1. **The boundary's own question.** The route is excluded from the proxy, so it calls `gate({ surface, method, pathname,
   hasServerAction, staffCookie, supplierCookie, development })` from `src/lib/portal/surface.ts` itself. It answers as the proxy
   would.
2. **Same origin.** `foreignRequestFault(request, ["multipart/form-data"])`.
3. **Capacity, cheap and before the body.**
   - (a) `uploadLimiter().tryAcquire()`. With no slot: 503 `BUSY` with `Retry-After`. The slot is released in `finally`.
   - (b) The organisation and readiness are read (`loadRegisterSettings`, below). Anything in `whatIsMissing`: 503 `CLOSED`.
   - (c) An **unlocked** count of `PortalApplication` received in the last 24 hours is compared with `portalDailyLimit`. If
     reached: `BUSY`. The per-number count needs the body, so it waits for step 10.
4. **Stated length against the derived ceiling.**
   - No `content-length`: 411 `NO_LENGTH`.
   - Not digits: 400.
   - More than `registerBodyCeiling(...)`: 413 `TOO_LARGE`, with the limit in words. The body is never pulled.
5. **Token.**
   - `checkFormToken("register", header x-form-token)`. `KEY_NOT_SET`: `CLOSED`. Anything else but OK: 400 `FORM_EXPIRED`.
   - **Single use:** `findSpent(sha256(token))`. A row with an application returns `{ ok: true, reference }`, the same reply as
     before, with status 200 and the body unread.
6. **Streaming parse.** `limitBody(request.body, readLimit(ceiling))` piped into `new Response(stream, { headers: content-type
   }).formData()`. Past the limit: 413 `TOO_LARGE`. Unparseable: 400 `UNREADABLE`.
7. **Honeypot.** `honeypotTripped(form.get(HONEYPOT_FIELD))` answers `{ ok: true, reference: null }`. Nothing is written and the
   token is not spent.
8. **Shape.** `parsePublicApplication(JSON.parse(form.get(REGISTER_APPLICATION_PART)))`. Malformed: 400 `UNREADABLE`. File parts
   whose key names no row (or that are not `statement`) are a refusal too.
9. **Files, one at a time, in part order.** Each check uses the same helpers as `/supplier/registration/upload`:
   - `filenameFault`;
   - `sniffMediaType` on the first `SNIFF_BYTES`;
   - `mediaFault`, where a disagreeing name or declared type is refused;
   - `uploadFault(file, store, policy, usage)`, with `usage` accumulating across parts, so the count and byte quotas
     (`uploadMaxFilesPerApplication`, `uploadMaxBytesPerApplication`) and the per-file cap are judged once each.

   Each fault becomes a `FaultView` at `documents.<clientKey>.file` or `creditor.statement`, with `uploadFaultText` words.
10. **Every step's pure rule.** `publicApplicationFaults(body, heldDraft(...), ctx, step1ctx)`. Any blocking fault: 422
    `VALIDATION` with every fault. `ctx` is built by the organisation-keyed `registrationContextFor(client, orgId, settings,
    valueIds, supplier: { registrationNoKey, contactName })` (section 3.3).
11. **One transaction** (`receivePublicApplication`, timeout 60 s, maxWait 10 s; sized for the byte ceiling):
    1. `INSERT PortalFormToken(tokenSha256, issuedAt, consumedAt=now)` comes **first**. A concurrent duplicate blocks on the unique
       index. When it gets P2002 it re-reads, and returns the winner's reference outside the transaction.
    2. `issueReference(tx, org, PORTAL_APPLICATION_SERIES_KEY, today)`. The series row is the lock. The **locked** daily and
       per-number counts go to `portalCapacity`. `BUSY` throws `Turned`, as today.
    3. `SELECT … "Organisation" FOR KEY SHARE`, then `SELECT … "DeclarationText" … FOR SHARE`, in `submit-store.ts`'s order. The
       texts and the notice are re-read, and `termsFaults` and `declarationFaults` re-judge the ids and hashes. Stale: throw, then
       422 at step `review`.
    4. `PortalApplication.create` with the step-1 fields exactly as `receive.ts` writes them today, plus `form: WHOLE`.
    5. For every file: `storeUploadTx(tx, applicantActor, {...})`. The class is `supplierUploadClassId` for certificates. For the
       statement it is `supplierBankStatementClassId`, re-checked SULIT on the row. The recorder is `recordedByPortalApplicationId`.
    6. `PortalApplicationDocument` rows, with their snapshots and `PortalApplicationValue` rows (the code and name snapshot), and an
       attachment per file version.
    7. `PortalApplicationCreditor`, with the statement attachment.
    8. Three `RegistrationDeclaration` rows: GIRO, FALSE_DECLARATION and TERMS (with `noticeFrozenEn` and `noticeSha256`). Each
       has `frozenWording`, the signatory as typed, `signedOn` (the organisation's day), `signedAt` (now),
       `signedBySupplierAccountId: null` and `portalApplicationId`.
    9. `UPDATE PortalFormToken SET portalApplicationId`.
    10. One audit row: actor `APPLICANT`, entity `PortalApplication`, "Online application received". It holds the reference, the
        day, a count of documents and files, and "Bank details: entered". **No personal data**, so nothing in the append-only trail
        ever needs erasing.
12. **Reply** `{ ok: true, reference }`.

Bytes are written inside the transaction (`store.put(tx, …)`, ADR 0011's transactional driver), so **a refusal anywhere leaves no
bytes**.

### 3.2 Shared document-store change

`src/lib/documents/service.ts`: the body of `storeUpload`'s `$transaction` callback is extracted into `export async function
storeUploadTx(tx, actor, i)`. `storeUpload` keeps its signature and wraps it.

- The recorder check gains the third branch, `recordedByPortalApplicationId`.
- `AuditActor` gains `{ kind: "APPLICANT"; portalApplicationId: string; sourceAddress: string | null }` in `src/lib/auth/types.ts`,
  and `writeAudit` maps it to `actorKind APPLICANT`.

### 3.3 Context without an actor

`src/lib/portal/registration/context-store.ts`: `loadRegistrationContext(tx, actor, settings, valueIds)` is split into:
- an organisation-keyed core, `registrationContextFor(client, organisationId, settings, valueIds, supplier)`;
- the existing actor wrapper.

`RegistrationContext` gains `personalDataNotice: { en: string; sha256: string } | null`, and `texts.TERMS_AND_CONDITIONS`. Both are
filled in step 1, so the legacy wizard uses them too.

### 3.4 The proxy

`src/proxy.ts` `config.matcher` gains `supplier/register/submit$`:

```
"/((?!supplier/bids/part$|supplier/company/bank$|supplier/company/document$|supplier/registration/upload$|supplier/register/submit$).*)"
```

`src/proxy.test.ts` adds it to its `uploads` list, which pins the exact count.

### 3.5 Retry with the same token

The page holds one token per visit. Whether the first POST timed out or succeeded unseen, re-sending it gets the stored reply and
reference without the body being read (guard 5). Two concurrent sends make one application, and both replies carry its reference
(11.1). Two different visitors never share a token, because of the nonce (D8).

### 3.6 The page between steps 2 and 3

Step 2 deletes `application-form.tsx`, whose step-1-only post no longer fits the route. Until step 3 lands, `page.tsx` renders the
closed card. This is a transitional state for one commit on an unpushed branch, and the decisions-log entry says so. On the founder's
database the register is closed anyway, until a second account issues the terms text (REG-5).

---

## 4. Client: one wizard in the browser (builder step 3)

### 4.1 Files

- **`src/app/supplier/register/page.tsx`** (server).
  - It loads `loadRegisterForm()`, which extends `loadRegistrationForm` in `src/lib/portal/apply-repo.ts` into one
    `PublicRegistrationConfig`. The config holds:
    - the step-1 lists, and the format pattern and example;
    - the live document types (`DocumentTypeConfig[]`), bodies, `available`, banks and account types;
    - the three texts: id, version, filled English text and sha256;
    - the notice (filled English text and sha256), and `verificationNoticeEn`;
    - the account-number and SWIFT patterns, and `today`;
    - the upload rules: accepted type labels, cap, max files, max bytes, and `acceptNote`;
    - `contactNeedsEmailAndPhone`;
    - `whatIsMissing`.
  - It renders `PageHeader` with the title and **subtitle "Nothing is saved until you submit."**, then the closed card or
    `<RegistrationWizard config token />`.
  - The `Note`/`beforeItems` block is removed (minimal words; its "Nothing is uploaded here" is now false).
- **`src/app/supplier/register/registration-wizard.tsx`** ("use client", new). It holds all state in one reducer:
  - `company` (step-1 fields);
  - `documents` (rows with `clientKey` and `files: File[]`);
  - `chosen` (value hits by id, so `ctx.values` can be built in the browser);
  - `creditor`, `statement: File[]`, `signatory`;
  - `giro { confirmed, sha256 }`, `falseDeclaration`, `terms`;
  - `step`, `faults`, `token`, `tokenIssuedAt`.
- **Step components.** They are refactored, **not forked**, into controlled field components under
  `src/components/registration/`. Each takes `value`, `onChange`, `faults: FaultView[]` and a `files` adapter:
  - `company-fields.tsx`: the three cards lifted from `application-form.tsx`;
  - `documents-fields.tsx`: from `documents-step.tsx`;
  - `codes-fields.tsx`: from `codes-step.tsx`. Search goes through an injected `search(body, kind, q)`;
  - `epayment-fields.tsx`: from `epayment-step.tsx`;
  - `terms-card.tsx`: new, shared with the legacy review step.

  The `files` adapter is either `{ mode: "held"; files: File[]; add(f); remove(i) }` (public) or `{ mode: "uploaded"; … }`
  (legacy, keeping its XHR upload and withdraw).
  - `src/app/supplier/registration/{documents,codes,epayment,review}-step.tsx` become thin wrappers. They keep `useStepSave`,
    their routes and their tests.
  - The shared `FileInput` is already a "hold" input when given no `upload`. The wizard keeps the `File` from `onChange`.

### 4.2 Behaviour

1. **Stepper.** The shared `Stepper` shows the five `STEP_INFO` labels, the states (done, current, waiting) and `selected`. A done
   step may be revisited; a later step may not be skipped to.
2. **Next.** It runs the **same pure rules** in the browser for the current step:
   - `portalApplicationFaults` for step 1;
   - `stepFaults("documents" | "codes" | "epayment", heldDraft(...), ctx)` for steps 2 to 4;
   - `uploadFault` per held file, with usage accumulating.

   Blocking faults stay on the step: the words show beside the field (`faultsAt`, `errorText`, `noteText` from `wizard-api.ts`,
   moved to `src/components/registration/faults.ts`), and focus goes to the first one. These checks are a convenience; the server's
   are final.
3. **Step 5, "Review & Submit"**, in this order:
   - **The review:** `RegistrationSummaryCards` over `registrationSummary(summaryRecordOfHeld(state, config), fmt)`, each section
     with an "Edit" link back to its step.
   - **The false-declaration card:** its own tick (FR-VND-006), as on the legacy review step.
   - **The terms card** (`terms-card.tsx`), titled "Terms and conditions":
     - one line, "Read both before you submit." (6 words);
     - two links, "Terms and Conditions" and "Personal Data Notice", each opening the **shared drawer** read-only with the filled
       text. Use `history-drawer.tsx`'s pieces (`DRAWER_SCRIM`, `drawerPanelClass`, `DrawerHeader`, `dialog-focus`). If no
       read-only text drawer exists, add `src/components/ui/text-drawer.tsx` from those pieces and use it in both places;
     - the required `Checkbox` "I confirm I have read and agree to the Terms and Conditions and the Personal Data Notice".
   - **Submit.** Until both ticks are made, it is `Blocked` with reason "Tick the agreement to submit." Once ticked it is a
     `Button` ("Submit").
4. **Send.**
   - Build `FormData`: the `application` JSON (`PublicApplicationBody`), every held file as `doc.<clientKey>` and `statement`, and
     the honeypot input's value.
   - Send it with `XMLHttpRequest`, not `fetch`, so upload progress can be shown on the button ("Sending… 40%"). Set header
     `x-form-token`.
   - Before sending, if the token is older than 23 h (read from its `issuedAt`), first GET `/supplier/register/token`.
5. **Replies.**
   - `ok`: the state is cleared, `beforeunload` is disarmed, and the success card shows the reference once, "Keep this reference.",
     and `verificationNoticeEn` in a `Note`. There is one "Back to home" link. Nothing says "account page".
   - `VALIDATION`: the faults are stored, and the wizard jumps to the first step with a block (`firstBlockedStep`, extended to put
     `company` first) and focuses its first field. **Nothing typed or held is lost.**
   - `FORM_EXPIRED`: GET a fresh token, store it, resend **once** automatically. If it fails again, a `Callout` asks to submit
     again.
   - `TOO_LARGE`, `NO_LENGTH`, `BUSY`, `CLOSED`, `UNREADABLE`, `TRY_AGAIN`, or a network failure: the reply's own words in a
     `Callout tone="err"`. Data is kept and Submit stays available.
6. **`beforeunload`.** It is armed on the first change to any field or the first file held, and disarmed after `ok`. It calls
   `event.preventDefault()` only, with no custom text.
7. **Exit links.** The page's own "Back to home" (and the portal logo while armed) opens the shared confirm dialog. The question is
   "Leave? Nothing you entered is kept." (≤12 words), with buttons Leave and Stay. Use `CONFIRM_SCRIM` and `confirmPanelClass` from
   `src/components/ui/drawer.tsx`. If no reusable confirm component exists, extract `ConfirmDialog` there from `record-editor.tsx`'s
   confirm rather than writing a second one.
8. **Codes search** uses `/supplier/register/values` with the token. Chosen values are kept with their label, so the review shows
   "code - name" without a server read.

### 4.3 Words (`src/lib/portal/labels.ts` `APPLY`; 0005, founder 2026-10-19)

- **Remove:** `noticeTitle`, `noticeIntro`, `laterSteps`, `beforeTitle`, `beforeItems`, `submit` ("Send for checking"), and the
  second `nextItems` line ("Once accepted, you complete your registration online…").
- **Add:**
  - `nothingSaved` "Nothing is saved until you submit.";
  - `termsTitle` "Terms and conditions";
  - `termsLine` "Read both before you submit.";
  - `termsLink` "Terms and Conditions";
  - `noticeLink` "Personal Data Notice";
  - `termsTick` (the exact ruling sentence);
  - `submit` "Submit";
  - `tickToSubmit` "Tick the agreement to submit.";
  - `leaveQuestion` "Leave? Nothing you entered is kept.";
  - `keepReference` "Keep this reference.";
  - `unverified` "Unverified; not signed in" (staff side);
  - the new `missing.*` items (section 5).
- Every refusal stays within 12 words.

---

## 5. Configuration (steps 1 and 2)

1. **The terms text** is a `DeclarationText` of kind `TERMS_AND_CONDITIONS`. It is versioned, has provenance, supports
   `{organisation}`, is English only, and **none ships**.
   - Step 1 adds `{ value: "TERMS_AND_CONDITIONS", label: "Terms and conditions" }` to `DECLARATION_OPTIONS` in
     `src/app/configuration/suppliers/editors.tsx`.
   - `saveDeclarationText` in `core.ts` reads `DECLARATION_KINDS`, which now has the kind. It is reached only through
     `stageEdit("suppliers.saveDeclarationText", …)` in `actions.ts`, the two-person path. No new operation is needed, and no direct
     write or seed is added.
   - Its "signed, so add a new version" guard counts TERMS rows, because they are `RegistrationDeclaration`s.
2. **The notice** stays `SupplierPolicy.personalDataNoticeEn`, edited by the existing `EditPortalIntake`. Its hint loses nothing.
3. **`whatIsMissing`** (`src/lib/portal/apply.ts`) takes a `RegisterReadiness` and returns each missing item **named**, in this
   order:
   1. time zone;
   2. entity types;
   3. countries;
   4. states;
   5. numbering (`portal_application`);
   6. the Personal Data Notice;
   7. the Terms and Conditions text;
   8. the false-declaration text;
   9. the GIRO text;
   10. the verification notice (`verificationNoticeEn`);
   11. the document types (at least one live);
   12. the banks;
   13. the account types;
   14. the document store's file types and size;
   15. the deployment ceiling;
   16. the document class for certificates;
   17. the document class for bank statements (and that it is SULIT);
   18. the file-count and byte quotas;
   19. the daily and per-number limits;
   20. the online declaration accepted in place of paper (O-8);
   21. the document store driver (`blobStore()` fault);
   22. the form key.

   Each gets an `APPLY.missing.*` word. `loadRegisterForm` and the route's guard 3(b) call the **same** function, so the page and
   the route cannot disagree. The closed page lists the items through the existing `MoreText` "What is missing".

---

## 6. Staff side (builder step 4)

### 6.1 What exists, and what changes

**`src/lib/suppliers/application-acts.ts`:**
- `ERASED`: unchanged.
- `setAsideOnlineApplication`: for `form = WHOLE` it also erases `PortalApplicationCreditor` (every field `''`, `erasedAt` set, as
  trigger PA012 allows). It **refuses while a route is PENDING** ("A route is waiting. Decide it first."). The files and
  agreements are kept, and the audit row says so ("Files and agreements kept").
- `recordOutcome`, `rejectApplicant` and `appInclude`: unchanged. They serve `SupplierApplication`s.

**`src/lib/suppliers/portal-application-acts.ts`** (new; cores, each taking `tx`, actor, `now` and `act`):
- `verifyPortalDocument`: `verifyFaults` on the held row, with the named person (FR-VND-004).
- `verifyPortalCreditor`: `creditorReviewFaults`.
- `sendPortalApplicationForDecision`:
  - refuses on `blocksRecording(flags)`;
  - runs `submitFaults(portalFileFacts(...))` (every mandatory document verified and standing);
  - resolves `supplierRoute(matrix, SUPPLIER_REGISTRATION_DOMAIN, "NEW", requester, REGISTRATION_MATTER)`;
  - creates the `ApprovalInstance` with `portalApplicationId`, field for field as `submitForDecision` does;
  - sets `sentByPersonId`.
- `decidePortalRegistrationStep`: the same checks as `decideRegistrationStep`, with:
  - `deciderFaults` and `supplierHolders`;
  - `routeRequesterId("SUPPLIER_APPLICATION", { applicationSenderId: pa.sentByPersonId })`;
  - a refusal handled by `closeRejected` with `RETURN_TO_ORIGINATOR`.
- `approvePortalApplication`, called on the last DONE step. It implements ADR 0041 D6, in this order:
  1. lock the organisation and the PortalApplication;
  2. re-judge `approveFaults`;
  3. re-check the clash;
  4. issue the supplier reference;
  5. create Supplier REGISTERED with its contact, then SupplierApplication (APPROVED, PORTAL, `portalApplicationId`), then
     ApplicationDecision with `decisionSnapshot`;
  6. promote the documents (verification carried, `recordedByPortalApplicationId`, attachments moved with a detach reason as in
     `submit-store.ts`) and the values;
  7. create CreditorProfile v1 (`enteredByPortalApplicationId`, `submittedAt = receivedAt`, verification carried), with the
     statement attachment moved;
  8. PortalApplication goes to APPROVED with `acceptedSupplierId`;
  9. write an audit row for every row.

  A unique-key race on `registrationNoKey` becomes a `Refusal` with the clash words.
- `rejectPortalApplication`:
  - The reasons are required and kept verbatim in `decisionRemarks`. Status REJECTED, with `decidedAt` and `decidedByPersonId`.
  - It refuses while a route is pending.
  - The audit row's reason is the officer's words.
  - No Supplier row is created.

**`src/app/suppliers/portal-actions.ts`** (new, `"use server"`): thin actions, one per core. Each uses `staffForAct` and `beginAct`
with these slots:
- `PortalApplicationDocument.verifiedBy` (new);
- `PortalApplicationCreditor.verifiedBy` (new; signature class, as `CreditorProfile.verifiedBy`);
- `PortalApplication.sentBy` (new);
- `ApprovalStep.decidedBy` (existing);
- `PortalApplication.decidedBy` (existing).

The new slots are registered in `src/lib/auth/act-slots.ts`.

**`src/app/suppliers/actions.ts`:**
- `decideRegistrationStep`: when `instance.portalApplicationId` is set, delegate to `decidePortalRegistrationStep`, instead of
  answering "not on a supplier's registration route".
- `recordApplication`: refuses a `form = WHOLE` application ("Decide it on its page."). It stays for STEP_ONE (REG-5).

**`src/app/approvals/actions.ts`** (lines 71, 114, 139, 164, 176 and 259 today):
- select `portalApplicationId`;
- `matterDocumentOf` gains `portalApplication`;
- lock the PortalApplication row instead of a supplier;
- the worklist label becomes `${reference} · Registration approval route`;
- the link goes to `/suppliers/online/[id]`.

**`src/lib/auth/routed-people-store.ts`:** `RoutePeople` gains `portalApplicationId`, and `supplier = !!(…|| i.portalApplicationId)`.

**`src/lib/auth/creditor-access-store.ts`:**
- `portalCreditorNamedFacts(client, orgId, portalApplicationIds)`: the holders and deciders of `supplier_registration` routes with
  that `portalApplicationId`, the verifier, and `routeStarted`.
- `creditorNamedFacts`: a profile with `enteredByPortalApplicationId` is named by **that** application's route.
- `reviewFacts` (`src/lib/portal/registration/review-facts.ts`) and the declaration summary loaders read declarations by
  `applicationId` **or** `portalApplicationId = application.portalApplicationId`.

**`src/lib/documents/{owners,read,repo}.ts`:**
- The two new owners and purposes are added.
- The statement's bytes open to exactly the readers the bank-details decision grants, and every view and refusal is logged.
- Certificates open to staff as `SUPPLIER_DOCUMENT` files do today.

**`src/lib/portal/queue-repo.ts`:**
- `loadPortalQueue` adds `form` and the counts of documents and files.
- `loadPortalApplication` includes the documents (values, attachments, version `byteSize`, `mediaType`, scan state), the creditor
  id only, the declarations, the routes with their steps, and `sentBy`.

### 6.2 The page `src/app/suppliers/online/[id]/page.tsx`

For `form = WHOLE`:
- **Header.** The status badge gains Approved and Rejected. Meta: reference, sent day, "Unverified; not signed in". The clash
  `Callout`s stay as they are.
- **Body.** `RegistrationSummaryCards` over `registrationSummary(summaryRecordOfPortal(rows, sulit), fmt)`, the same projection the
  applicant reviewed:
  - **Company and contact** (contact behind the existing SULIT gate).
  - **Documents.** Each shows its type, reference, expiry, its files (name, size, type, a "Not scanned" `Chip`, and a download
    link), its codes as "code - name", and its verification (officer, day). A **Verify** drawer opens per document, reusing the
    supplier page's verify drawer from `src/app/suppliers/[id]/editors.tsx` with the action passed in as a prop. The drawer is
    extended, not copied.
  - **Bank details and statement**, behind `portalCreditorNamedFacts` and `creditorDecision`. Refused readers see the `SulitValue`
    mask, and every read is logged. A **Verify** drawer reuses the creditor one in the same way.
  - **Agreements.** For each: its kind label, text version, a hash `Chip` (first 12 characters, full value in the popover), the
    signatory as typed with `Chip` "Unverified; not signed in", the day and time, and a link opening the frozen text in the shared
    drawer.
- **Route panel.** The supplier page's route and decide editors, with the action prop pointing at `portal-actions.ts`.
- **Actions**, while RECEIVED and no route is pending:
  - "Send for decision", `Blocked` with its reason while `submitFaults` or the clash stops it;
  - "Reject", a destructive drawer with the reasons required;
  - "Set aside", the existing drawer.
- **When APPROVED:** a link to the supplier, and "Open the account" pointing to `/suppliers/[id]`, where `OpenPortalAccount` and
  `IssueSupplierCode` already require `supplierAccounts.manage` and the identity check. That is the code "as today".
- **When REJECTED:** the reasons as written, by whom and when.
- **Not offered:** Request resubmission (FR-VND-007 deferred online).

A `form = STEP_ONE` application keeps today's page and "Record the supplier" (REG-5).

### 6.3 Reader inventories: every reader learns the third recorder and the new subject

Typecheck will not catch these. The recorder columns on `SupplierDocument` and `DocumentVersion` are already nullable, so a reader
with a two-way fallback compiles and silently names the wrong actor on a legal record.

1. **Recorder and signer readers.** Each gets a third branch, "Applicant, not signed in", wherever it falls back today.
   - The steps:
     - step 1 adds the columns;
     - step 2 makes `storeUploadTx` write `APPLICANT_WORDS` ("Applicant, not signed in", new in `src/lib/documents/labels.ts`
       beside `SUPPLIER_UPLOADER_WORDS`) into the document audit for the applicant;
     - step 4 covers the promoted rows.
   - Known readers today:
     - `src/lib/documents/service.ts:176`, `src/lib/documents/views.ts` (lines 221 and 342) and
       `src/app/configuration/documents/page.tsx` (the `SUPPLIER_UPLOADER_WORDS` fallback);
     - `src/lib/portal/registration/summary-store.ts:115` (`lodgedBy`);
     - `src/lib/portal/company/company-store.ts:52` (`lodgedBySupplier`);
     - `src/lib/portal/company/replace-store.ts:72`;
     - `src/lib/suppliers/data-export-fields.ts` (lines 165 and 337).
   - The builder re-runs this grep at each step and lists every hit in the decisions-log entry:

     ```
     grep -rn "recordedBySupplierAccountId\|recordedByPersonId\|enteredBySupplierAccountId\|signedBySupplierAccountId\|SUPPLIER_UPLOADER_WORDS" src --include=*.ts --include=*.tsx
     ```

     Exclude `src/generated` and the writers.
   - Test (step 4, `portal-application-acts.db.test.ts`): a document, a version, a creditor profile and a declaration recorded by
     the applicant never render as "The supplier's own portal account" on the supplier page, in History or in the data export.
2. **Agreements are never called signatures.**
   - In `registrationSummary` (`src/lib/portal/registration/summary.ts`, today "Signed … by …"), a declaration with
     `portalApplicationId` and no account renders as: "Agreed {day} · {signatory as typed} · wording version {n}", with the
     `Chip` "Unverified; not signed in".
   - The empty text loses "signed" for that path.
   - The legacy wizard's account-signed rows keep "Signed".
   - Pinned by text assertions in step 3 (the applicant's review) and step 4 (the staff page and the supplier page after approval).
3. **Declaration readers follow `portalApplicationId`.** Each must read declarations by `applicationId`, or by `portalApplicationId =
   application.portalApplicationId`, or by the profile's `enteredByPortalApplicationId`, in step 4:
   - `src/lib/portal/registration/review-facts.ts`;
   - `src/lib/portal/registration/summary-store.ts`;
   - `src/lib/portal/data-export-store.ts` (the supplier's PDPA access export: an approved online supplier's agreements must
     appear);
   - `src/lib/auth/creditor-access-store.ts`;
   - `src/lib/portal/company/bank-store.ts`.

   Grep `registrationDeclaration.` and `declarations:` and list every hit.
4. **Route-subject readers.** Each must handle `portalApplicationId` or refuse it in words, never fall through to "Matter" or a
   non-null assertion:
   - `src/app/approvals/actions.ts`;
   - `src/lib/approvals/load.ts` (reads the `supplierApplication` relation);
   - `src/lib/documents/read.ts`, `owners.ts`, `repo.ts` and `types.ts`;
   - `src/app/documents/actions.ts`;
   - `src/lib/auth/routed-people-store.ts` and `creditor-access-store.ts`.

   Re-grep `supplierApplicationId`, `supplierApplication?.`, `supplierApplication: {` and `matterKind === "SUPPLIER"` at step 4,
   and list the hits.

---

## 7. The legacy path (step 1)

- `/supplier/registration` stays for existing APPLICANT accounts. Its page and routes are unchanged except for Submit.
- **`src/app/supplier/registration/review-step.tsx`** renders the shared `TermsCard` after the review and before the false
  declaration and password. Submit is `Blocked` until it is ticked.
- **`src/lib/portal/registration/api.ts` `parseSubmitBody`** accepts the TERMS declaration, with `noticeSha256`.
- **`declarationFaults`**, **`reviewFaults`** (notice and terms text set) and **`submit-store.ts`** write the TERMS row with
  `noticeFrozenEn` and `noticeSha256`, signed by the account (`signedBySupplierAccountId`). It rests on the same password entry as
  the other declarations (`SUPPLIER_ACT_SLOTS`).
- All of this lands in the **same commit** that adds the kind to `declarationFaults`, so the legacy tests never go red.
- **Consequence:** on a database without a terms text, legacy Submit is blocked, naming the missing text. That is founder point
  F-5.

---

## 8. Tests

### 8.1 Pure (vitest)

- `form-token.test.ts`:
  - a register token has a nonce;
  - two tokens issued in the same millisecond differ;
  - a nonce-less register token is MALFORMED;
  - other purposes are unchanged.
- `ceiling.test.ts`: the formula; any unset setting gives null; a payload with every text at its bound fits.
- `parse.test.ts`: wrong types, unknown keys, duplicate keys, an over-bound list and a bad `clientKey` are each refused.
- `held-draft.test.ts` and `faults.test.ts`:
  - the browser and the server give the same faults for the same input;
  - faults from all five steps, with step and field;
  - TERMS missing, stale or unticked; a stale notice hash.
- `declaration.test.ts`: `declarationFaults` covers three kinds; `termsFaults`.
- `apply.test.ts`: `whatIsMissing` names each of the 22 items, one test each, and is empty when everything is set.
- `file-facts.test.ts`: `portalFileFacts` read by `approveFaults`. An unverified mandatory document blocks. The online-declaration
  switch (null, false, true).
- `client-safe.test.ts` (section 2.3).
- `surface.test.ts` and `proxy.test.ts`: the new paths. The matcher excludes `supplier/register/submit`.

### 8.2 Route guards (`src/app/supplier/register/submit/route.test.ts`)

The database and the store are stood in. The real guards and pure rules run.

1. Guard order: a wrong surface or a staff cookie on the public copy; a cross-origin request; no limiter slot (503, Retry-After);
   the daily pre-count reached; no length (411); a stated length over the ceiling (413). In each of these cases, assert that the
   body stream was **never pulled**.
2. Tokens: missing, forged, expired. A spent token gives the **same reply and reference**, with the body unread.
3. A lying `content-length` with a longer body: `limitBody` cuts it, giving 413 with words.
4. Honeypot: `{ ok: true, reference: null }`, and the store is never called.
5. A sniff mismatch, a type not accepted, the per-file cap, the count quota and the byte quota. Each is a 422 fault at
   `documents.<key>.file` or `creditor.statement`.
6. Rule faults are returned by step and field.
7. **Over 10 MB.** With settings that allow it, an 11 MB statement arrives **whole**: the stored sha256 equals the sent one. With a
   cap of 5 MB, the same body gives 413 "too large" in words, never a silent truncation. A companion test compiles the real matcher
   (as `proxy.test.ts` does) and proves `/supplier/register/submit` bypasses the proxy, which would keep only the first 10 MB.

### 8.3 Database (`src/lib/portal/register/receive.db.test.ts`, scratch database)

1. Success writes everything in one transaction:
   - the application (`form WHOLE`);
   - documents, values, versions with `recordedByPortalApplicationId`, and attachments;
   - the creditor, with the statement in the SULIT class;
   - three declarations with the frozen text, hash, and notice columns on TERMS;
   - the token row;
   - one APPLICANT audit row, with no personal data.
2. A refusal **after** the files are parsed (the per-number limit under the lock; a terms text retired between page and Submit)
   leaves **zero** new rows in every table and zero new blob bytes. Count them before and after.
3. The same token twice in a row gives one application and the same reference. The same token twice **concurrently** (two
   transactions) gives one application, and both replies carry its reference.
4. Triggers and CHECKs refuse each of the following:
   - updating a document's content;
   - changing a value;
   - changing a creditor's content (erasure and verification are allowed);
   - updating or deleting a declaration;
   - a DocumentVersion with no recorder;
   - a declaration with neither a signer nor a portal application;
   - a TERMS row without notice columns.

### 8.4 Staff decision (`src/lib/suppliers/portal-application-acts.db.test.ts`)

1. Send is refused while a mandatory document is unverified (FR-VND-004), and while the number is on the register.
2. A named officer verifies; the route resolves; a step is decided by a holder, with self-approval and requester rules applied.
3. The last step creates:
   - Supplier REGISTERED, with its contact;
   - SupplierApplication (PORTAL, `portalApplicationId`, APPROVED);
   - the decision with its snapshot;
   - documents with verification carried and attachments moved;
   - CreditorProfile v1 (`enteredByPortalApplicationId`).

   Its audit rows are written. A clash created between send and the last step refuses the step and writes nothing.
4. Reject records the reasons verbatim and creates no supplier. A fresh application with the same number is then accepted within the
   per-number limit.
5. Set aside erases the words and the bank details, and keeps files and agreements. It is refused while a route is pending.
6. SULIT: the bank details and statement bytes are refused to a non-holder and granted to a step holder, the verifier and a
   `sulit.read.creditorProfile` holder. Each read is logged.
7. Request resubmission cannot be reached for a portal application.
8. After approval, `OpenPortalAccount` and `IssueSupplierCode` on the supplier work as today.

Legacy (`registration.db.test.ts`, `handlers.test.ts`): Submit needs the TERMS tick; the TERMS row has the notice hash; a stale terms
text is refused.

---

## 9. Builder steps

Run them **sequentially**, one builder at a time. Every step ends with:
- `npm run typecheck`, `npm test` (including the `*.db.test.ts` files against the scratch database), and `npm run lint` (which runs
  `scripts/check-ui.mjs`), all green;
- one commit with `git commit -F <message file> -- <paths>`;
- a decisions-log entry.

Do not touch the dev server on port 3000.

### Step 1: the data model, the shared rules, TERMS, and the legacy tick

Before writing anything, log the REG-5 counts (section 1.0).

**Files:**
- `prisma/schema.prisma`; the seven migrations in section 1.1; `src/generated/prisma/**` (generate).
- `src/lib/portal/registration/{types,declaration,declaration-text (new),faults,api,context-store,submit-store,summary,fixture}.ts`.
- `src/lib/portal/company/bank-store.ts` (import moved).
- `src/lib/suppliers/{registration-settings,data-export-words}.ts`.
- `src/lib/sulit-fields.ts`; `src/lib/auth/types.ts` (APPLICANT actor); `src/lib/audit/record.ts` and its label readers.
- `src/lib/documents/demo-wipe-plan.ts`.
- `src/lib/portal/register/{contract,ceiling,parse,held-draft,faults,file-facts,summary-record}.ts` (contracts and pure functions,
  each with a test). `file-facts` and `summary-record` may take their types now and be filled in step 4 if needed.
- `src/components/registration/terms-card.tsx` (new). The shared text drawer, if one must be added.
- `src/app/supplier/registration/{review-step.tsx,reply.ts}`.
- `src/app/configuration/suppliers/editors.tsx` (TERMS option).
- `prisma/demo-registration.ts`: seed a TERMS_AND_CONDITIONS text beside the GIRO and false-declaration texts, so the legacy demo
  Submit stays open. **Demo and scratch data only, never `perolehan`.**
- The section 6.3.1 recorder grep, with the hits listed.
- `docs/notes/decisions-log.md`: the rulings REG-1 to REG-6 as written; decisions O-1 to O-10; ADR 0041 marked Accepted; the REG-5
  "before" counts.

**Gates:**
- `prisma migrate dev` on the **scratch** database; `prisma migrate diff` (schema against migrations) is empty.
- The trigger and CHECK tests (section 8.3.4).
- The legacy wizard tests green with the tick.
- Apply to `perolehan` only after the counts are logged.

### Step 2: the public submit server

**Files:**
- `src/lib/auth/form-token.ts`, `form-secret.ts` (nonce).
- `src/lib/documents/service.ts` (`storeUploadTx`).
- `src/lib/portal/register/{receive-store,token-store}.ts` (new).
- `src/lib/portal/{apply,apply-repo}.ts` (`whatIsMissing`, `RegisterReadiness`, `loadRegisterForm`).
- `src/lib/portal/labels.ts` (`missing.*`).
- `src/app/supplier/register/submit/route.ts` (rewritten), `src/app/supplier/register/token/route.ts` (new),
  `src/app/supplier/register/values/route.ts` (new).
- Deleted: `src/app/supplier/register/{receive.ts,receive.test.ts,application-form.tsx}`.
- `src/app/supplier/register/page.tsx`: closed card only, per section 3.6.
- `src/lib/portal/surface.ts` and its test; `src/proxy.ts` and `src/proxy.test.ts`.
- `src/lib/documents/labels.ts` (`APPLICANT_WORDS`).
- The demo loader (`prisma/demo-*.ts`, wherever `SupplierPolicy` and the upload settings are seeded): set every new readiness item
  in section 5, including `onlineDeclarationReplacesPaper = true`, so a rehearsal can reach an open register. **Demo and scratch
  data only.**

**Tests:** sections 8.2 and 8.3.

**Gate:** the over-10 MB tests pass. `scripts/text-snapshot.mjs` on `/supplier/register`, diffed against the snapshot before the
step: the only difference is the closed card.

### Step 3: the public wizard

**Files:**
- `src/app/supplier/register/{page.tsx,registration-wizard.tsx (new)}`.
- `src/components/registration/{company-fields,documents-fields,codes-fields,epayment-fields,faults}.tsx` (new, lifted from the
  legacy step files).
- `src/app/supplier/registration/{documents-step,codes-step,epayment-step,wizard-api}.tsx` and `.ts` (now wrappers).
- The shared confirm dialog in `src/components/ui/` (only if extracted).
- `src/lib/portal/labels.ts` (the removals and additions in section 4.3).
- `scripts/compare-screen.mjs` `ALLOWED_EXTRA` / `DECIDED_FIELDS`, if the register screen is compared: record the five steps, the
  terms card, and "Nothing is saved until you submit.", each with the ruling as the reason.

**Tests:**
- jsdom renders of the wizard: Next blocks with field words; Submit is `Blocked` until ticked; a `VALIDATION` reply jumps to the
  first faulted step with the data kept; `FORM_EXPIRED` refreshes and resends once; `beforeunload` is armed and disarmed.
- The legacy step tests stay green.

**Gates:**
- `npm run lint` (check-ui).
- Text snapshots of `/supplier/register` and `/supplier/registration` (each step).
- Compare with the sibling portal screens (sign-in, activate) for header, spacing and card styling.
- Desktop widths only: 1280 and 1600.
- **The real-server rehearsal.** Stubs and the source scan cannot prove three things:
  - that no `node:` module reaches the client bundle (only `next build` or `next dev` bundling the page shows that);
  - that the form works on the public copy;
  - that an 11 MB statement passes through Next's body handling whole.

  Run a throwaway public copy against the **scratch** database: `PORTAL_SURFACE=public`, port 3011, a copy of the tree under the
  scratchpad, **never port 3000**. Then:
  1. Fill all five steps in a desktop browser and Submit a full application with an 11 MB statement.
  2. Compare the stored version's sha256 with the sent file's.
  3. Resubmit with the same token and confirm the same reference.
  4. Run `scripts/text-snapshot.mjs` against the same copy, port 3011.

  Record all of it in the decisions-log entry.

### Step 4: the staff side

**Files:**
- `src/lib/suppliers/{application-acts.ts,portal-application-acts.ts (new)}`.
- `src/app/suppliers/{portal-actions.ts (new),actions.ts}`.
- `src/app/suppliers/[id]/editors.tsx` (action props).
- `src/app/suppliers/online/[id]/{page.tsx,discard-drawer.tsx,reject-drawer.tsx (new)}`.
- `src/app/approvals/actions.ts`.
- `src/lib/auth/{routed-people-store,creditor-access-store,act-slots}.ts`.
- `src/lib/portal/registration/review-facts.ts` and the summary loaders.
- `src/lib/portal/{queue,queue-repo}.ts`.
- `src/lib/documents/{owners,read,repo}.ts`.
- `src/lib/suppliers/labels.ts` (statuses).
- `docs/notes/decisions-log.md`: the REG-5 "after" counts; FR-VND-007 recorded as partly unmet.

**Tests:** section 8.4, the legacy and supplier-page tests unchanged and green, and the worklist tests with the new subject.

Also in this step: the section 6.3 inventories, with every grep hit listed in the decisions-log entry.

**Gate:**
- Text snapshots of `/suppliers/online/[id]` (STEP_ONE unchanged, WHOLE new) and of `/suppliers/[id]` (unchanged except where an
  applicant-recorded row now reads "Applicant, not signed in"). Take them on a scratch-database copy, not on port 3000.
- The section 6.3.1 test: an applicant row never reads as the supplier's own portal account.

---

## 10. Risks and points for the founder (beyond REG-6)

| # | Point | Default in force |
| --- | --- | --- |
| F-1 | The register opens only when `onlineDeclarationReplacesPaper` is **true** (O-8). A customer that insists on a wet-ink declaration cannot run the online register, and takes paper applications instead. | Closed, naming the setting, until it is true. |
| F-2 | Personal data that cannot be erased: the signatory's name sits in append-only agreements, and the files of set-aside or rejected applications are kept (REG-6.4, ADR 0011). Set aside erases only the typed words and the bank details. This is a PDPA retention question. | Kept, as ruled. |
| F-3 | Rejection is the officer's recorded outcome, not a routed decision (O-3). If the founder wants rejection itself to go through the route, that is a change to the engine's use for every channel, not just this one. | Not routed. |
| F-4 | **Memory and abuse.** One anonymous post can be as large as `uploadMaxBytesPerApplication`. `formData()` buffers it, so peak memory is that figure × `DOCUMENT_MAX_CONCURRENT_UPLOADS` (default 3). For example, 50 MB × 3 is 150 MB. Files are SULIT-class or certificates written by an unauthenticated stranger before any scanner exists (scan at download, SEC-5). The per-number limit lets anyone fill a company's number for 24 h, and each attempt now costs a full upload. | Customer sets the quotas; the go-live conditions on the scanner and the database role stay NOT MET. |
| F-5 | Legacy signed-in applicants cannot submit until a terms text is issued. On the founder's database that needs a second account holding `configuration.issue` (REG-5). | Blocked, naming the text. |
| F-6 | Approval registers the supplier with **no portal account**. The office must open it later; the online page shows "Open the account". Nothing reminds anyone (there is no scheduler). | As ruled (REG-1(d)). |
| F-7 | A supplier numbering series and a `supplier_registration` matrix rule are needed only at decision time. They are not on the applicant's `whatIsMissing`, so the register can take applications an office cannot yet decide. The refusals at send and approval name them. | Not in the register's readiness list. |
| F-8 | The transaction that receives an application holds the series lock while every file's bytes are written. Under load, a second sender waits on that row lock until the first commits, bounded by the 60 s transaction timeout (`maxWait` bounds only the wait for a pool connection). If the timeout is reached, the second sender gets "try again" with its data kept. | Accepted for the expected volume. Revisit only on evidence. One option then is to take the series lock after the bytes are written; that needs its own review of the counts. |
