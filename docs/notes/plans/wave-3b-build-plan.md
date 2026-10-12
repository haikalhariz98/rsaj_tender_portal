# Wave 3b — online sealed bids (SR-13): build plan

**Status:** Proposed. Revised 2026-10-12 to match the revised ADR 0036, rulings 20a–20q and the wave 3b security review. Not started.

- **Design:** ADR 0036 (`docs/notes/architecture/0036-online-sealed-bids.md`).
- **Threats:** `docs/notes/plans/signin-threat-model.md` §G.
- **Rulings:** 11, 12a, 17c, 18–25 and 20a–20q (`docs/notes/design/0003-sourcing-requirements-v2.md` §6).
- **Spec:** FR-BID-001/002/003/005/006/007, NFR-SEC-003, NFR-SEC-007, FR-VND-013, FR-EST-007/009/010, FR-OPN-002/003.

**Go-live.** Nothing goes LIVE before ADR 0036 D1's conditions are recorded. The demo runs under DEMONSTRATION.

**What wave 3c builds on top:**
- the SR-14 matrix;
- the SR-15 downloads.

This plan supplies the online unseal, the per-officer downloads and the online finalise that 3c's screens call (§3).

**Open defaults.** Where the ADR's Q13–Q17 are still open, this plan builds the ADR's stated default. Each such step names its Q, so a
ruling the other way is a local change.

## 0. What the code says today

- **The paper register.**
  - `BidEnvelope` (COUNTER/POST/COURIER/BOX) has `receivedByPersonId` and `markings` required.
  - `src/lib/bids/sealed.test.ts` holds the ADR 0016 scans.
  - `voidSaleFault` (`src/lib/window/sale.ts`) refuses `ENVELOPE_HELD` only for an envelope that names a party. It therefore never fires
    before the opening.
- **There is no crypto module.** scrypt exists for passwords (`src/lib/auth`).
- **The opening counts to two.**
  - `src/lib/opening/unseal.ts` counts to two in four places: `opensTheBox`, `SITTING_AUTHORISED`, `unsealState` and `lapsedByAdjourning`.
  - It requires `BOX_NOT_LOCKED`.
- **`OpenedBid.priceAsRead` is non-null.**
  - Its writers are `openEnvelope`, `recordAlternative` and `correctAsRead`, pinned by `src/lib/opening/sealed.test.ts`.
  - `alternativeStatus` uses `AlternativeConsideration` (CONSIDERED | NOT_CONSIDERED).
- **The roster** is `ExerciseOpeningOfficer` and `roster.ts`.
  - It needs exactly `panelSize` officers and refuses administrators.
  - `rosterChange` returns FREE, CONTROLLED or REFUSED.
- **Bid standing.**
  - `holdsBidStanding` lives in `src/lib/portal/bids/purchase.ts` (`standsHere`).
  - The opening folds in the simulator through `saleFactsOf` (`src/lib/opening/repo.ts:66`).
  - The purchase's invitee check is in `src/lib/portal/bids/checks.ts`.
- **The document store.**
  - It is buffer-based (`BlobStore`).
  - Its `ScanResult` is a TypeScript union in `src/lib/documents/store/types.ts` (NOT_SCANNED | CLEAN | THREAT) and is read store-wide.
  - Its scanner is `NotConfiguredScanner`.
- **The supplier upload pattern** is `src/app/supplier/registration/upload/route.ts`.
- **The password before an act.** The 4e projects submit runs `confirmSupplierPassword` *before* the act's transaction, so a wrong password
  counts towards the lockout. The act then spends the step-up moment, under `@@unique([sessionId, stepUpAt])`.
- **The grant lists** are `APPEND_ONLY_TABLES` and `CONTENT_TABLES` in `src/lib/auth/db-role.ts`.

## 1. Contracts (step 3 writes these verbatim)

### 1.1 `src/lib/sealing/types.ts`: the crypto contract

```ts
export type Bytes = Uint8Array;

export type SealPurpose =
  | "OFFICER_KEY" | "SHARE" | "SHARE_RELEASE"
  | "FILE_DEK" | "FILE_META" | "FILE_BODY"
  | "MANIFEST_DEK" | "MANIFEST"
  | "DECLARATION_DEK" | "DECLARATION"
  | "ESTIMATE_DEK" | "ESTIMATE"
  | "OFFICER_GRANT";   // a DEK re-sealed to one named officer at the unseal (ADR 0036 D10)

/// Canonical AAD: "v1|purpose|organisationId|exerciseId|keyId|recordId|partKey" (partKey "" when absent). Ids are cuid; "|" is asserted absent.
export interface AadContext { purpose: SealPurpose; organisationId: string; exerciseId: string; keyId: string; recordId: string; partKey?: string }

/// RFC 9180 base mode, DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / AES-256-GCM. info = aad = canonical AAD.
/// Node 24 has no HPKE: composed from diffieHellman (X25519) and createHmac (LabeledExtract / LabeledExpand).
export interface HpkeSealed { enc: Bytes /* 32 */; ct: Bytes /* ciphertext || 16-byte tag */ }
export interface GcmSealed { iv: Bytes /* 12 */; ct: Bytes; tag: Bytes /* 16 */ }

export interface ScryptParams { log2N: number /* 17 */; r: number /* 8 */; p: number /* 1 */; salt: Bytes /* 16 */ }
/// pepperId null: wrapped without a pepper (DEMONSTRATION only). KEK = scrypt(pepper ? HMAC-SHA256(pepper, passphrase) : passphrase).
export interface WrappedKey { params: ScryptParams; pepperId: string | null; sealed: GcmSealed }

export interface X25519KeyPair { publicKey: Bytes; privateKey: Bytes }
export class SealError extends Error { constructor(readonly code: "TAG" | "LOW_ORDER" | "FORMAT" | "LENGTH") { super(code); } }

export declare function generateX25519(): X25519KeyPair;
export declare function publicOf(privateKey: Bytes): Bytes;
export declare function hpkeSeal(recipientPublic: Bytes, plaintext: Bytes, aad: AadContext): HpkeSealed;
export declare function hpkeOpen(recipientPrivate: Bytes, sealed: HpkeSealed, aad: AadContext): Bytes;          // throws SealError
export declare function gcmSeal(key: Bytes, plaintext: Bytes, aad: AadContext): GcmSealed;
export declare function gcmOpen(key: Bytes, sealed: GcmSealed, aad: AadContext): Bytes;                          // throws SealError
export declare function wrapKey(privateKey: Bytes, passphrase: string, pepper: { id: string; key: Bytes } | null, aad: AadContext): Promise<WrappedKey>;
export declare function unwrapKey(w: WrappedKey, passphrase: string, pepper: { id: string; key: Bytes } | null, aad: AadContext): Promise<Bytes | null>; // null: wrong passphrase, or the wrap's pepper is not the one given
export declare function splitKey(k: Bytes, n: number): Bytes[];                                                  // n-of-n XOR, n >= 2
export declare function combineShares(shares: readonly Bytes[], expectedPublic: Bytes): { ok: true; k: Bytes } | { ok: false; fault: "SHARE_COUNT" | "SHARE_MISMATCH" };
export declare function fingerprint(publicKey: Bytes): string;
export declare function zero(...buffers: Bytes[]): void;
```

