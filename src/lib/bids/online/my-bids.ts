/**
 * What the supplier's screens for an online bid show, assembled from rows already read (SR-13, ADR 0036 D5 to D8, rulings 20s, 20an, 20ab; build plan step 11). Pure: the store reads,
 * this decides, and a component only renders. No arithmetic and no rule is restated in a component.
 *
 * A submission's own number is `submissionNumbers` of the supplier's own rows, never the exercise-wide sequence, which counts every rival's envelopes (20an). The sequence is read
 * here only to match the supplier's row to the frozen opening roll, and it is never returned.
 */

import { type Words, w } from "@/lib/contract/labels";
import { formatBytes } from "@/lib/documents/labels";

import { partPreBodyFaults } from "./parts";
import { submissionNumbers } from "./receipt";
import { myBidOpenedWords, myBidOpeningState } from "./roll";
import { typesWords } from "./screen-words";
import { stampText } from "./stamp-text";
import { withdrawFaults } from "./submission";
import type { BidPartRule, OnlineBidKind, OnlineBidStatus } from "./types";
import { WITHDRAW_FAULT_WORDS } from "./words";

/// A size, in words in both languages. The unit of a small one is spelled out.
export function bytesWords(n: bigint): Words {
  return n < BigInt(1024) ? w(`${n} bytes`, `${n} bait`) : w(formatBytes(n), formatBytes(n));
}

export interface PartView {
  packPartId: string;
  label: string;
  required: boolean;
  /// The types the part takes, in words; null where none is set (the screen then says so, and nothing can be uploaded).
  types: Words | null;
  /// The largest file the part takes (the smaller of its own limit and the deployment's ceiling); null where it is not set.
  largest: Words | null;
  /// The newest waiting file the supplier uploaded for this part, or null.
  draft: { fileId: string; uploadedAtText: string } | null;
  /// Whether a file can be uploaded for the part now: its types and size are set.
  uploadable: boolean;
}

/// The parts a bidder returns, in the order the rules freeze them, each with what it takes and the file waiting for it.
export function partViews(rules: readonly BidPartRule[], drafts: readonly { id: string; packPartId: string; uploadedAt: Date }[], storeCap: bigint | null, timeZone: string | null): PartView[] {
  return rules
    .filter((r) => r.returnedByBidder)
    .map((rule) => {
      const pre = partPreBodyFaults({ rule, storeCap, draftFilesBySupplier: 0 });
      const waiting = drafts.filter((d) => d.packPartId === rule.packPartId).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
      const types = rule.acceptedMediaTypes.length > 0 ? typesWords(rule.acceptedMediaTypes) : null;
      const largest = pre.cap === null ? null : bytesWords(pre.cap);
      return {
        packPartId: rule.packPartId,
        label: rule.label,
        required: rule.mandatory,
        types,
        largest,
        draft: waiting ? { fileId: waiting.id, uploadedAtText: stampText(waiting.uploadedAt, timeZone) } : null,
        uploadable: types !== null && largest !== null,
      };
    });
}

export interface OwnBidRow {
  id: string;
  kind: OnlineBidKind;
  status: OnlineBidStatus;
  parentOnlineBidId: string | null;
  receiptDigest: string;
  keyFingerprint: string;
  /// The envelope's exercise-wide sequence. Used only to find the row in the frozen roll, never shown.
  sequence: number;
  receivedAt: Date;
  late: boolean;
}

export interface OpeningFacts {
  started: boolean;
  unsealed: boolean;
  /// The roll `startOpening` froze, or null where none is recorded.
  roll: { entries: { sequence: number; receiptDigest: string; late: boolean }[] } | null;
}

export interface SubmissionView {
  id: string;
  number: number;
  kind: OnlineBidKind;
  status: OnlineBidStatus;
  stampText: string;
  late: boolean;
  receiptDigest: string;
  keyFingerprint: string;
  /// The bid this alternative is tied to, where it is tied to one, and that bid's number.
  parentId: string | null;
  parentNumber: number | null;
  /// The standing alternatives tied to this bid, which a withdrawal may take with it.
  linked: { id: string; number: number }[];
  withdraw: { allowed: true } | { allowed: false; reason: Words };
  /// From the opening's start (20s). Null before it.
  opening: { headline: Words; detail: Words; digest: string | null } | null;
  /// The opening has started but the list of bids it froze is not recorded, so nothing is claimed of this submission.
  openingListMissing: boolean;
}

