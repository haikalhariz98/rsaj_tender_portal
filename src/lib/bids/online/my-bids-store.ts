import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { deploymentCeiling } from "@/lib/documents/store";
import { inColumns } from "@/lib/suppliers/data-export-fields";
import type { Words } from "@/lib/contract/labels";

import { discardedNotices, partViews, standingChoices, submissionViews, type DiscardedNotice, type OpeningFacts, type PartView, type SubmissionView } from "./my-bids";
import { uploadGateFaults } from "./parts";
import { loadDoorFacts } from "./upload-store";
import { PART_UPLOAD_FAULT_WORDS } from "./words";
import { inOrder } from "@/lib/series";

/**
 * What a supplier's screens for an online bid read (SR-13, ADR 0036 D5 to D8; build plan step 11): the exercise as this supplier may see it, the parts and the files waiting for them, its
 * own submissions with the opening's words, and the notice of files discarded by a change of the key. The supplier is the session's and nothing here takes another's: another supplier's
 * rows are never selected, and an exercise it may not see is null. Nothing sealed is read: a filename, a price and a manifest stay sealed, and only ids, times, sizes' ciphertext and digests are.
 */

export interface BidScreen {
  exercise: { id: string; reference: string; title: string; closingAt: Date | null; organisationName: string; timeZone: string | null };
  /// False where bids are handed in on paper: the tab and the submit page then say so and offer nothing.
  online: boolean;
  demonstration: boolean;
  /// The closing has passed: a bid submitted now is received as late (until the main opening starts).
  pastClosing: boolean;
  /// Why a bid cannot be submitted now, in words; empty where every door is open.
  closed: Words[];
  alternativesPermitted: boolean | null;
  liveFingerprint: string | null;
  parts: PartView[];
  submissions: SubmissionView[];
  replaceable: { id: string; number: number; kind: "BID" | "ALTERNATIVE"; parentId: string | null }[];
  parents: { id: string; number: number }[];
  /// A bid of the supplier's stands, so a second one is a replacement (FR-BID-005).
  bidStands: boolean;
  discarded: DiscardedNotice[];
}

