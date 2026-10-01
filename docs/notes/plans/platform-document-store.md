# Platform module — document store — plan

Status **accepted 2026-10-01 with rulings OD-1–OD-9 and the scope conditions (decisions log, "doc store" entries); go-ahead given on Phase 1 acceptance**. Mandated by CO-8 (2026-10-01): a separate platform module with its
own ADR, landing before RSAJ go-live and before Phase 2 acceptance. Decision record: `docs/notes/architecture/0011-document-store.md`
(0009 and 0010 are claimed by `phase1-closeout.md`; 6.2's ADR takes the next free number when written).
Spec: §10.1 NFR-AUD-001/003/005, §10.2 NFR-RET-001/002, §10.4 NFR-GEN-003, §10.5 NFR-SIG-002, §10.6 NFR-SEC-001/002/003/007/008,
§9.4 INT-13, and the FRs in §1. Builds after Phase 1 close-out; touches 6.3, 6.9, 6.10, 6.11 code only at the seams in §3.

## 0. What exists today

- `DocumentClass` (code, names, `retentionMonths Int?` — null is "not set", never zero —, `controlledCopy`, `releaseNeedsApproval`,
  provenance) edited at `/configuration/documents`. No classification (Public/Internal/SULIT), retention trigger, disposal method or
  disposal authority.
- `src/lib/audit/record.ts`: `writeAudit(tx, ctx, action, changes)`, unattributed until sign-in. The close-out builds FR-APR-015's
  trail export with a SHA-256 digest; this module uses the same hashing (`node:crypto`, no new dependency).
- Every waiting record says "not attached" (§3). `dossierFault` takes `evidenceAttachments: number`; `src/lib/award/evaluate.ts:220`
  passes a literal `0` (BD-4).
- Owners are linked by **typed nullable FKs, never a polymorphic (type, id)** (DL 6.10 §8.1 precedent).
- Server Actions cap request bodies at 1 MB by default (`node_modules/next/dist/docs/.../serverActions.md`). Uploads therefore go
  through a Route Handler, not an action.

## 1. Requirements served

| ID | Pri | This module | Left open |
| --- | --- | --- | --- |
| INT-13 | — | Internal repository behind a `BlobStore` façade; Postgres driver now, S3/Azure Blob adapters later | Public Server coexistence (migration deliverable) |
| NFR-SIG-002 | M | Wet-signed scan bound to its record, digest-protected, binding audited, substitution only as a new version with reason | Signature binding to an identity (sign-in) |
| NFR-AUD-001 | M | Every upload, attach, detach, new version, withdrawal, hold, class change audited before/after; downloads and refusals logged | Actor (sign-in) |
| NFR-AUD-003 | M | Per-version SHA-256 and a verify act; manifest shape for the case export | Case export itself (FR-APR-015 extension) |
| NFR-AUD-005 | M | Stored-at from the server; a typed "received on" day is the paper's, organisation day, never future | — |
| NFR-RET-001 | M | Class gains trigger, method, authority; `retentionState` and `disposalFault` built and tested | **No disposal run: nothing is ever deleted** |
| NFR-RET-002 | M | Legal hold placed/released with reason; visible on the document and every panel showing it | Disposal runs to exclude it (none exist) |
| NFR-SEC-002 | M | Classification on the class, snapshotted on the document; downgrade from SULIT refused until maker-checker | Automatic SULIT on estimates/evaluation (6.2/6.6/6.8) |
| NFR-SEC-007 | M | Type allow-list by content sniffing, size ceiling, refusals logged | **Malware scanning deferred** (OD-4) |
| NFR-SEC-001, AUD-004 | M | Not met: no sign-in. SULIT bytes never served (OD-2) | Sign-in |
| NFR-SEC-003 | M | **Not met and not claimed.** Bytes are plain `bytea`; 6.6 owns sealed storage | 6.6 |
| NFR-SEC-008 | M | Bytes stay in the deployment's Postgres; no outside service | Hosting evidence (devops) |
| FR-CTE-004, FR-REQ-012 | M | Signed minutes attached to a minuted meeting; the committee gate reads them | — |
| FR-MTD-009 | S | Dossier evidence; `dossierFault` passes on ≥1 live attachment (closes BD-4) | — |
| FR-REQ-013 | M | Coordination-meeting scope document attached | — |
| FR-APR-012 | M | The absent holder's recommendation attached to the re-delegation (OD-6) | Line management (AGENTS.md) |
| FR-AWD-003, 008 | M | Scans of the signed letter, declaration, authorisation, acceptance page (OD-5) | — |

Consumers later, same panel, own purposes: FR-ADV-014 addendum, FR-EVL validity consent, clarification minutes, FR-VAR-015 sketches,
FR-CRT final-account pack, FR-REQ-010 anggaran harga (still waits on D5), FR-AWD-011 tender documents (OQ-10 collection right).

## 2. Storage design

**Tables** (additive migration `document_store`; `organisationId` on every table; no semicolon in any migration comment):
- `DocumentClass` + `classification SecurityClass?` (PUBLIC/INTERNAL/SULIT; null = not set; the enum shared with 6.2, BD-DS-1), `retentionTrigger
  RetentionTrigger?` (RECEIVED / OWNER_CLOSED / CONTRACT_FINAL_ACCOUNT), `disposalMethod DisposalMethod?`, `disposalAuthorityRoleCode
  String?` (validated office). All ship unset; "Not set" on screen.
- `DocumentStorePolicy` (one per organisation): `allowedMediaTypes String[]` (subset of the product's sniffable set), `maxBytes BigInt?`
  — both unset refuse uploads naming the setting (OD-3); `provenance`.
- `BlobContent` (organisationId, sha256 Char(64), byteSize BigInt, bytes Bytes, storedAt) — PK (organisationId, sha256). Content-
  addressed **per organisation** (no cross-customer existence oracle). Separate table so metadata reads never pull bytes.
- `Document` (title, documentClassId, `classificationSnapshot` + `retentionSnapshot` Json taken at creation, status STAGED / FILED,
  createdAt). A document is STAGED until its first attachment; staged documents are listed "Received, not filed", never auto-deleted.
- `DocumentVersion` (documentId, versionNo, sha256, byteSize, mediaType **sniffed**, originalFilename as typed, `receivedOn` day?,
  `recordedByPersonId` named, note, storedAt server time, `scanState ScanState` = NOT_SCANNED, `withdrawnAt`/`withdrawnReason`).
  No update path: a correction is a new version; a withdrawal is two columns set once, with a reason. Bytes are never deleted.
- `DocumentAttachment` (purpose `AttachmentPurpose`, versionId pinned, typed nullable owners `meetingId`, `exerciseId`, `awardId`,
  `delegationId`; CHECK `num_nonnulls(...) = 1`; `attachedAt`, `detachedAt`, `detachReason`). Purpose→owner pairing checked in lib
  and by a CHECK. New owners and purposes arrive by migration with their module (MatterKind precedent).
- `LegalHold` (documentId, reason, `placedByPersonId`, placedAt, releasedAt?, releaseReason).
- `DocumentAccessEvent` (versionId, kind DOWNLOADED / REFUSED / VERIFIED / INTEGRITY_FAILED, reasonCode, at) — append-only.

**Façade** `src/lib/documents/store/` (integration boundary; nothing above it knows the driver):
```ts
export interface BlobStore {
  readonly driver: "postgres" | "filesystem";
  put(tx: Tx, org: string, sha256: string, bytes: Uint8Array): Promise<void>; // idempotent on (org, sha256)
  get(org: string, sha256: string): Promise<Uint8Array | null>;
}
export interface MalwareScanner { scan(bytes: Uint8Array): Promise<"NOT_SCANNED" | "CLEAN" | "THREAT"> } // ships NotConfigured
```
`postgresBlobStore` writes `BlobContent` inside the caller's transaction, so bytes, metadata and audit commit or fail together. Chosen
by `DOCUMENT_STORE_DRIVER` (default `postgres`); a deployment ceiling `DOCUMENT_MAX_BYTES` (technical, not policy) caps `maxBytes`.
S3/Azure adapters implement the same interface later; a non-transactional driver writes before the transaction (idempotent by digest)
and an orphan report lists unreferenced blobs — never auto-deleted.

**Upload** `POST /api/documents` (Route Handler): refuse on `Content-Length` over the effective cap (413) before reading; `formData()`;
sniff, size, hash; one transaction creates the STAGED document, version, blob and audit row; returns `{ versionId, sha256 }`. **Attach,
detach and new version** are generic actions (`src/app/documents/actions.ts`, BD-DS-16): each locks its owner through the owner
module's own helper (`withLockedSitting`, `withLockedRequisitionForSourcing`, `withLockedAward`, `lockDelegation`, via
`src/lib/documents/owners.ts`), then the document, re-runs `attachFault` / `detachFault` / `repinFault` on locked data, and writes
the attachment, its audit row and the owner's own consequence in one transaction. **Download** `GET /api/documents/versions/[id]` runs `downloadDecision`,
recomputes the digest (mismatch → INTEGRITY_FAILED event, 500), serves `Content-Disposition: attachment`, stored type, `nosniff`,
`Cache-Control: private, no-store`, and logs the event. Refused types, sizes and SULIT requests are logged as REFUSED.

## 3. What "attached" means per waiting deferral

"Attached" = a live `DocumentAttachment` of the purpose on that owner, whose pinned version is not withdrawn. `evidenceCount` in lib
computes it; no module counts rows itself. A record that was judged snapshots the pins (version id, digest, title) it was judged on.

| Deferral | Owner · purpose | Attach allowed | Gate change |
| --- | --- | --- | --- |
| FR-CTE-004 signed minutes (DL 6.10) | Meeting · SIGNED_MINUTES | Only once minuted; new version with reason | No gate on minuting (signing follows it). "Not attached" → "Signed copy attached"; a minuted meeting without one shows "Signed copy outstanding" |
| FR-REQ-012 gate minutes (CO-1–3) | reads the cited decision's Meeting | — | Gate card's "signed copy not attached" reads the meeting's attachment; no new purpose |
| FR-MTD-009 dossier / BD-4 / CO-8 | Exercise · DOSSIER_EVIDENCE | Not while the appointment route is open, nor once the award is approved | `evaluate.ts` passes `evidenceCount`; `dossierFault` passes on ≥1; submission snapshots pins into `Award.dossierEvidenceSnapshot`; issue refuses if a snapshotted version was withdrawn. BD-4 copy on Award tab, `award-form.tsx`, `labels.ts` replaced |
| FR-REQ-013 scope document | Exercise · COORDINATION_SCOPE | Exercise not cancelled | Display only |
| FR-APR-012 recommendation (DL 6.9) | Delegation · HOLDER_RECOMMENDATION | At creation (staged version id in the form) | Per OD-6; earlier text-only delegations stand, labelled "recorded as text before attachments existed" |
| FR-AWD-003/008 returns (BD-23, 38) | Award · SIGNED_LETTER / DECLARATION / AUTHORISATION / ACCEPTANCE_PAGE | ISSUED or ACCEPTED; detach after ACCEPTED only as a BD-24 correction | Per OD-5. Accepted awards are never re-judged |
| 6.2 NFR-SEC-003 (→ 6.6) | none | — | Unchanged. The store is not sealed storage; 6.6 decides encryption and whether a digest of sealed content may be kept |

Minimal faithful test updates (flag at acceptance, per LESSONS): `justification.test.ts` "evidence is never a pass" gains an explicit
`evidenceAttachments: 0` and keeps its assertion; `award/core.test.ts` dossier fixtures unchanged in value.

## 4. Access honesty without sign-in, and upload limits

- Panels and the drawer state once: "Stored and listed. Anyone who can reach the portal can open a document that is not SULIT;
  there is no sign-in to restrict it." No screen says "restricted", "secure" or "confidential storage".
- SULIT and unclassified (class classification null) bytes are **not served** (OD-2). Title, class, version, digest and dates are
  listed; Download is disabled with the reason; a direct request is refused and logged.
- Classification change on a document: upgrade audited with reason; downgrade from SULIT refused until maker-checker (NFR-SEC-002).
- Types: content-sniffed allow-list from `DocumentStorePolicy`; the product knows PDF, PNG, JPEG, TIFF. Office files and ZIP are not
  in the known set (a ZIP sniff cannot tell DOCX from anything else); HTML/SVG never. A sniffed type differing from the declared one
  is refused, naming both.
- Size: `min(policy.maxBytes, DOCUMENT_MAX_BYTES)`; exactly the cap passes, one byte over refuses.
- Malware: every version `NOT_SCANNED`, chip "Not scanned for malware — scanning not built" on each row and on download (OD-4).

## 5. Pure functions (`src/lib/documents/`, vitest, each test fails if its rule is removed)

`media.ts` `sniffMediaType(head)`, `mediaFault(sniffed, declared, policy)` · `limits.ts` `sizeFault(bytes: bigint, policy, ceiling)` ·
`versioning.ts` `nextVersionFault(latest, sha256)` (IDENTICAL_TO_VERSION_N, DOCUMENT_WITHDRAWN) · `attach.ts` `attachFault({ purpose,
owner, version, documentClass })` (PURPOSE_NOT_FOR_OWNER, OWNER_FROZEN with the exit, VERSION_WITHDRAWN, CLASS_NOT_SET,
CLASSIFICATION_NOT_SET warn), `detachFault` (REASON_REQUIRED, RELIED_ON, OWNER_FROZEN) · `evidence.ts` `evidenceCount(attachments,
purpose)`, `evidencePins(...)` · `access.ts` `downloadDecision(classification | null)` · `classification.ts` `reclassifyFault` ·
`retention.ts` `retentionState(class, triggerDay, today)` (NOT_SET / TRIGGER_NOT_REACHED / RUNNING until / ELAPSED),
`disposalFault(doc, holds, survivingObligations, today)` (built, no caller) · `hold.ts` `holdFaults`, `releaseFaults` ·
`labels.ts`, `audit-view.ts` (codes never on screen).
Must-have tests: dossierFault passes on one attached, fails on detached or withdrawn; PDF header with `.png` name refused; ZIP
refused; cap boundary; identical re-upload refused; SULIT and null refused for download; NFR-RET-001 worked example (D&B contract,
retention elapsed, Design Guarantee Bond outstanding → disposal refused); hold blocks disposal with retention elapsed; unset
retention never ELAPSED; `receivedOn` in the future refused; unset time zone refuses a typed `receivedOn` naming the setting.

## 6. Screens

- **Shared `AttachmentPanel`** (`src/components/attachments/`, built by design-system-engineer on `Card`, `DataList`, `Badge`,
  `Chip`, `Callout`, `EmptyState`, `Button`, `Field`). Props: `owner`, `slots: { purpose label, required, state, findings }[]`,
  `frozen: { reason } | null`, `items`. Row: title, class, classification badge, version, received on, "recorded on behalf of, not
  signed", size, scan chip, short fingerprint. Actions: Upload (client island posting to the route, then the owner's attach action),
  New version (reason), Detach (reason, says what it does), Download (disabled with reason), Verify. Mobile columns per DataList.
- **Document drawer** (shared drawer shell): versions, where attached, holds, access events, History.
- **Mounted on**: meeting page (minutes card), exercise page (dossier and coordination sections, replacing "Not attached" chips),
  award Return tab (four slots) and the Attachments line on `awards/[id]`, delegation editor.
- **Configuration > Documents**: class editor gains classification, trigger, disposal method/authority; new "Upload rules" card;
  "Received, not filed" list; "Legal holds" list. Compare against sibling configuration screens at 1280/1440/390.

## 7. Open decisions for the product owner

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| OD-1 | Driver for this build | A Postgres `bytea` in its own table. B local filesystem. C Postgres large objects | **A**: one transaction with metadata and audit, backed up with the database, no orphans. C: Prisma has no API, orphans need `vacuumlo`. B shipped later as a driver if size demands |
| OD-2 | SULIT / unclassified bytes before sign-in | A listed, never served. B served on a named Person + purpose. C refuse SULIT uploads | **A**. B repeats what 6.2 OD-1 rejected (an attested name is not access control); C pushes SULIT evidence back onto paper |
| OD-3 | Type and size limits | A organisation policy, unset refuses uploads naming the setting, deployment ceiling. B product defaults | **A** (rule 1; no shipped threshold). Demo sets PDF/PNG/JPEG, 20 MB, ASSUMED |
| OD-4 | Malware scanning | A defer, NOT_SCANNED shown, served as attachment, `nosniff`. B block downloads until scanned. C local ClamAV now | **A**, an RSAJ go-live condition (NFR-SEC-007 M). B makes the store useless; C adds a daemon outside this build's scope |
| OD-5 | Award return scans | A a received item counts only with its scan attached (NFR-SIG-002), returns recorded after landing. B customer switch, null blocks. C optional | **A**; product rule, not policy. Accepted awards keep their state |
| OD-6 | FR-APR-012 recommendation | A attachment required for new re-delegations, text kept as summary. B text or attachment | **A** (spec: "attached") |
| OD-7 | Class at upload | A officer picks any configured class; none configured refuses naming Configuration > Documents. B one class per purpose configured | **A**; B when a customer asks |
| OD-8 | Attachment and versions | A attachment pins a version; a new version re-pins in the same audited act unless the owner is frozen. B always latest | **A** (NFR-SIG-001: the exact version) |
| OD-9 | Database-level immutability | A application-only + digest re-check on every read (FR-APR-015 precedent). B triggers refusing UPDATE/DELETE now | **A**; triggers with sign-in and demo tooling, as ruled for the trail |

## 8. Implementation steps (each step's checks pass before the next)

1. product-owner: rule OD-1–9. solution-architect: ADR 0011 → accepted with the rulings.
2. data-modeler: `document_store` migration (§2), CHECK constraints in SQL, Prisma `Bytes`/`BigInt`; schema diff empty on rebuild.
3. domain-engineer + test-engineer: `src/lib/documents/*` and tests (§5) — contracts in `types.ts` first so 4–6 run in parallel.
4. integration-engineer: `store/` façade, `postgresBlobStore`, `NotConfiguredScanner`, driver selection, orphan report.
5. api-engineer: upload and download Route Handlers (`RouteContext` after `next typegen`), access events; owner attach/detach/
   version/hold actions with owner locks and audit.
6. workflow-engineer: §3 seams — `evaluate.ts` count and snapshot (`Award.dossierEvidenceSnapshot Json?`, backfill null), issue
   re-check, delegation refusal, return completeness, meeting and gate display; label copy in each module's `labels.ts`.
7. design-system-engineer: `AttachmentPanel` and drawer; frontend-engineer: mount on §6 screens and configuration.
8. data-migration-engineer: demo (§9). security-auditor: headers, sniffing, filename handling, SULIT refusal, size refusal before read.
9. code-reviewer, ux-reviewer, then product-owner acceptance; log every ruling and the deferrals (NFR-SEC-001/003/007 scan, disposal).

## 9. Demo data (invented, ids `demo_doc*`, generated in `prisma/demo.ts`)

Bytes generated in code: one-page PDFs reading "DEMO — invented document, not a real record" and a small PNG; nothing from the
client's documents. Classes `demo_dc1` Internal (ASSUMED), `demo_dc2` SULIT, `demo_dc3` classification unset; policy PDF/PNG/JPEG,
20 MB. Attachments: signed minutes on one minuted demo meeting (another left outstanding); dossier evidence on `demo_sx2` (with a
withdrawn v1 and live v2), another dossier exercise left without to keep BD-4's block visible; return scans on one accepted demo
award; a recommendation on one demo delegation; one SULIT document (listed, not downloadable); one legal hold; one staged unfiled
upload. Wipe deletes access events, holds, attachments, versions, documents, then only blobs no non-demo version references; refuses,
listing them, when a non-demo row points at a demo document.

## Build decisions

Taken during the build (steps 2–6 and the demo); each for review at acceptance.

| # | Decision | Why | Review |
| --- | --- | --- | --- |
| BD-DS-1 | The shared classification enum is named `SecurityClass` (PUBLIC / INTERNAL / SULIT), the name 6.2's plan already uses, not this plan's `DocumentClassification`. `DocumentClass.classification` and `Document.classificationSnapshot` use it; 6.2's `CompanyEstimate` adopts it as is. | Scope ruling: one enum shared with 6.2. Taking 6.2's name means neither plan's model text has to change beyond this one. | — |
| BD-DS-2 | `Award.returnScanSnapshot Json?` beside `dossierEvidenceSnapshot`: the scan pins an award was accepted on. Null on an ACCEPTED award means it was accepted before scans were required (OD-5); no backfill. | OD-5 needs a durable mark of "accepted at landing" that a later BD-24 correction cannot erase, and the plan's own rule is that a judged record snapshots its pins. | PO |
| BD-DS-3 | `DocumentAccessEvent.versionId` is nullable, with `offeredFilename` and `offeredBytes`: a refused upload has no version but is still logged as REFUSED. `organisationId` is on every new table. | §2 asks refused types and sizes to be logged; without a nullable version they could not be. | — |
| BD-DS-4 | `DisposalMethod` is DESTROY / TRANSFER_TO_ARCHIVES / REVIEW, product vocabulary with nothing shipped set. `Document.filedAt` records when a staged document was first attached. | The plan names the column, not the values; these are the three outcomes a records schedule uses. Nothing is disposed of in this build. | PO |
| BD-DS-5 | Besides the two owner CHECKs: version numbers from 1, sizes not negative, a blob's size equals its bytes, and a withdrawal, a detachment and a hold or release each carry a non-blank reason — all CHECKs in the migration. Every document-store foreign key is RESTRICT, including to the organisation, so nothing cascades bytes away. | The reasons are required by the plan; the database refuses a row the application would refuse. OD-9 (no triggers) is unchanged: these constrain inserts' shape, not updates of history. | — |
| BD-DS-6 | Tooling: the WASM schema engine panicked on the schema's first CHECK constraints because the session adapter read Postgres `"char"` as text. `docs/notes/cloud-build/tools/adapter-pg-patched.cjs` now reads it as a character, as the native engine does; `verify.sh` ends with an empty diff and the CHECKs are present in the rebuilt database. | Environment only; the migration SQL is unchanged by it. Confirm on the native engine at acceptance as for earlier migrations. | — |
| BD-DS-7 | The upload request is refused before reading when its declared length exceeds the cap plus a 64 KB multipart allowance (`MULTIPART_ALLOWANCE_BYTES`, technical); a body sent without a length is counted as it arrives and cut off at the same point. The file's own size is then held to the exact cap (at the cap passes, one byte over refuses). | A multipart envelope makes the request longer than its file, so a file exactly at the cap would otherwise be refused by its Content-Length. Scope ruling: "upload with no length refused or counted" — counted. | — |
| BD-DS-8 | An unset or malformed `DOCUMENT_MAX_BYTES` refuses uploads naming the variable, like an unset policy size. `.env.example` documents it. | Unset never silently becomes a default; a deployment that never set its ceiling has not decided what it can hold in memory. | — |
| BD-DS-9 | A file's name must carry an extension the portal recognises, matching its bytes (`NAME_WITHOUT_TYPE`, `DECLARED_TYPE_MISMATCH`); a declared Content-Type other than octet-stream must match too. `DOCUMENT_WITHDRAWN` applies when every version of a document is withdrawn; to correct a version, add the new one, then withdraw the old. Identical bytes to any earlier version, withdrawn or not, are refused naming it. | §4: a sniffed type differing from the declared one is refused, naming both; a name with no type declares nothing to compare. | — |
| BD-DS-10 | Retention of N months from trigger day D elapses on D + N months (month-end clamped) and is RUNNING until the day before; zero months reads as not set. | The plan names the states, not the boundary; this is the reading of "retain for N months from" that `addMonths` already gives the securities module. | PO |
| BD-DS-11 | Only lowering from SULIT is refused (`DOWNGRADE_FROM_SULIT`); Internal to Public is allowed, audited with a reason. A set classification is never unset. | §4 and OD-2 name SULIT only. | PO |
| BD-DS-12 | One standing legal hold per document; a different reason is recorded by releasing and placing again. | Two concurrent holds with different releasers would make "released" ambiguous. | — |
| BD-DS-13 | `justificationFaults` takes `{ dossier, scope }` counts (required). The coordination scope document's warning clears on a live attachment too (display only, as §3 says); `EvaluationContext.evidence` is optional and absent means none, on the `nameRoutes` precedent, and `evaluationContext` loads the real counts. | Scope ruling: a required evidence input; never a literal zero where a count exists. | — |
| BD-DS-14 | `attachFault` adds `OWNER_NOT_READY` (minutes before minuting, return scans before issue) beside `OWNER_FROZEN`, and `ALREADY_ATTACHED`; `detachFault`'s RELIED_ON covers an award accepted on the scan and a delegation granted on the recommendation. Withdrawal is never refused for reliance — the judged record learns of it instead (issue refuses). | Every refusal names the way out, and a not-yet state reads differently from a frozen one. | — |
| BD-DS-15 | The façade adds `transactional` to `BlobStore` (true for Postgres) and `configured` to `MalwareScanner`; `put` recomputes the digest and refuses bytes that do not hash to their address; `DOCUMENT_STORE_DRIVER=filesystem` refuses (`DRIVER_NOT_BUILT`) rather than falling back, and any other value refuses as unknown. The orphan report is a read, never a delete. | Callers must know whether to write bytes before or inside their transaction; a mis-addressed blob would make every later integrity check meaningless. | — |
| BD-DS-16 | The owner acts (attach, detach, attach a new version) are one set of server actions in `src/app/documents/actions.ts`; each locks its owner through that owner module's own helper (`withLockedSitting`, `withLockedRequisitionForSourcing`, `withLockedAward`, a Delegation row lock) via `src/lib/documents/owners.ts`, then the document row, re-runs the pure check on what it read, and writes the attachment, its audit row and the owner's own consequence (`afterChange`) in the same transaction. Withdraw, reclassify, hold, release and verify lock the document only. | One action for the shared panel to call, with the locking and the owner's rules still the owner module's; the plan's "owner module's server action" in substance, not file location. | — |
| BD-DS-17 | A new version is uploaded through the same route with `documentId` (the document row locked, `nextVersionFault` re-run); moving a pin to it is `attachNewVersion`, which closes the old attachment ("Replaced by version N: reason") and opens a new one, so the record shows which version stood when. | Upload bodies cannot go through actions; OD-8 wants one audited act with a reason for the move. | — |
| BD-DS-18 | A withdrawn version is still served where its document's classification allows: it is withdrawn, not deleted, and the drawer lists it as withdrawn. An unknown version id is a 404 and not logged (there is no version to log against). | Reviewers must be able to see what was withdrawn and why. | PO |
| BD-DS-19 | The upload route answers JSON `{ ok, code, message }`: `message` is the words a screen shows, `code` is for the client island's logic only and is never rendered. Refusals: 413 too large, 415 type, 409 identical version, 422 policy/class/person/day, 400 unreadable, 503 driver. Every refusal, validation included, is logged REFUSED with the offered name and size. | Codes never reach a screen; every refusal is logged (§2). | — |
| BD-DS-20 | Configuration > Documents gains `saveStorePolicy` (types as recognisable media types, size typed in MB and stored in bytes, provenance, audited before/after) and `saveDocumentClass` writes classification, trigger, disposal method and authority (a validated office) only when the form carries them, so today's editor never blanks them. The configuration History maps their codes to labels. | The UI builder needs the seams; an unchanged form must not clear new fields. | — |
| BD-DS-21 | `AwardFacts.dossierEvidence` (count, the award's snapshot, the pinned versions withdrawn since) is optional and absent means none, on the `nameRoutes` precedent; `awardFacts` always loads it. `submitAward` snapshots the live dossier pins into `Award.dossierEvidenceSnapshot` for a dossier method (re-taken on a later resubmission from Draft). At issue `snapshotFaults` refuses `EVIDENCE_NOT_SNAPSHOTTED` and `EVIDENCE_WITHDRAWN_SINCE_JUDGED`, each naming cancel and open again; `dossierFault` is also re-run on today's count. | Scope ruling. No award was sent on a dossier before this (BD-4 refused them), so the backfill of null affects none. | — |
| BD-DS-22 | OD-5 as built: `countedReturnComplete` holds completeness and acceptance to the scans for every award except one ACCEPTED with no `returnScanSnapshot`. Whichever act completes the return — recording it, or attaching its last scan — accepts the award in the same transaction (`acceptOnCompleteReturn`) and snapshots the scan pins. A BD-24 correction needs the scan of each Letter of Acceptance item whose day changed, or of the acceptance page if any of its fields changed. The readiness gate's "returned" item and the awards list count the same way; `instrumentReturned` (BD-17) still reads the paper. | OD-5 and BD-12 (acceptance in the act that completes the return). | — |
| BD-DS-23 | OD-6 as built: `faultsIn` gains `ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED` (only where the caller says whether one is attached, as its other optional facts). `saveDelegation` takes `recommendationVersionId` and writes the delegation, the attachment and their audit rows in one transaction. "Recorded as text before attachments existed" is a delegation saved with a text recommendation and no recommendation attachment ever; it stands on its text when edited. The last live recommendation cannot be taken off (replaced by a new version only). Until the editor has its upload, the refusal shows against the recommendation field. `delegation.test.ts` gained tests; none changed. | OD-6; FR-APR-012 says "attached". | — |
| BD-DS-24 | Signed minutes read Attached / Outstanding / "Attached once the sitting is minuted" / none for a cancelled sitting; minuting never waits on them. The requisition gate card reads the cited sitting's attachment. `liveAttachmentWhere` is the database form of `isLive`, so a list of many owners filters with the one definition instead of its own. | Plan §3 rows for FR-CTE-004 and FR-REQ-012; "no module counts rows itself". | — |
| BD-DS-25 | Copy replaced: the BD-4 notes on the exercise's Award tab, `award-form.tsx` and award `labels.ts` (`EVIDENCE_NOT_ATTACHED`, now "attach … then send"), the method's evidence and scope texts and form hints, the meeting's minutes card and editor, the award's Return drawer and attachments line, and the delegation editor's hint and list line. Each text lives in its module's `labels.ts` (new: `src/lib/people/labels.ts`). | Plan §3; codes never on a screen. | — |
| BD-DS-26 | Demo (§9): signed minutes on DEMO/CWC/1/2026, the sitting a committee gate cites (DEMO/CWC/2/2026 left outstanding); the dossier letter on `demo_sx2` with v1 withdrawn and its pin moved to v2, under a legal hold; a new `demo_sx7` (sole-agent spares, dossier numbered, nothing attached) keeps "not attached" visible; the acceptance-page scan on the accepted `demo_aw5`, whose `returnScanSnapshot` records it; a photographed recommendation (PNG) on `demo_dg3`; a SULIT scope note on `demo_sx4`; one staged, unclassified letter; three access events. The demo classes take Internal (noted as assumed), SULIT and unset. Upload rules are created only where the organisation has none. | §9. Both demo dossier exercises sit below the quotation floor, so BD-4's award callout never showed in the demo; its "not attached" lines on `demo_sx7` are what stays visible. | — |
| BD-DS-27 | Demo wipe: documents go before the sittings, exercises, awards and delegations they pin (RESTRICT keys), after every other refusal check has passed. Refused, listing them: a real record's attachment pinned to a demo document, and a real document version or hold naming a demo person — never overridden, because documents are never removed for the demo. A real document attached to a demo record is refused unless `--remove-dependents`, which takes the attachment off and keeps the document. Versions, holds, attachments and access events recorded under a demo document go with it. Blobs go only where no remaining version uses the digest. A demo class with real documents filed under it is kept, and the wipe says so. Edited upload rules are kept under a fresh id. | Plan §9, LESSONS (wipe in dependency order, refuse and list); the award wipe's check is split from its removal so nothing is removed before every refusal has been decided. | — |
| BD-DS-28 | An accepted award is not re-judged on its scans: the readiness gate's "returned" item, the awards list and a BD-24 correction's completeness read the paper return once the award is ACCEPTED (`returnReadsComplete`); its scans were judged at acceptance and are kept in its snapshot. A scan withdrawn later shows on the Return tab's scan line, and its last live scan still cannot be taken off. Corrects BD-DS-22, which counted scans for accepted awards too. | Plan §3 "accepted awards are never re-judged"; LESSONS (judged records render from what they were judged on). | — |
| BD-DS-29 | Read seams for the UI builder in `src/lib/documents/read.ts`: `ownerPanel` (per purpose the owner's state with the words why, and every attachment with its document, pinned and newer version and download decision), `documentDrawer` (versions, where attached, holds, access events, trail), `stagedDocuments`, `standingHolds`, `uploadContext` (classes, types, cap, ceiling, the refusals in words). `owner-facts.ts` is the one mapping from an owner's rows to the facts the rules judge, used by the locked acts and these reads alike. | Rule 3: components never restate a rule; a disabled action and a refused one must give the same reason. | — |
| BD-DS-30 | The demo wipe has an exit for documents added through the screens: in a demo environment every upload names a demo person, so a document that is not demo data but names one (a version recorded for, or a hold placed or released by, a demo person) is refused, listed, and removed whole with `--remove-dependents` (versions, attachments, holds, access log, unused bytes), as BD-27 removes requisitions raised by demo people. Still always refused: a real record's attachment pinned to a demo document, and such a document attached to a real record. A real document naming no demo person is only taken off demo records. Corrects BD-DS-27, which left no way out. | LESSONS: every refusal names what to do; the first test upload would otherwise have blocked the wipe for good. | — |
| BD-DS-31 | Security audit M-1. A download's name is built, never cut: the uploader's name cleaned (controls, quotes, slashes, zero-width and bidirectional marks out), its last extension dropped, the stem trimmed **by code point** to leave room, then "." and the extension of the **sniffed media type** (`EXTENSION_FOR`, else `bin`). The uploader's extension is never reused, so no length of name can leave `.hta` or `.exe` last. The served name is at most 180 code points. A name over **255 code points** is refused at upload (`NAME_TOO_LONG`, 422, logged as refused, offered name recorded) instead of cut by the service; the service refuses it too, as the route can be bypassed by another caller. The 255 is a product limit (the column has none). The refused-upload log's `offeredFilename` is still cut at 255, by code point: it is a log field, not a stored name. | A silent cut changes which file the name says it is. | — |
| BD-DS-32 | Security audit M-2. The download response, headers included, is built before `DOWNLOADED` is logged; a failure to build serves nothing, logs nothing and answers 500. A lone surrogate in a stored name is replaced with U+FFFD before `encodeURIComponent` sees it. | An access log entry must mean the bytes were handed over. | — |
| BD-DS-33 | Security audit M-3. `POST /api/documents` refuses, before reading the organisation, the body or logging anything (403, no access event), unless `Sec-Fetch-Site` is `same-origin` or, with the header absent, `Origin` names the request's own `Host` (scheme not compared: behind a TLS-terminating proxy the portal cannot see it; `X-Forwarded-Host` is not trusted), **and** `X-Perolehan-Upload: 1` is present (set by `post-upload.ts`). A non-browser client therefore sends `Origin` and the header itself: they are a browser defence, not authentication, which arrives with sign-in. `src/lib/documents/request-guard.ts`. | No credential exists to withhold, so the portal's reach is ambient: any site could post to it. | — |
| BD-DS-34 | Security audit C-2. The download route exports `HEAD` as 405 (`Allow: GET`) because Next otherwise runs the GET handler, reading the bytes and logging a download for a request that fetches none. A GET with `Sec-Fetch-Site: cross-site` is refused 403 and **not logged** (logging it would hand a hostile page the flood). `same-site`, `none` and an absent header still pass, so typed addresses, bookmarks and non-browser clients keep working; a link followed from another site is refused too, and a visitor opens the file from the portal. | An `<img>` on another site must not fill the access log. | — |
| BD-DS-35 | Security audit C-3. The `filename*` form also percent-encodes `'`, `(`, `)` and `*`, which `encodeURIComponent` leaves bare and RFC 5987 does not allow. | Clients disagreed on reading them. | — |
| BD-DS-36 | Security audit C-5. `withdrawVersion` and `releaseLegalHold` look the id up within the organisation first, so another organisation's id answers exactly as a missing one. | No tenant isolation middleware yet (AGENTS.md): each lookup carries the organisation itself. | — |
| BD-DS-37 | Security audit C-1, memory. The upload parses the multipart **once**, from the request stream through a counting bound (`limitBody`), instead of joining the chunks into one array and copying that into a Blob for a second parse; the file is judged on `file.size` and its first `SNIFF_BYTES` before the whole file is copied out, so a refused file is never copied; the Postgres driver writes a `Buffer` view over the same memory and reads the driver's own array back. **Per-request memory multiple, remaining**: an upload holds about **4x** `DOCUMENT_MAX_BYTES` (parsed part, the one copy, the driver's write buffer; a Node script measured the first two at 2 to 3x against 7 to 8x before; the driver copy is an estimate), a download about **3x** (estimate, not measured). Documented beside `DOCUMENT_MAX_BYTES` in `.env.example`. `readBounded` is no longer used by the route; it and its tests stay. **Concurrency cap**: `DOCUMENT_MAX_CONCURRENT_UPLOADS` (default 3) and `DOCUMENT_MAX_CONCURRENT_DOWNLOADS` (default 6), counted in the process, over it 503 with `Retry-After: 5` and **no access event** (checked after the same-origin test, so a cross-site request never takes a slot). Chosen because the deployment is one Node process per instance and the cost is memory in that process, so a per-process count is the right measure; with several instances the operator multiplies, since no shared store exists. A download's slot is released when its response is **built**, not when the client has finished reading it: the cap bounds how many files are being read, hashed and built at once, **not** how long a slow client keeps a finished response's bytes in memory, so many slow readers can still hold more than the cap implies (no timeout on a slow reader is built). Of the multiples above, only the parse (first two copies of an upload) was measured; the driver's write copy and every download figure are estimates. The defaults are small on purpose: with the 50 MB example ceiling they come to about 1.5 GB worst case, **before** the application's own ~0.5 GB. | A handful of large files at once must not exhaust a small host; an operator must be able to size it. | Defaults are a judgement, not a measurement on the target host. |
| BD-DS-38 | Security audit C-7. `next.config.ts` `headers()` sets on every path `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'` (that directive only: a fuller policy would have to allow what Next injects and the dev server's eval, and the point here is framing). The rules are `headerRules()` in `src/lib/security-headers.ts`. Found while checking: a header set in `next.config.ts` **replaces** the same header a route sets itself, so the general policy had silently replaced the download route's `default-src 'none'; sandbox`; the download path has its own later rule carrying that policy (plus `frame-ancestors 'self'`), shared with the route as `DOWNLOAD_POLICY`. | Clickjacking and framing of the portal; the sandbox on served files must not be lost to a global header. | `Referrer-Policy: same-origin` sends no referrer cross-origin, so an outbound link carries none. |
| BD-DS-39 | Review must-fix 1. Every attach (`attachDocument`, `attachRecommendation`) takes the version through `lockVersion` (`src/lib/documents/lock.ts`): read only the version's document id, `lockDocument`, then re-read the version (`withdrawnAt`, `versionNo`, `sha256`) and judge that read. `attachNewVersion` locks the pinned document before it reads the version it moves to. `lockDocument` moved to `lock.ts` (re-exported from `service.ts`). | Withdrawal takes the document lock; a version read before the lock could be withdrawn while the attach waited, and then pinned. | — |
| BD-DS-40 | Review must-fix 2. A delegation recorded as text before attachments also loses that standing on an edit that changes the grantor (`GRANTOR_CHANGED`), the office delegated from (`OFFICE_CHANGED`) or moves the start earlier (`START_MOVED_EARLIER`), besides the four ruled changes; a later start does not. `LOCKED_DELEGATION_SELECT` reads the grantor, office and start under the lock; the editor's note names the new changes. | FR-APR-012: the recommendation must come from the absent holder of that office; text recorded for one grantor, office or period says nothing of another. Widens the 2026-10-01 legacy ruling's list. | PO |
| BD-DS-41 | Review should-fix 4. `bytesToMegabytes` rounds to the nearest thousandth (half up) instead of flooring, so it inverts `megabytesToBytes` exactly for every three-decimal value; a positive size below half a thousandth shows as 0.001, never 0. Loop-tested 0.001 to 100 MB, the top of the range and a spread between. | Reopening Upload rules and saving lowered the cap (0.1 to 0.099; 0.001 to 0, unsaveable). | — |
