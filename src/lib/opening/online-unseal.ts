/**
 * What the last authorisation of an online unseal checks and decides (ADR 0036 D7, D10, H2, H3 option a; ruling 20t; wave 3b step 13). Pure: the store reads the rows and does the decryption;
 * this file judges what came out, so the rules are tested without a database or a key.
 *
 * Only a SUBMITTED, in-time bid in the frozen roll is opened. A late bid waits for a supplementary opening, a replaced or withdrawn one is never decrypted. Each opened bid's manifest is
 * checked against its own row (its supplier, account, kind, files, digests and receipt digest), against the roll frozen at the opening's start, and, for an alternative, its parent
 * (`parentReachable`). Any mismatch blocks the whole unseal, in words that name the receipt's number and never a supplier, a price or a code.
 */

import { createHash } from "node:crypto";

import { parentReachable } from "@/lib/bids/online/parent";
import { receiptDigest } from "@/lib/bids/online/receipt";
import type { BidPartRule, Manifest, OnlineBidKind, OnlineBidStatus } from "@/lib/bids/online/types";

export type OnlineUnsealFault =
  | "BID_MANIFEST_DIGEST" | "BID_DECLARATION_DIGEST" | "BID_MANIFEST_BINDING" | "BID_PARENT" | "BID_FILES" | "BID_RECEIPT_DIGEST"
  | "BID_NOT_IN_ROLL" | "BID_ROLL_CHANGED" | "BID_KEY"
  | "PARTY_NOT_FOUND" | "PEPPER_NOT_HELD" | "SHARES_INCOMPLETE" | "SHARES_MISMATCH" | "OFFICER_KEY_CHANGED" | "ROLL_NOT_FROZEN" | "NOT_ONLINE" | "NOT_NAMED_OFFICER" | "NOT_ON_PANEL_ONLINE";

const sha256Hex = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const SHA = /^[0-9a-f]{64}$/;
const isId = (x: unknown): x is string => typeof x === "string" && x.length > 0;

/// The manifest as decrypted, narrowed: every field present and typed, and nothing else (an unknown field is a manifest this version did not write).
export function parseManifest(raw: unknown): Manifest | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const keys = ["v", "exerciseId", "onlineBidId", "supplierId", "supplierAccountId", "kind", "parentOnlineBidId", "replacesOnlineBidId", "files", "declarationCipherSha256"];
  if (Object.keys(m).length !== keys.length || keys.some((k) => !(k in m))) return null;
  if (m.v !== 1 || !isId(m.exerciseId) || !isId(m.onlineBidId) || !isId(m.supplierId) || !isId(m.supplierAccountId)) return null;
  if (m.kind !== "BID" && m.kind !== "ALTERNATIVE") return null;
  if (!(m.parentOnlineBidId === null || isId(m.parentOnlineBidId)) || !(m.replacesOnlineBidId === null || isId(m.replacesOnlineBidId))) return null;
  if (typeof m.declarationCipherSha256 !== "string" || !SHA.test(m.declarationCipherSha256) || !Array.isArray(m.files)) return null;
  const files: Manifest["files"] = [];
  for (const f of m.files) {
    if (typeof f !== "object" || f === null || Object.keys(f).length !== 3) return null;
    const x = f as Record<string, unknown>;
    if (!isId(x.fileId) || !isId(x.packPartId) || typeof x.cipherSha256 !== "string" || !SHA.test(x.cipherSha256)) return null;
    files.push({ fileId: x.fileId, packPartId: x.packPartId, cipherSha256: x.cipherSha256 });
  }
  return { v: 1, exerciseId: m.exerciseId, onlineBidId: m.onlineBidId, supplierId: m.supplierId, supplierAccountId: m.supplierAccountId, kind: m.kind, parentOnlineBidId: m.parentOnlineBidId as string | null, replacesOnlineBidId: m.replacesOnlineBidId as string | null, files, declarationCipherSha256: m.declarationCipherSha256 };
}

export interface BidRow {
  id: string;
  exerciseId: string;
  supplierId: string;
  accountId: string;
  kind: OnlineBidKind;
  parentOnlineBidId: string | null;
  replacesOnlineBidId: string | null;
  keyId: string;
  sequence: number;
  receivedAt: Date;
  /// The ciphertexts as stored, whose SHA-256 the row names.
  sealedManifest: Uint8Array;
  sealedDeclaration: Uint8Array;
  manifestCipherSha256: string;
  declarationCipherSha256: string;
  receiptDigest: string;
  files: { fileId: string; packPartId: string; cipherSha256: string }[];
}