/// The supplier's own submissions, newest first, each in the words the screen shows.
export function submissionViews(i: { rows: readonly OwnBidRow[]; opening: OpeningFacts; organisationName: string; timeZone: string | null; closing: Date | null; cancelled: boolean; now: Date }): SubmissionView[] {
  const numbers = submissionNumbers(i.rows.map((r) => ({ id: r.id, sequence: r.sequence })));
  const numberOf = (id: string) => numbers.get(id) ?? 0;
  return [...i.rows]
    .sort((a, b) => b.sequence - a.sequence)
    .map((row) => {
      const rollEntry = i.opening.roll?.entries.find((e) => e.sequence === row.sequence) ?? null;
      const listMissing = i.opening.started && i.opening.roll === null && row.status !== "REPLACED" && row.status !== "WITHDRAWN" && row.status !== "OPENED";
      const state = listMissing ? null : myBidOpeningState({ status: row.status, openingStarted: i.opening.started, unsealed: i.opening.unsealed, rollEntry, opened: row.status === "OPENED" });
      // The digest shown is the one the roll listed. Where the roll holds none (a replaced, withdrawn or opened one), the supplier's own receipt digest is shown, which it is asked to compare with the receipt it kept.
      const digest = state === null ? null : state === "NOT_IN_ROLL" ? null : (rollEntry?.receiptDigest ?? row.receiptDigest);
      const faults = withdrawFaults({ mine: true, status: row.status, stamp: i.now, closing: i.closing ?? new Date(0), cancelled: i.cancelled, alsoWithdraw: [] });
      const linked = i.rows.filter((r) => r.parentOnlineBidId === row.id && r.status === "SUBMITTED" && r.kind === "ALTERNATIVE").map((r) => ({ id: r.id, number: numberOf(r.id) }));
      return {
        id: row.id,
        number: numberOf(row.id),
        kind: row.kind,
        status: row.status,
        stampText: stampText(row.receivedAt, i.timeZone),
        late: row.late,
        receiptDigest: row.receiptDigest,
        keyFingerprint: row.keyFingerprint,
        parentId: row.parentOnlineBidId,
        parentNumber: row.parentOnlineBidId ? numberOf(row.parentOnlineBidId) || null : null,
        linked,
        withdraw: faults.length === 0 ? { allowed: true as const } : { allowed: false as const, reason: WITHDRAW_FAULT_WORDS[faults[0] ?? "AFTER_CLOSING"] },
        opening: state === null ? null : myBidOpenedWords({ state, digest, organisationName: i.organisationName }),
        openingListMissing: listMissing,
      };
    });
}

/// The submit page's choices of what to replace and what an alternative goes with: only the standing ones, as the rules take them.
export function standingChoices(views: readonly SubmissionView[]): { replaceable: { id: string; number: number; kind: OnlineBidKind; parentId: string | null }[]; parents: { id: string; number: number }[] } {
  const standing = views.filter((v) => v.status === "SUBMITTED");
  return {
    replaceable: standing.map((v) => ({ id: v.id, number: v.number, kind: v.kind, parentId: v.parentId })),
    parents: standing.filter((v) => v.kind === "BID").map((v) => ({ id: v.id, number: v.number })),
  };
}

/// What the supplier is told about its waiting files after the key was changed (step 8's review). One entry per key a file was sealed to.
export interface DiscardedNotice {
  sealedTo: string;
  now: string | null;
  files: number;
}

/**
 * The waiting files discarded because the key changed, by the fingerprint each was sealed to. A file the supplier discarded itself is not one of them (`discardedByKeyChange` is the
 * caller's filter: a discarded file under a key that is no longer live and with no discard of the supplier's own recorded). Pure.
 */
export function discardedNotices(files: readonly { keyFingerprint: string }[], liveFingerprint: string | null): DiscardedNotice[] {
  const by = new Map<string, number>();
  for (const f of files) by.set(f.keyFingerprint, (by.get(f.keyFingerprint) ?? 0) + 1);
  return [...by.entries()].map(([sealedTo, count]) => ({ sealedTo, now: liveFingerprint, files: count }));
}