### 1.2 `src/lib/bids/online/types.ts`: the domain contract

```ts
import type { PeriodUnit } from "@/generated/prisma/enums";

export type SubmissionChannel = "PAPER" | "ONLINE";
export type OnlineSubmissionMode = "DEMONSTRATION" | "LIVE";
export type OnlineBidKind = "BID" | "ALTERNATIVE";
export type OnlineBidStatus = "SUBMITTED" | "REPLACED" | "WITHDRAWN" | "OPENED";
export type OnlineBidFileState = "DRAFT" | "SUBMITTED" | "DISCARDED";
export type GrantUse = "OPENING_CHECK" | "FINALISE";
/// What a stored bid file may read: THREAT and ERROR are refused and never stored (D6). NOT_SCANNED only under DEMONSTRATION with no scanner.
export type StoredScan = "CLEAN" | "NOT_SCANNED";

export interface BidPartRule { packPartId: string; label: string; mandatory: boolean; returnedByBidder: boolean; acceptedMediaTypes: string[]; maxBytes: string; openingCheck: boolean }
export interface OnlineBidRules { v: 1; frozenAt: string; parts: BidPartRule[] }

/// Money is a decimal string, at most 2 places, > 0; never a float (`parseDeclaration`).
export interface Declaration { price: string; completionPeriod: number; completionUnit: PeriodUnit }

/// Sealed at submit. parentOnlineBidId is the parent AT SUBMISSION; the row's current parent may since have moved (ADR 0036 D7).
export interface Manifest {
  v: 1; exerciseId: string; onlineBidId: string; supplierId: string; supplierAccountId: string;
  kind: OnlineBidKind; parentOnlineBidId: string | null; replacesOnlineBidId: string | null;
  files: { fileId: string; packPartId: string; cipherSha256: string }[];
  declarationCipherSha256: string;
}
export interface FileMeta { v: 1; filename: string; mediaType: string; plainSha256: string; plainBytes: string }

/// "Your receipt. It records what the portal told you." Never "signed" or "proof" (20j).
export interface Receipt { exerciseId: string; sequence: number; receivedAt: string; late: boolean; keyFingerprint: string; receiptDigest: string; demonstration: boolean; alternativeNotConsidered: boolean }

export type SubmitFault =
  | "CHANNEL_NOT_ONLINE" | "ONLINE_NOT_SET" | "ONLINE_NOT_ALLOWED" | "NOT_PUBLISHED" | "CANCELLED" | "KEY_NOT_LIVE"
  | "NO_LIVE_SALE"               // saleStands (17c, 20m)
  | "NOT_ON_INVITEE_LIST"        // matches the purchase's check (20m)
  | "LIVE_BID_HELD"              // a second main bid while one stands, or a late bid beside a live in-time one (FR-BID-005)
  | "REPLACE_AFTER_CLOSING" | "NOTHING_TO_REPLACE"
  | "ALTERNATIVES_NOT_STATED"    // defensive only: publication refuses while unset (20h)
  | "PARENT_NOT_YOUR_LIVE_BID"   // a named parent that is not the supplier's own live bid (20h)
  | "LATE_CLOSED"                // late submission ends when the main opening is started (20b)
  | "PRICE_INVALID" | "PERIOD_INVALID" | "UNIT_NOT_SET"
  | "FILE_NOT_YOURS" | "FILE_NOT_DRAFT" | "PART_UNKNOWN" | "NO_FILES"
  | "TOO_MANY_SUBMISSIONS";      // per supplier per exercise (20e)
export type WithdrawFault = "NOT_YOURS" | "NOT_LIVE" | "AFTER_CLOSING" | "CANCELLED" | "ALTERNATIVE_NOT_LINKED";
export type PartUploadFault =
  | "CHANNEL_NOT_ONLINE" | "ONLINE_NOT_ALLOWED" | "NOT_PUBLISHED" | "KEY_NOT_LIVE" | "FINGERPRINT_MISMATCH" | "NO_LIVE_SALE" | "NOT_ON_INVITEE_LIST" | "LATE_CLOSED"
  | "PART_UNKNOWN" | "PART_NOT_RETURNED" | "TYPES_NOT_SET" | "TYPE_NOT_ACCEPTED" | "OFFICE_REFUSED" | "SIZE_NOT_SET" | "TOO_LARGE" | "EMPTY"
  | "BODY_TOO_SLOW" | "HASH_MISMATCH" | "THREAT" | "SCAN_ERROR" | "TOO_MANY_DRAFT_FILES";
export interface SubmissionWarning { code: "MANDATORY_PART_MISSING" | "ALTERNATIVE_NOT_CONSIDERED" | "REPLACE_REUPLOADS_ALL"; packPartId?: string; label?: string }
```

### 1.3 Pure rules (one file each, each with a `.test.ts`)