/**
 * Every way one bid's opened manifest can disagree with what the database holds. Empty: the bid is as it was submitted. `manifest` is null where it did not decrypt to a manifest this version wrote.
 * `submissionNumber` is the supplier's own count of its submissions (`submissionNumbers`), which the receipt digest hashes. `replacedBy` follows the replacement chain among the exercise's bids.
 */
export function bidCheckFaults(i: {
  bid: BidRow;
  manifest: Manifest | null;
  liveKey: { id: string; fingerprint: string };
  submissionNumber: number;
  rollEntry: { sequence: number; receiptDigest: string; late: boolean } | null;
  replacedBy: (id: string) => string | null;
  withdrawnClearedLink: boolean;
  /// A supplementary opening opens a bid the roll lists as LATE; the main unseal opens only those it lists as in time.
  expectLate?: boolean;
}): OnlineUnsealFault[] {
  const out: OnlineUnsealFault[] = [];
  const b = i.bid;
  if (b.keyId !== i.liveKey.id) out.push("BID_KEY");
  if (!i.rollEntry) out.push("BID_NOT_IN_ROLL");
  else if (i.rollEntry.late !== (i.expectLate ?? false) || i.rollEntry.receiptDigest !== b.receiptDigest) out.push("BID_ROLL_CHANGED");
  if (sha256Hex(b.sealedManifest) !== b.manifestCipherSha256) out.push("BID_MANIFEST_DIGEST");
  if (sha256Hex(b.sealedDeclaration) !== b.declarationCipherSha256) out.push("BID_DECLARATION_DIGEST");
  const m = i.manifest;
  if (!m) {
    out.push("BID_MANIFEST_BINDING");
    return out;
  }
  if (m.exerciseId !== b.exerciseId || m.onlineBidId !== b.id || m.supplierId !== b.supplierId || m.supplierAccountId !== b.accountId || m.kind !== b.kind || m.replacesOnlineBidId !== b.replacesOnlineBidId) out.push("BID_MANIFEST_BINDING");
  if (m.declarationCipherSha256 !== b.declarationCipherSha256) out.push("BID_DECLARATION_DIGEST");
  if (!parentReachable(m.parentOnlineBidId, b.parentOnlineBidId, i.replacedBy, i.withdrawnClearedLink)) out.push("BID_PARENT");
  const key = (f: { fileId: string; packPartId: string; cipherSha256: string }) => `${f.fileId}.${f.packPartId}.${f.cipherSha256}`;
  const sealed = m.files.map(key).sort();
  const held = b.files.map(key).sort();
  if (sealed.length !== held.length || sealed.some((k, n) => k !== held[n]) || new Set(m.files.map((f) => f.fileId)).size !== m.files.length) out.push("BID_FILES");
  let again: string | null = null;
  try {
    again = receiptDigest({ exerciseId: b.exerciseId, submissionNumber: i.submissionNumber, receivedAt: b.receivedAt, keyFingerprint: i.liveKey.fingerprint, manifestCipherSha256: b.manifestCipherSha256, declarationCipherSha256: b.declarationCipherSha256, fileCipherSha256s: b.files.map((f) => f.cipherSha256) });
  } catch {
    again = null;
  }
  if (again !== b.receiptDigest) out.push("BID_RECEIPT_DIGEST");
  return [...new Set(out)];
}

/// The roll entry, by the envelope's sequence, among those the opening froze (`Opening.receiptRoll`). Null where the roll is not the shape `receiptRoll` writes.
export function rollEntries(roll: unknown): { sequence: number; receiptDigest: string; late: boolean }[] | null {
  if (typeof roll !== "object" || roll === null) return null;
  const r = roll as { v?: unknown; entries?: unknown };
  if (r.v !== 1 || !Array.isArray(r.entries)) return null;
  const out: { sequence: number; receiptDigest: string; late: boolean }[] = [];
  for (const e of r.entries) {
    const x = e as { sequence?: unknown; receiptDigest?: unknown; late?: unknown };
    if (!Number.isInteger(x?.sequence) || typeof x.receiptDigest !== "string" || typeof x.late !== "boolean") return null;
    out.push({ sequence: x.sequence as number, receiptDigest: x.receiptDigest, late: x.late });
  }
  return out;
}

