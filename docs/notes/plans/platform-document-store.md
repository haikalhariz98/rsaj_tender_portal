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
- `DocumentClass` + `classification DocumentClassification?` (PUBLIC/INTERNAL/SULIT; null = not set), `retentionTrigger
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
sniff, size, hash; one transaction creates the STAGED document, version, blob and audit row; returns `{ versionId, sha256 }`. **Attach**
is the owner module's server action taking `versionId`: it locks the owner row (`FOR UPDATE`, existing lock helpers), re-runs
`attachFault` on locked data, writes attachment + audit. **Download** `GET /api/documents/versions/[id]` runs `downloadDecision`,
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