```ts
// src/lib/sales/standing.ts (17c, 20m)
export function saleStands(sale: { voidedAt: Date | null; paymentChannel: "COUNTER" | "SIMULATED" } | null, simulatorAllowed: boolean): boolean;

// src/lib/sealing/switch.ts (D1, 20i, 20o, Q17)
/// `at`: PUBLISH reads the organisation's mode and both deployment flags; SUBMIT reads the exercise's frozen mode, where demoAllowed is read live
/// (20i) and liveAllowed is NOT consulted, so a published LIVE exercise keeps its pin (20i, G1). SEALED_BIDS_LIVE_ALLOWED gates issuing and publishing only.
export function onlineSubmissionAllowed(mode: OnlineSubmissionMode | null, deployment: { demoAllowed: boolean; liveAllowed: boolean }, at: "PUBLISH" | "SUBMIT"): { allowed: boolean; demonstration: boolean; fault: "ONLINE_NOT_SET" | "ONLINE_NOT_ALLOWED" | null };
export function liveIssueFaults(p: { cryptoReviewReference: string; procedureAmendmentReference: string; customerAcceptanceReference: string; scannerConfigured: boolean; liveAllowedByDeployment: boolean; pepperConfigured: boolean; publicRoleAttestation: string; deploymentHardeningAttestation: string }):
  ("REVIEW_NOT_RECORDED" | "AMENDMENT_NOT_RECORDED" | "ACCEPTANCE_NOT_RECORDED" | "SCANNER_NOT_CONFIGURED" | "LIVE_NOT_ALLOWED_BY_DEPLOYMENT" | "PEPPER_NOT_SET" | "PUBLIC_ROLE_NOT_ATTESTED" | "HARDENING_NOT_ATTESTED")[];
export function channelSettingFaults(channel: SubmissionChannel | null, online: ReturnType<typeof onlineSubmissionAllowed>): ("ONLINE_NOT_ALLOWED")[];

// src/lib/sealing/ceremony.ts (D3, D11, 20g, 20h)
export type KeyState = "AWAITING_OFFICERS" | "LIVE";
export function keyState(i: { liveOfficerRowIds: string[]; officersWithKey: string[]; liveKey: { shareHolderRowIds: string[] } | null }): { state: KeyState; missing: string[]; stale: boolean };
export function rekeyFaults(i: { submissions: number; now: Date; closing: Date | null }): ("SUBMISSIONS_EXIST" | "AFTER_CLOSING" | "CLOSING_NOT_SET")[];
export function publishSealingFaults(i: { channel: SubmissionChannel | null; online: ReturnType<typeof onlineSubmissionAllowed>; key: ReturnType<typeof keyState>; rules: BidPartRule[] | null; alternativesPermitted: boolean | null; pepperRequired: boolean; pepperConfigured: boolean }): Finding[];
export function passphraseFaults(p: string, repeat: string, minLength: number | null, equalsSignInPassword: boolean): ("MIN_LENGTH_NOT_SET" | "TOO_SHORT" | "NOT_REPEATED" | "SAME_AS_SIGN_IN")[];

// src/lib/sealing/release.ts (D10): the unseal and supplementary openings only; finalising needs no release (H3 a)
export function releasePlan(i: { namedOfficerRowIds: string[]; authorisedRowIds: string[]; actorRowId: string }): { last: boolean; forwardTo: string[] };

// src/lib/bids/online/submission.ts (D5, D7, D8)
export function parseDeclaration(raw: unknown): { ok: true; value: Declaration } | { ok: false; faults: SubmitFault[] };
export function submitFaults(i: {
  channel: SubmissionChannel | null; online: ReturnType<typeof onlineSubmissionAllowed>; published: boolean; cancelled: boolean; keyLive: boolean;
  saleStands: boolean; invitedPath: boolean; onInviteeList: boolean;
  stamp: Date; closing: Date; mainOpeningStartedAt: Date | null;          // 20b: the start, not the unseal
  liveMainInTime: boolean; kind: OnlineBidKind;
  replaces: { status: OnlineBidStatus; mine: boolean } | null;
  parent: { status: OnlineBidStatus; mine: boolean } | null | "NONE_NAMED";
  alternativesPermitted: boolean | null;
  files: { mine: boolean; state: OnlineBidFileState; packPartId: string }[]; rules: BidPartRule[];
  submissionsBySupplier: number;
}): { faults: SubmitFault[]; late: boolean; warnings: SubmissionWarning[]; alternativeNotConsidered: boolean };
/// `stamp`: the withdrawal's own database stamp, taken after its body is read and before the password check (as submit); it becomes OnlineBid.statusAt.
export function withdrawFaults(i: { mine: boolean; status: OnlineBidStatus; stamp: Date; closing: Date; cancelled: boolean; alsoWithdraw: { mine: boolean; linkedToThis: boolean }[] }): WithdrawFault[];
/// The alternatives a withdrawal touches: those named are withdrawn, the rest kept with their link cleared (20h).
export function withdrawalEffect(target: string, linked: string[], alsoWithdraw: string[]): { withdraw: string[]; clearLink: string[] };

// src/lib/bids/online/parts.ts (D6)
export function partUploadFaults(i: { rule: BidPartRule | null; sniffed: Sniffed; office: ArchiveVerdict | null; size: bigint; storeCap: bigint | null; browserSha256: string; serverSha256: string; scan: ScanResult; mode: OnlineSubmissionMode; scannerConfigured: boolean; draftFilesBySupplier: number }): PartUploadFault[];
export function storedScan(scan: ScanResult, mode: OnlineSubmissionMode, scannerConfigured: boolean): StoredScan | null;  // null: refuse

// src/lib/bids/online/receipt.ts
export function receiptDigest(i: { exerciseId: string; sequence: number; receivedAt: Date; keyFingerprint: string; manifestCipherSha256: string; declarationCipherSha256: string; fileCipherSha256s: string[] }): string;
export const RECEIPT_WORDS: { title: string; meaning: string };  // never "signed" / "proof" (scan)

// src/lib/bids/online/received.ts (ruling 18, 20l, Q16)
export function receivedView(rows: { sequence: number; receivedAt: Date; late: boolean; status: OnlineBidStatus }[], openingStarted: boolean): { count: number; standing: { ordinal: number; sequence: number | null /* null before the start */; receivedAt: Date; late: boolean }[] };

// src/lib/bids/online/roll.ts (H2)
export function receiptRoll(rows: { sequence: number; receiptDigest: string; late: boolean; status: OnlineBidStatus }[]): { v: 1; entries: { sequence: number; receiptDigest: string; late: boolean }[]; rollDigest: string };
export function myBidOpenedWords(i: { mine: { receiptDigest: string }; openedDigest: string | null; inRoll: boolean }): string; // Q14; never a verdict (ruling 25)

// src/lib/bids/online/audit-mask.ts (D9)
export function sealedAuditMask(i: { entity: string; viewer: "NAMED_OFFICER" | "OTHER"; unsealed: boolean; finalised: boolean }): { hideActor: boolean; hideSupplier: boolean };

// src/lib/sealing/grants.ts (D10)
export function downloadFaults(i: { actorIsNamedOfficer: boolean; actorIsAdministrator: boolean; unsealed: boolean; finalised: boolean; use: GrantUse; bidStatus: OnlineBidStatus }): ("NOT_NAMED_OFFICER" | "ADMINISTRATOR" | "NOT_UNSEALED" | "FINALISED_USE_DOCUMENTS" | "NOT_OPENING_CHECK_PART" | "NOT_OPENED")[];

// src/lib/sealing/substitution.ts (D11)
export function substitutionFaults(i: { change: RosterChange; incomingHasKey: boolean; departingIsActor: boolean; keyLive: boolean }): ("NOT_CONTROLLED" | "INCOMING_KEY_NOT_SET" | "DEPARTING_MUST_RELEASE" | "AFTER_CLOSING_RETENDER")[];

// src/lib/bids/online/parent.ts (D7, M2 with 20h): the unseal's parent check
export function parentReachable(sealedParent: string | null, currentParent: string | null, replacedBy: (id: string) => string | null, withdrawnClearedLink: boolean): boolean;
```

### 1.4 Schema shapes (steps 1 and 2)

Each enum value is added in its own migration. Every table carries `organisationId` with `onDelete: Restrict`.