/**
 * Which submissions the main unseal opens. Only a SUBMITTED bid whose envelope is in time, and which stands in the roll as in time. A late bid waits for the committee and a supplementary
 * opening; REPLACED and WITHDRAWN are out of play and never decrypted. A roll entry that is in time but whose bid is no longer SUBMITTED (it moved after the roll was frozen, which the
 * triggers refuse) blocks the unseal as BID_ROLL_CHANGED rather than being quietly skipped.
 */
export function unsealSelection(i: {
  bids: { id: string; sequence: number; status: OnlineBidStatus; late: boolean }[];
  roll: { sequence: number; late: boolean }[];
}): { open: string[]; waiting: string[]; faults: { sequence: number; fault: OnlineUnsealFault }[] } {
  const open: string[] = [];
  const waiting: string[] = [];
  const faults: { sequence: number; fault: OnlineUnsealFault }[] = [];
  const bySeq = new Map(i.bids.map((b) => [b.sequence, b]));
  for (const b of [...i.bids].sort((x, y) => x.sequence - y.sequence)) {
    if (b.status !== "SUBMITTED") continue;
    if (b.late) {
      waiting.push(b.id);
      continue;
    }
    const entry = i.roll.find((e) => e.sequence === b.sequence);
    if (!entry) faults.push({ sequence: b.sequence, fault: "BID_NOT_IN_ROLL" });
    else if (entry.late) faults.push({ sequence: b.sequence, fault: "BID_ROLL_CHANGED" });
    else open.push(b.id);
  }
  for (const e of i.roll) {
    if (e.late) continue;
    const b = bySeq.get(e.sequence);
    if (!b || (b.status !== "SUBMITTED" && b.status !== "OPENED")) faults.push({ sequence: e.sequence, fault: "BID_ROLL_CHANGED" });
  }
  return { open, waiting, faults };
}

export interface GrantPlanItem { subject: "FILE" | "DECLARATION"; recordId: string; use: "OPENING_CHECK" | "FINALISE" }

/**
 * The data keys re-sealed to each named officer for one opened bid (H3 option a, ruling 20t). A file of a part the frozen bid rules mark `openingCheck` is OPENING_CHECK: the officers can download it
 * at the opening check and only those (SR-14). Every other file, and the declaration, is FINALISE: read by `finaliseOnline` alone. A file whose part has no rule is FINALISE, the narrower use. The
 * database holds the rest: a DECLARATION grant can only be FINALISE.
 */
export function grantPlan(i: { files: { fileId: string; packPartId: string }[]; declarationBidId: string; rules: readonly BidPartRule[] }): GrantPlanItem[] {
  const check = new Set(i.rules.filter((r) => r.openingCheck).map((r) => r.packPartId));
  return [
    ...i.files.map((f) => ({ subject: "FILE" as const, recordId: f.fileId, use: check.has(f.packPartId) ? ("OPENING_CHECK" as const) : ("FINALISE" as const) })),
    { subject: "DECLARATION" as const, recordId: i.declarationBidId, use: "FINALISE" as const },
  ];
}

/**
 * The party an online bid is listed under (D8). The supplier's own party on this exercise: the one linked to it (`vendorId`). Where it has more than one, the one a standing sale was made to; failing
 * that, the first. Null where the supplier has none (it could not have bought the documents, so this is a defect the unseal reports and does not guess at).
 */
export function partyFor(candidates: readonly { id: string }[], salePartyIds: ReadonlySet<string>): string | null {
  if (candidates.length === 0) return null;
  return (candidates.find((p) => salePartyIds.has(p.id)) ?? candidates[0]).id;
}

/// Opening order within one unseal: main bids before alternatives (an alternative names its parent's offer), each in the order received. The listing number is the order opened, never the receipt number.
export function listingOrder<T extends { kind: OnlineBidKind; sequence: number }>(bids: readonly T[]): T[] {
  return [...bids].sort((a, b) => (a.kind === b.kind ? a.sequence - b.sequence : a.kind === "BID" ? -1 : 1));
}