export async function loadBidScreen(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId" | "organisationTimeZone">, exerciseId: string, now: Date = new Date()): Promise<BidScreen | null> {
  const door = await loadDoorFacts(client, actor, exerciseId, now);
  if (!door) return null;
  const ctx = door.ctx;
  const exercise = { id: ctx.ex.id, reference: ctx.ex.reference, title: ctx.ex.title, closingAt: ctx.ex.closingAt, organisationName: ctx.org.name, timeZone: ctx.org.timeZone };
  const empty: BidScreen = { exercise, online: false, demonstration: false, pastClosing: false, closed: [], alternativesPermitted: null, liveFingerprint: null, parts: [], submissions: [], replaceable: [], parents: [], bidStands: false, discarded: [] };
  if (door.channel !== "ONLINE") return empty;

  const gate = uploadGateFaults({
    channel: door.channel, online: door.online, published: door.published, cancelled: door.cancelled, keyLive: door.key != null, fingerprintMatches: door.fingerprintMatches,
    saleStands: door.saleStands, invitedPath: door.invitedPath, onInviteeList: door.onInviteeList, mainOpeningStartedAt: door.mainOpeningStartedAt,
  });
  const orgId = actor.organisationId;
  const mine = { exerciseId: ctx.ex.id, organisationId: orgId, supplierId: actor.supplierId };
  const [window, bids, drafts, discardedFiles, opening] = await inOrder(
    () => client.exerciseWindow.findFirst({ where: { exerciseId: ctx.ex.id, organisationId: orgId }, select: { alternativesPermitted: true } }),
    () => client.onlineBid.findMany({ where: mine, select: { id: true, kind: true, status: true, parentOnlineBidId: true, receiptDigest: true, key: { select: { fingerprint: true } }, envelope: { select: { sequence: true, receivedAt: true, late: true } } } }),
    () => client.onlineBidFile.findMany({ where: { ...mine, state: "DRAFT", keyId: door.key?.id ?? "none" }, select: { id: true, packPartId: true, uploadedAt: true } }),
    () => client.onlineBidFile.findMany({ where: { ...mine, state: "DISCARDED", ...(door.key ? { keyId: { not: door.key.id } } : {}) }, select: { id: true, key: { select: { fingerprint: true } } } }),
    () => client.opening.findFirst({ where: { exerciseId: ctx.ex.id, organisationId: orgId, kind: "MAIN" }, select: { startedAt: true, unsealedAt: true, receiptRoll: true } }));

  // A file the supplier discarded itself is not one the key change took: its own granted discard is in the sealed access log.
  const own = discardedFiles.length
    ? new Set((await client.sealedAccessEvent.findMany({ where: { exerciseId: ctx.ex.id, kind: "PART_DISCARD", outcome: "GRANTED", recordId: { in: discardedFiles.map((f) => f.id) } }, select: { recordId: true } })).map((e) => e.recordId))
    : new Set<string>();
  const byKeyChange = discardedFiles.filter((f) => !own.has(f.id)).map((f) => ({ keyFingerprint: f.key.fingerprint }));

  const rolled = opening?.receiptRoll as { entries?: { sequence: number; receiptDigest: string; late: boolean }[] } | null | undefined;
  const openingFacts: OpeningFacts = { started: opening != null, unsealed: opening?.unsealedAt != null, roll: rolled && Array.isArray(rolled.entries) ? { entries: rolled.entries } : null };
  const ceiling = deploymentCeiling();
  const storeCap = "ceiling" in ceiling ? ceiling.ceiling : null;
  const submissions = submissionViews({
    rows: bids.map((b) => ({ id: b.id, kind: b.kind, status: b.status, parentOnlineBidId: b.parentOnlineBidId, receiptDigest: b.receiptDigest, keyFingerprint: b.key.fingerprint, sequence: b.envelope.sequence, receivedAt: b.envelope.receivedAt, late: b.envelope.late })),
    opening: openingFacts,
    organisationName: ctx.org.name,
    timeZone: ctx.org.timeZone,
    closing: ctx.ex.closingAt,
    cancelled: door.cancelled,
    alternativesPermitted: window?.alternativesPermitted ?? null,
    now,
  });
  const choices = standingChoices(submissions);
  return {
    exercise,
    online: true,
    demonstration: door.online.demonstration,
    pastClosing: ctx.ex.closingAt !== null && now.getTime() > ctx.ex.closingAt.getTime(),
    closed: gate.map((f) => PART_UPLOAD_FAULT_WORDS[f]),
    alternativesPermitted: window?.alternativesPermitted ?? null,
    liveFingerprint: door.key?.fingerprint ?? null,
    parts: partViews(door.rules ?? [], drafts, storeCap, ctx.org.timeZone),
    submissions,
    replaceable: choices.replaceable,
    parents: choices.parents,
    bidStands: bids.some((b) => b.kind === "BID" && b.status === "SUBMITTED"),
    discarded: discardedNotices(byKeyChange, door.key?.fingerprint ?? null),
  };
}


/// One of the supplier's own submissions as its export reads it (N2, the PDPA right of access): the receipt card's facts and the allow-list's IN columns only.
export interface OwnBidReceiptRow {
  /// The OnlineBid's IN columns (`inColumns("OnlineBid")`): nothing sealed.
  row: Record<string, unknown>;
  exerciseId: string;
  receivedAt: Date;
  late: boolean;
  keyFingerprint: string;
}

/**
 * Every submission of the session's supplier, for its export of its own data (N2; plan docs/notes/plans/backlog-n2.md step 2), oldest first within an exercise. It selects through the export's
 * allow-list, so no sealed column (a manifest, a declaration, a data key or their digests) is ever read. The caller judges which exercises the supplier may see (`loadBidContext`) and drops
 * the rest: this reads by the session's supplier and no other.
 */
export async function loadOwnBidReceipts(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">): Promise<OwnBidReceiptRow[]> {
  const rows = await client.onlineBid.findMany({
    where: { organisationId: actor.organisationId, supplierId: actor.supplierId },
    orderBy: [{ exerciseId: "asc" }, { envelope: { sequence: "asc" } }],
    select: { ...inColumns("OnlineBid"), exerciseId: true, key: { select: { fingerprint: true } }, envelope: { select: { receivedAt: true, late: true } } },
  });
  return rows.map(({ exerciseId, key, envelope, ...row }) => ({ row, exerciseId, receivedAt: envelope.receivedAt, late: envelope.late, keyFingerprint: key.fingerprint }));
}