```prisma
enum SubmissionChannel    { PAPER ONLINE }
enum OnlineSubmissionMode { DEMONSTRATION LIVE }
enum OnlineBidKind        { BID ALTERNATIVE }
enum OnlineBidStatus      { SUBMITTED REPLACED WITHDRAWN OPENED }
enum OnlineBidFileState   { DRAFT SUBMITTED DISCARDED }
enum ShareReleasePurpose  { UNSEAL SUBSTITUTION }          // no FINALISE (H3 a)
enum GrantUse             { OPENING_CHECK FINALISE }
enum GrantSubject         { FILE DECLARATION ESTIMATE }
enum StoredScan           { CLEAN NOT_SCANNED }
enum SealedAccessKind     { SHARE_SET UNLOCK_CHECK KEY_CREATED KEY_RETIRED PART_UPLOAD PART_DISCARD SUBMIT WITHDRAW AUTHORISE DOWNLOAD FINALISE SUBSTITUTION_RELEASE ESTIMATE_LODGED }
enum SealedAccessOutcome  { GRANTED REFUSED }
// added values: EnvelopeChannel.ONLINE, ReceiptSource.PORTAL, EnvelopeStatus.SUPERSEDED, ConfigurationChangeKind.BID_SEALING_POLICY

model BidSealingPolicy {                // two-person path
  id String @id @default(cuid()); organisationId String @unique
  onlineSubmission OnlineSubmissionMode?
  cryptoReviewReference String @default("");        cryptoReviewRecordedAt DateTime?
  procedureAmendmentReference String @default("");  procedureAmendmentRecordedAt DateTime?
  customerAcceptanceReference String @default("");  customerAcceptanceRecordedAt DateTime?   // 20o
  publicRoleAttestation String @default("");        publicRoleAttestedAt DateTime?; publicRoleAttestedByPersonId String?     // Q17: must-have 4, "not checked by the portal"
  hardeningAttestation String @default("");         hardeningAttestedAt DateTime?;  hardeningAttestedByPersonId String?      // Q17: must-have 5, "not checked by the portal"
  provenance Provenance?; notes String @default("")
}
// WindowPolicy.submissionChannel SubmissionChannel?
// SecurityPolicy.sealingPassphraseMinLength Int?               CHECK (NULL OR >= 12)
// SourcingExercise.submissionChannel SubmissionChannel?        backfill PAPER; pinned at create (12e); frozen at publication
// SourcingExercise.onlineSubmissionMode OnlineSubmissionMode?  frozen at publication (20i)
// SourcingExercise.onlineBidRules Json?                        frozen at publication
// SourcingExercise.publishedKeyFingerprint String?             null -> set at publication; set -> other ONLY with a PublishedKeyChange row in the same transaction (trigger)
// TenderDocumentPart.bidAcceptedMediaTypes String[] @default([])   empty = not set
// TenderDocumentPart.bidMaxBytes BigInt?                       CHECK (NULL OR > 0)
// TenderDocumentPart.openingCheck Boolean?; openingCheckProvenance Provenance?
// BidEnvelope.receivedByPersonId String?                       CHECK ((channel = 'ONLINE') = (receivedByPersonId IS NULL))
// OpenedBid.priceAsRead Decimal? @db.Decimal(18,2)             trigger: Opening.finalisedAt set only when none of its OpenedBid is NULL
// Opening.receiptRoll Json?                                    written once by startOpening for ONLINE (H2)

model OfficerExerciseKey {
  id String @id @default(cuid()); organisationId String; exerciseId String
  openingOfficerId String; personId String               // personId in ACT_SLOTS (SHARE_SET)
  publicKey Bytes                                        // KEY_MATERIAL
  wrappedPrivateKey Bytes                                // SEALED (iv||ct||tag)
  kdfLog2N Int; kdfR Int; kdfP Int; kdfSalt Bytes        // kdfSalt KEY_MATERIAL
  pepperId String?                                       // null only where the exercise's frozen mode is DEMONSTRATION (trigger)
  failedAttempts Int @default(0); lockedUntil DateTime?
  createdAt DateTime; retiredAt DateTime?; retiredReason String @default("")
}                                                        // partial unique (openingOfficerId) WHERE retiredAt IS NULL
model ExerciseSealingKey {
  id String @id @default(cuid()); organisationId String; exerciseId String
  publicKey Bytes; fingerprint String; officerCount Int
  createdAt DateTime; retiredAt DateTime?; retiredReason String @default("")
}                                                        // partial unique (exerciseId) WHERE retiredAt IS NULL; insert/retire after publication only with a PublishedKeyChange in the same transaction; none after the closing (trigger)
model PublishedKeyChange {                               // append-only
  id String @id @default(cuid()); organisationId String; exerciseId String
  fromKeyId String; toKeyId String; fromFingerprint String; toFingerprint String
  reason String; byPersonId String; at DateTime          // byPersonId in ACT_SLOTS (REKEY)
}
model ExerciseKeyShare {
  id String @id @default(cuid()); organisationId String; keyId String
  openingOfficerId String; officerKeyId String
  sealedShare Bytes?                                     // NULL only by shred: substitution, or re-key of the whole key (20g)
  createdAt DateTime; endedAt DateTime?; endedReason String @default("")
}
model ShareRelease {
  id String @id @default(cuid()); organisationId String; keyId String
  purpose ShareReleasePurpose; openingId String?; authorisationId String?; substitutionOfficerId String?
  fromOfficerKeyId String; toOfficerKeyId String
  sealedShares Bytes?                                    // NULL once used or lapsed (shred)
  createdAt DateTime; usedAt DateTime?; lapsedAt DateTime?
}
model OnlineBidFile {
  id String @id @default(cuid()); organisationId String; exerciseId String; keyId String
  supplierId String; uploadedBySupplierAccountId String  // plain identity, pinned by scan (20a)
  packPartId String
  cipherSha256 String; cipherBytes BigInt                // -> BlobContent(organisationId, sha256) RESTRICT
  sealedDek Bytes; sealedMeta Bytes; bodyIv Bytes        // bodyIv KEY_MATERIAL
  releasedDek Bytes?                                     // KEY_MATERIAL: NULL -> set only while its opening is finalising; set -> NULL only once its document link exists (M5)
  scan StoredScan
  state OnlineBidFileState @default(DRAFT)
  uploadedAt DateTime
}
model OnlineBid {
  id String @id @default(cuid()); organisationId String; exerciseId String; keyId String
  envelopeId String @unique                              // the ONLINE BidEnvelope: the one holder of sequence, receivedAt, late, closingAtJudged
  supplierId String; submittedBySupplierAccountId String // plain identity, pinned by scan (20a)
  kind OnlineBidKind
  parentOnlineBidId String?                              // current parent; moves only with the parent's REPLACED or WITHDRAWN in the same transaction (20h, M2)
  replacesOnlineBidId String? @unique
  status OnlineBidStatus @default(SUBMITTED); statusAt DateTime?
  sealedManifest Bytes; manifestDek Bytes; manifestCipherSha256 String
  sealedDeclaration Bytes; declarationDek Bytes; declarationCipherSha256 String
  receiptDigest String
}
model OnlineBidPart { onlineBidId String; fileId String @unique; @@id([onlineBidId, fileId]) }   // H2
model OfficerDekGrant {
  id String @id @default(cuid()); organisationId String; openingId String; officerKeyId String
  subject GrantSubject; recordId String                  // OnlineBidFile.id | OnlineBid.id | SealedEstimateLodgement.id
  use GrantUse; sealedDek Bytes; createdAt DateTime
  @@unique([openingId, officerKeyId, subject, recordId])
}
model SealedEstimateLodgement {
  id String @id @default(cuid()); organisationId String; exerciseId String; keyId String
  estimateVersionId String; sealedEstimate Bytes; estimateDek Bytes; cipherSha256 String
  lodgedAt DateTime; lodgedByPersonId String; supersededAt DateTime?; supersededReason String @default("")
}                                                        // insert or supersede refused after the closing: LODGEMENT_CLOSED (trigger)
model SealedAccessEvent {                                // append-only
  id String @id @default(cuid()); organisationId String; exerciseId String
  kind SealedAccessKind; outcome SealedAccessOutcome; reasonCode String @default("")
  staffPersonId String?; supplierAccountId String?; sessionId String?; sourceAddress String?
  recordId String?; at DateTime                          // never a filename (not logAccess)
}
```

**Triggers.** Each is `ENABLE ALWAYS` with its own SQLSTATE; PA010 to PA029 are reserved here.

1. **The stamp on an ONLINE `BidEnvelope` insert (H2).**
   - `receivedAt` must be whole seconds, and within `[now() − MAX_STAMP_SKEW_SECONDS, now()]`.
   - The trigger sets `closingAtJudged` from `SourcingExercise.closingAt`, and `late := receivedAt > closingAtJudged`.
   - A late insert is refused once a main `Opening` exists for the exercise.
   - `MAX_STAMP_SKEW_SECONDS` is a product constant in `limits.ts`, written as a literal into the migration. A test pins the two equal.
2. **Status moves on ONLINE `BidEnvelope` and `OnlineBid`.**
   - Moves go forward only.
   - REPLACED, WITHDRAWN and SUPERSEDED are judged **by the act's own stamp**, not by `now()`, so an act stamped at the closing second whose
     transaction commits a second later still stands (D7, FR-BID-002).
     - A replace is allowed only if the new envelope's `receivedAt` (inserted in the same transaction, bounded by trigger 1) is
       `<= closingAt`.
     - A withdrawal is allowed only if `OnlineBid.statusAt` is whole seconds, within `[now() − MAX_STAMP_SKEW_SECONDS, now()]`, and
       `<= closingAt`.
     - A cleared alternative link (trigger 6) is judged by its parent's move.
   - OPENED is refused unless the exercise has an `Opening` with the unseal being written.
3. **`OnlineBid` insert** is refused unless its envelope is ONLINE and was inserted in the same transaction (`xmin` match).
4. **Ciphertext columns are immutable.** Shreds go from set to NULL only.
5. **`releasedDek`** follows the rule in its column comment.
6. **`parentOnlineBidId`** may move only:
   - to the bid whose `replacesOnlineBidId` equals `OLD.parentOnlineBidId`, while that old parent is REPLACED (there is no `replacedBy`
     column); or
   - to NULL, while `OLD.parentOnlineBidId` is WITHDRAWN.
7. **The key and fingerprint rules** in the comments above.
8. **`LODGEMENT_CLOSED`.**
9. **`pepperId`** may be null only on a DEMONSTRATION exercise.
10. **No DELETE, and no TRUNCATE**, on any table here.

### 1.5 Routes

| Copy | Method and path | Body | Answer |
| --- | --- | --- | --- |
| public | POST `/supplier/bids/part` | multipart fields `exerciseId`, `packPartId`, `contentSha256` (browser hex), `file`; header `x-form-token` | `{ ok: true, fileId, packPartId, plainSha256, plainBytes, scan }` / `{ ok: false, code, message, messageMs }`; 401 404 408 411 413 422 429 503 |
| public | POST `/supplier/bids/part/discard` | JSON `{ exerciseId, fileId }` | `{ ok: true }` |
| public | POST `/supplier/bids/submit` | JSON ≤ 16 KB `{ exerciseId, kind, parentOnlineBidId?, replacesOnlineBidId?, fileIds, declaration, password }` | `{ ok: true, receipt, warnings }` / faults |
| public | POST `/supplier/bids/withdraw` | JSON `{ onlineBidId, alsoWithdraw: string[], password }` | `{ ok: true, withdrawn: string[], linksCleared: string[] }` |
| public | GET `/supplier/bids/[id]/submit` | — | page (GET only) |
| internal | POST `/api/opening/sealed-file` | JSON `{ openingId, fileId, password, passphrase }` | the bytes (`no-store`, `nosniff`, RFC 6266 filename) or a JSON fault |
| internal | server actions `setOfficerShare`, `checkUnlock`, `rekeyExercise`, `authoriseOnlineUnseal`, `signOnlineFinalise`, `finaliseOnline`, `releaseForSubstitution`, `lodgeSealedEstimate`, `issueBidSealingPolicy` | form with `password` (step-up); `passphrase` where it is the officer's | `FormState` |

The public posts join `SUPPLIER_BIDS_POSTS`. The submit page joins `BID_PAGE`, for GET only.

## 2. Steps

Each step leaves `npm test`, `npm run typecheck` and `npm run lint` green.

**1. data-modeler: migration A, the pins, the mode, the switch and the part rules.**
- **What it adds:**
  - `SubmissionChannel` and `OnlineSubmissionMode`;
  - `BidSealingPolicy`, with the three references and the two attestations;
  - `WindowPolicy.submissionChannel` and `SecurityPolicy.sealingPassphraseMinLength`, with its CHECK;
  - `SourcingExercise.submissionChannel`, `onlineSubmissionMode`, `onlineBidRules` and `publishedKeyFingerprint`;
  - the three `TenderDocumentPart` columns.
- **Backfill** sets every existing exercise to PAPER.
- **Done when:**
  - it applies to a copy of the demo database;
  - every existing exercise reads PAPER with no mode, and every organisation reads unset;
  - typecheck passes.

**2. data-modeler + devops-engineer: migration B, the sealed tables, triggers 1–10 and the grants.**
- **What it adds:**
  - the §1.4 models and enum values (one migration per value);
  - the nullable columns, with their CHECKs;
  - the partial unique indexes and triggers 1–10.
- **`db-role.ts` changes:**
  - `SealedAccessEvent` and `PublishedKeyChange` join `APPEND_ONLY_TABLES`;
  - a new `SEALED_TABLES` list, covering the rest, is revoked `DELETE, TRUNCATE` and added to `WITHHELD`.
- **`act-slots.test.ts` stays green, in this same step:**
  - `OfficerExerciseKey.personId` (SHARE_SET), `SealedEstimateLodgement.lodgedByPersonId` (LODGE_SEALED_ESTIMATE),
    `PublishedKeyChange.byPersonId` (REKEY) and both attestation persons go into `ACT_SLOTS`;
  - `SealedAccessEvent.staffPersonId` goes into `NOT_AN_ACT`, as "an access log, not an act".
- **Done when** `src/lib/sealing/triggers.db.test.ts`, running as an `applyAppRole` role, proves each trigger. In particular:
  - an ONLINE envelope inserted with a stamp outside the skew is refused;
  - a forged `late = false` after the closing is overwritten to true;
  - a late insert after a main `Opening` exists is refused;
  - REPLACED after the closing is refused;
  - an `OnlineBid` without its envelope in the same transaction is refused;
  - a second `OnlineBidPart` with the same file is refused;
  - a fingerprint change without a `PublishedKeyChange` is refused;
  - a key retired after the closing is refused;
  - `releasedDek` set outside a finalise is refused;
  - a parent moved other than by trigger 6 is refused;
  - a lodgement after the closing is refused;
  - the delete and truncate refusals, and a backwards status move, all fail.
  - Finally, `db:roles` reports nothing "not yet present".

**3. domain-engineer: the contracts.**
- Write §1.1, §1.2 and §1.3 verbatim, as declarations only.
- **Done when** typecheck passes and the solution-architect has reviewed them against ADR 0036.

**4. domain-engineer: the crypto module `src/lib/sealing/`, with known-answer tests.**
- **Files:**
  - `x25519.ts`, raw keys through KeyObject JWK;
  - `hpke.ts`, built from `diffieHellman` and `createHmac`, with LabeledExtract and LabeledExpand, the key schedule, and single-shot Seal and
    Open in mode 0. The AEAD is a parameter, so the AES-128 vectors run as well;
  - `aead.ts`;
  - `kdf.ts`: scrypt, `maxmem` of 256 MiB, at most 2 at once, the pepper HMAC;
  - `split.ts` and `aad.ts`;
  - `open.ts`, the only caller of `hpkeOpen` and `gcmOpen` for callers outside `src/lib/sealing/`;
  - `vectors/`, holding data only.
- **The vectors:**
  - RFC 7748 §5.2 and §6.1 (X25519);
  - RFC 5869 A.1–A.3 (HKDF);
  - RFC 7914 §12 (scrypt);
  - the AES-256-GCM cases of the McGrew–Viega GCM specification, **selected by a 96-bit IV**. Cases with any other IV length are excluded,
    because `gcmSeal` only makes 96-bit IVs;
  - RFC 9180 Appendix A.1, the AES-128-GCM suite, through the parameterised AEAD;
  - the CFRG `test-vectors.json` entry for mode 0, kem 0x0020, kdf 0x0001, aead 0x0002. It is vendored with its SHA-256 pinned in the test.
- **The CFRG entry has not been confirmed.** A partial fetch on 2026-10-12 did not reach it. If the entry is absent, the builder stops and
  reports to the solution-architect; nothing else is substituted.
- **Done when** all vectors pass, and also:
  - a low-order public key throws `LOW_ORDER`;
  - a flipped bit in `enc`, `ct`, `tag`, `iv` or any AAD field fails;
  - `combineShares` recovers *k* for n = 2, 3 and 5. The "altered share" test flips a **non-clamped** bit (not bits 0–2 of byte 0, not
    bit 7 of byte 31) and is refused with `SHARE_MISMATCH`;
  - `unwrapKey` returns null for a wrong passphrase, and for the wrong pepper;
  - the parameters are read from the wrap, not from constants.

**5. domain-engineer: the pure rules (§1.3) and the 17c merge.**
- Move `standsHere` to `saleStands`. `holdsBidStanding`, `saleFactsOf` and the door use it, and a test pins the three equal.
- **Done when** every function has its tests, including these edges:
  - the closing second is in time, and the next second is late;
  - a late bid is accepted until the main opening's start and refused from it (20b);
  - an alternative whose `alternativesPermitted` is false is accepted with `alternativeNotConsidered` (20h), and a named parent that is not
    the supplier's own live bid is refused;
  - `withdrawalEffect` clears the links it keeps;
  - `parentReachable` follows a replace chain, and refuses a jump to another supplier's bid;
  - `receivedView` hides the sequence before the start (Q16);
  - `rekeyFaults` refuses after the closing;
  - `storedScan` refuses ERROR in both modes, and NOT_SCANNED under LIVE;
  - `liveIssueFaults` lists every missing condition;
  - a scan shows that no words constant contains "signed" or "proof" near "receipt".

**6. devops-engineer: deployment.**
- **`.env.example`** gains:
  - `SEALED_BIDS_DEMONSTRATION_ALLOWED` and `SEALED_BIDS_LIVE_ALLOWED`, read live, in `src/lib/integration/sealing-deployment.ts`;
  - `BID_UPLOAD_MAX_CONCURRENT`, with a default of 3;
  - `SEALING_PEPPER` (base64, at least 32 bytes) and `SEALING_PEPPER_ID`.
- **The deployment notes** say:
  - core dumps and swap are off;
  - no proxy logs request bodies;
  - HTTPS only;
  - the scanner runs on the same host, over a local socket, with a tmpfs temporary directory and no quarantine or copy;
  - **the pepper is backed up apart from the database, and losing it loses every exercise wrapped under it.**
- **Done when:**
  - the env readers are tested ("true", "1", empty and "yes" refuse as they should; a short pepper is refused);
  - the notes list every condition.

**7. workflow-engineer + frontend-engineer: configuration.**
- **Bid sealing** (`ConfigurationChange` kind `BID_SEALING_POLICY`). The editor shows:
  - the mode;
  - the three references, each with its date;
  - the two attestations, labelled "attested, not checked by the portal";
  - the scanner and pepper states, read only;
  - `liveIssueFaults` in words;
  - the list of published ONLINE exercises still taking bids (20i).
- **Configuration › Tender documents** per part: the accepted types (the supplier-recognised list), the maximum size and the opening-check flag.
- **The window policy:** the channel, refused as ONLINE while not allowed.
- **The security policy:** the passphrase minimum.
- **Done when:**
  - each change goes through the two-person path;
  - LIVE cannot be issued with any of the three references, an attestation, the scanner, the pepper or the deployment flag missing;
  - an unset value reads "not set" in words;
  - the comparators and text snapshots are updated.

**8. workflow-engineer + frontend-engineer: the key ceremony, re-key and publication.**
- **Pinning.** Creating an exercise pins `submissionChannel` (12e).
- **Setting a share.** On Scope and estimate › Opening officers (ONLINE), each named officer sets their own share with passphrase, repeat
  and step-up.
  - `setOfficerShare` runs `passphraseFaults`, checks that the passphrase differs from the sign-in password, and wraps with the pepper if
    one is configured. Under LIVE the pepper is required.
  - The last setting creates *k*, splits it, seals the shares and zeroes it.
  - The screen says in words that every named officer is needed (20k), and that a forgotten passphrase cannot be recovered.
- **`checkUnlock`** takes step-up as well as the passphrase.
- **Roster changes before publication** retire the key and **shred all its shares** in the same transaction, as every retirement does. A
  controlled change after publication is step 17.
- **`rekeyExercise`** (20g, 20p). It is allowed only by `rekeyFaults`: no submission, and before the closing. In one transaction it:
  - retires the key and **shreds every share of the retired key**;
  - discards drafts under it;
  - after publication, writes a `PublishedKeyChange` and re-freezes `publishedKeyFingerprint`;
  - marks a lodged estimate as needing re-lodging.
  - The opportunity shows the fingerprint's history. The supplier's submit page says that drafts were discarded because the key changed.
- **Publication.** `window/publish.ts` adds `publishSealingFaults`, which covers `alternativesPermitted` and the pepper under LIVE.
  Publication freezes the channel, the mode, the rules and the fingerprint.
- **Done when:**
  - publish refuses, in words, in each case: no key, a stale key, the mode unset, a rule unset, alternatives unstated;
  - a DB test publishes n = 2 and then re-keys before any submission: the old shares read NULL, and the change row exists;
  - a re-key after the closing, or with a submission, is refused;
  - no audit JSON holds a secret (a DB test).

**9. api-engineer: part upload and discard.**
- **The route** follows the registration upload pattern:
  - the guard first; refusals are logged to `SealedAccessEvent` only after the session check, never through `logAccess`;
  - the deployment limiter, plus **one in flight per supplier**;
  - 411 without a length; the length held to the part's `maxBytes`;
  - `readBounded` with a deadline and a minimum rate (`BID_BODY_DEADLINE_SECONDS` and `BID_BODY_MIN_BYTES_PER_SECOND` in `limits.ts`;
    408 `BODY_TOO_SLOW`);
  - the shared recogniser (extracted, not copied), then the scan, then `storedScan` (ERROR and THREAT refuse);
  - `sha256Hex` compared with the `contentSha256` field;
  - the live key's fingerprint compared with `publishedKeyFingerprint`;
  - seal, `blobStore().put`, `OnlineBidFile` DRAFT, audit (ids and cipher digest only), `SealedAccessEvent`, then zero the buffers.
- **The store-wide scan result.** `ScanResult` in `src/lib/documents/store/types.ts` gains ERROR. Every switch on it is made exhaustive across
  the store, the document paths and the supplier release (SEC-5), and a configured scanner that throws returns ERROR, never NOT_SCANNED (M3).
- **Caps.** `MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE` applies. The BUSY words say to retry, and that the submission's stamp decides lateness (20e).
- **Done when** the handler test walks:
  - the guards;
  - each refusal, including a stub scanner returning ERROR under LIVE and under DEMONSTRATION, and a slow body;
  - another supplier's exercise, which answers 404;
  - a second concurrent upload by the same supplier, which answers BUSY;
  - and shows that the blob does not contain the plaintext.

**10. api-engineer: submit, replace and withdraw.**
- **The submit sequence:**
  1. Read the bounded JSON (16 KB).
  2. Take the **stamp** from `SELECT date_trunc('second', now())`.
  3. Run `confirmSupplierPassword` on its own committed connection. A wrong password counts.
  4. The act's transaction takes `lockExercise` and `lockEnvelopeRows`. It reads the main `Opening` start (20b), `saleStands`, the invitee
     list, the files, the parent and the replaced bid, then runs `parseDeclaration` and `submitFaults`.
  5. It writes the ONLINE envelope (trigger 1 owns `late`), the `OnlineBid` with the manifest, the declaration and `receiptDigest`, and the
     parts (DRAFT→SUBMITTED).
  6. On a replace: the old bid becomes REPLACED, its envelope SUPERSEDED, and live alternatives are re-pointed.
  7. It writes the SIGNED `ActAttribution`, the audit row and the `SealedAccessEvent`.
- **Withdraw** works the same way, with `withdrawalEffect`. Its stamp is taken after the body is read and before the password check, and is
  written as `statusAt` (trigger 2).
- **The void guard (H1).** Do **not** add `OnlineBid` to `voidSaleFault`'s `holdsEnvelope` reading, in this step or any other (Q13).
- **Done when:**
  - the stamp falls at the closing second and is in time; one second after, it is late;
  - a late bid after the main opening has started is refused (`LATE_CLOSED`);
  - an alternative is **recorded, and marked Not Considered at the unseal, where `alternativesPermitted` is false**;
  - a named parent that is not the supplier's own live bid is refused;
  - a replace after the closing is refused;
  - concurrent submits by one supplier leave one live bid;
  - a wrong password still increments the lockout counter;
  - the receipt digest recomputes;
  - the audit JSON holds no declaration, filename or plain hash;
  - **the void register answers identically for every buyer before the opening, with and without online submissions** (a DB test over
    `voidSaleFault` and `voidRefusalNote`);
  - the handler test walks the guards.

**11. frontend-engineer: the supplier screens.**
- **`/supplier/bids/[id]/submit`:**
  - the parts, with their accepted types and size in words;
  - the browser hash, sent as `contentSha256`;
  - the declared fields (price kept as a string);
  - the password;
  - Submit or Replace, saying that a replace re-uploads every part;
  - a note before an alternative is submitted where it will not be considered;
  - the receipt with Print, in the 20j words;
  - the DEMONSTRATION banner, and the D13 claims.
- **My Bids:**
  - each submission's sequence, stamp, status and receipt digest;
  - Withdraw, listing the linked alternatives with tick boxes;
  - after the opening, `myBidOpenedWords` (Q14).
- **Done when:**
  - the ui-guidelines-reviewer has compared these screens with `/supplier/bids/[id]`;
  - `check-ui` passes;
  - a text snapshot is taken;
  - no arithmetic runs in a component.

**12. workflow-engineer + frontend-engineer: Received, the envelope readers and the audit mask.**
- **Received:** `receivedView` (count, then ordinal, stamp and late flag; the sequence only after the start; Q16).
- **The envelope readers** handle SUPERSEDED and online WITHDRAWN (no `BidWithdrawal`):
  - `finaliseFaults` (`ENVELOPE_UNOPENED`, `WITHDRAWAL_UNRESOLVED`);
  - `withdrawalsResolved`;
  - `bidGate`;
  - `count.ts`;
  - the received section.
- **The audit mask:** `sealedAuditMask` in both audit views, Configuration › Audit and History.
- **Done when:**
  - a scan shows that only the step 10 stores and the step 13 unseal select the D9 identity columns. **That identity-column scan is pinned
    here (20a).**
  - Received carries no supplier field;
  - each envelope reader is tested with one bid of each status;
  - the audit mask is tested before the unseal and after finalising.

**13. workflow-engineer: the online unseal.**
- **`startOpening` for ONLINE:**
  - builds the panel from the roster;
  - skips the box steps;
  - reads `ESTIMATE_NOT_LODGED` from `SealedEstimateLodgement`;
  - is refused until `MAX_STAMP_SKEW_SECONDS` after the closing (`SKEW_NOT_ELAPSED`, in words), so no in-time act can still commit after the roll;
  - writes `Opening.receiptRoll` with `receiptRoll()`.
  - After this, trigger 1 refuses any late insert.
- **`authoriseOnlineUnseal`** takes step-up and the passphrase.
  - Four places in `unseal.ts` take the roster's n for ONLINE, and stay at 2 for paper: `opensTheBox`, `SITTING_AUTHORISED`,
    `unsealState` (AWAITING between 2 and n−1) and `lapsedByAdjourning`. The count is passed in, never a literal.
  - A non-last authorisation forwards through `ShareRelease`.
- **The last authorisation:**
  - `combineShares`;
  - opens the manifest of each SUBMITTED **in-time** bid and checks the supplier, digests, AAD and receipt digest, with the parent through
    `parentReachable`;
  - resolves the party;
  - records the findings;
  - creates `OpenedBid` with the price NULL and `alternativeStatus` set;
  - sets OPENED;
  - writes `OfficerDekGrant` for each named officer: OPENING_CHECK for opening-check files; FINALISE for the other files of opened bids,
    each declaration and the estimate;
  - shreds the releases and zeroes *k*.
- **Lapsing** shreds the releases (C-2).
- **A supplementary opening** follows the same pattern for its one admitted late bid.
- **Done when** the DB tests show:
  - n = 2 and n = 3 end to end, the third officer not refused;
  - a tampered manifest blocks;
  - REPLACED and WITHDRAWN bids are never opened, and **late bids' manifests are not opened at the main unseal** (a spy on `open.ts`);
  - a late bid admitted by the committee opens at a supplementary opening;
  - an administrator is refused and the refusal logged;
  - the closing second is refused;
  - `opening/sealed.test.ts` admits the online writer.

**14. api-engineer: the officer's download.**
- **`/api/opening/sealed-file`** runs on the internal copy only:
  - `assertSameOrigin`, `requireStaff`, **`stepUp`** and the passphrase;
  - `downloadFaults`, which serves OPENING_CHECK grants only;
  - unwrap, open the grant, open the blob and the meta, check `plainSha256`;
  - stream the file;
  - log a `SealedAccessEvent`.
- **Done when** the handler test covers:
  - a non-officer, an administrator, before the unseal, a FINALISE grant, after finalising;
  - a wrong password and a wrong passphrase, each counting;
  - a locked key;
  - each refusal logged, after the session check.

**15. workflow-engineer: the online finalise (H3 option a; M5).**
- **`signOnlineFinalise`:** each named officer signs, with step-up.
- **`finaliseOnline`:** any one named officer, with step-up and passphrase, after every signature.
  - **First, outside the transaction:** decrypt-and-discard every opened file through the actor's grants, one at a time, to verify every GCM
    tag. A failure blocks, in words.
- **Then, in the existing finalise transaction, in this order** (the triggers depend on it):
  1. the faults are checked;
  2. declarations → `priceAsRead`, `completionPeriod` and `completionUnit`;
  3. the estimate → `estimateLodgedAmount`, and the C-1 lodged-versus-retained check;
  4. the snapshots are frozen and `Opening.finalisedAt` is set (the NULL-price trigger fires here);
  5. files → `releasedDek` (its trigger requires `finalisedAt` already set).
- **After commit:** `moveReleasedFiles` processes files in bounded batches.
  - Each file runs under `pg_advisory_xact_lock(fileKey)`.
  - The document and its owner link (unique `onlineBidFileId`, a new owner kind with an X-6 CHECK rebuild) are written in one transaction.
  - `releasedDek` is shredded once the link exists.
  - A reader of an unmoved file triggers its move.
- **Done when:**
  - n = 2 finalises with one officer's passphrase after both signatures;
  - no price exists before the finalise;
  - a corrupt blob blocks the finalise before it commits;
  - an interrupted mover resumes without duplicates, and two movers do not double-store;
  - every `releasedDek` reads NULL once all files are moved;
  - the trigger refuses a finalise with a NULL price;
  - writing `releasedDek` before `finalisedAt` is refused.

**16. workflow-engineer: the sealed estimate lodgement.**
- **`lodgeEstimate` for ONLINE** writes `SealedEstimateLodgement` under the live key.
- **After a re-key** (20g), the lodging officer re-lodges **the same version** by their own act, with a reason. The server never does it
  from the retained copy.
- **`LODGEMENT_CLOSED`** applies after the closing.
- **Done when:**
  - the paper BOX scan is unchanged;
  - `ESTIMATE_NOT_LODGED` reads both channels;
  - a re-lodgement leaves the lead check unchanged for the same version;
  - a lodgement after the closing is refused;
  - no plain figure exists before the finalise.

**17. workflow-engineer + frontend-engineer: substitution and deactivation.**
- **Substitution:** the incoming officer sets their share, then `releaseForSubstitution` (the departing officer, with step-up and
  passphrase) transfers the share and shreds the old row.
- **Deactivation:**
  - before the unseal, it lists the exercises at risk and requires a reason;
  - **between the unseal and finalising**, deactivating a named officer of that opening needs a second approver through the existing
    two-person path (ADR 0036 D11, review H3 option b).
- **Done when:**
  - a DB test substitutes and then unseals;
  - the deactivation screen lists the exercises at risk;
  - a one-person deactivation of an officer between the unseal and finalising is refused, and the two-person path succeeds.

**18. data-migration-engineer: the demo.**
- **Only in `demo:load` on a fresh database (12c).** It sets:
  - DEMONSTRATION;
  - the ONLINE channel;
  - the part rules, with the three seeded opening-check parts (ruling 23);
  - the passphrase minimum;
  - `alternativesPermitted` on the demo exercise.
- **Then, through the product's own acts:**
  - the demo officers set their shares (demo passphrases, printed in the demo guide; no pepper);
  - two suppliers buy and submit, one of them replacing;
  - one late bid;
  - one alternative.
- **On an already-loaded database it writes no configuration.**
- **Done when:**
  - Received shows a count of 2 standing plus 1 late;
  - the demo officers can unseal, and one of them can finalise;
  - a re-run writes no configuration.

**19. test-engineer: the scans and cross-cutting tests.**
- **`sealed.test.ts` (SR-13, ruling 20) asserts:**
  - Bytes columns are exactly `SEALED_COLUMNS` plus `KEY_MATERIAL_COLUMNS` (`publicKey`, `kdfSalt`, `bodyIv`, `releasedDek`), each with
    its reason;
  - there is no Decimal;
  - the name regex `/price|amount|period|filename|name|media|plain|figure|total/i` matches no column on the sealed tables;
  - the D9 identity-column list is pinned (20a);
  - `hpkeOpen` and `gcmOpen` are called only from `open.ts`;
  - FINALISE grants are read only by `finaliseOnline`.
- **Administrators are refused** at every sealed entry point (one table-driven test).
- **`surface.test.ts`** covers the four posts on the public copy, the download answering 404 there, and the page answering GET only.
- **No handler logs a body or buffer.**
- **No component, words constant or receipt calls itself "signed" or "proof".**
- **Done when** all of these pass, and the paper scans are unchanged (diff-checked).

**20. security-auditor: review.**
- Walk threat model §G against the tree.
- Assemble the outside-review pack:
  - ADR 0036;
  - §1.1 and the vectors;
  - D3;
  - D13;
  - the recovery options (re-key-and-resubmit, k-of-m);
  - the blinded supplier link;
  - signed receipts.
- **Done when** the log entry exists, and every NOT MET item is in the backlog.

**21. docs-writer: the record.**
- Decisions-log entries for the build decisions, with Q1–Q12 cited as ruled (20a–20o) and Q13–Q17 as open.
- ADR 0016's status gains a line: "superseded for exercises pinned ONLINE by 0036".
- Comparators and snapshots updated.
- **Done when** the text snapshots before and after lose no paper field.

**Order:** 1 → 2 → 3 → (4 ∥ 5 ∥ 6) → 7 → 8 → (9 → 10) ∥ 16 → 11 → 12 → 13 → 14 → 15 → 17 → 18 → 19 → 20 → 21.

## 3. What wave 3c receives

- **`OpenedBid`** for in-time online bids, with the party, the name, the findings, `alternativeStatus` and `priceAsRead` NULL until
  finalising.
- **The SR-14 matrix:**
  - a column per opened bid and a row per opening-check part;
  - the cell download (step 14);
  - the existing tri-state answers, initials and verdict.
  - Each column shows the receipt digest and the plain hashes.
- **`signOnlineFinalise` and `finaliseOnline`**, which write the figures that SR-15's frozen snapshots read. No 3c screen reads a price
  before then (3c adds a scan).

## 4. Questions

- **Ruled:** Q1–Q12, by 20a–20l, plus 20m–20o. **Referred to the founder with the outside review:** re-key-and-resubmit (20f), k-of-m
  (20k) and the blinded supplier link (20a).
- **Open, with the defaults built here:**
  - **Q13 (H1 and 17b):** the reversal does not read online bids before the opening.
  - **Q14 (My Bids against ruling 25):** "your receipt digest was the one opened".
  - **Q15 (H3 option a against ruling 20):** after the unseal, one officer cryptographically, all officers by signature.
  - **Q16 (ordinal against ruling 18's "sequence"):** the ordinal is shown before the start.
  - **Q17 (the LIVE additions):** the deployment flag, the pepper and the attestations for must-haves 4 and 5.
  - **Q18 (logging):** only signed-in actors' attempts are logged.
