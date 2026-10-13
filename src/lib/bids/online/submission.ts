/**
 * An online submission, a replace and a withdrawal (ADR 0036 D5, D7, D8, rulings 17c, 20b, 20h, 20m; build plan §1.3, written verbatim). Pure.
 */

import type { onlineSubmissionAllowed } from "@/lib/sealing/switch";

import type { BidPartRule, Declaration, OnlineBidFileState, OnlineBidKind, OnlineBidStatus, SubmissionChannel, SubmissionWarning, SubmitFault, WithdrawFault } from "./types";

// src/lib/bids/online/submission.ts (D5, D7, D8)
export declare function parseDeclaration(raw: unknown): { ok: true; value: Declaration } | { ok: false; faults: SubmitFault[] };
export declare function submitFaults(i: {
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
export declare function withdrawFaults(i: { mine: boolean; status: OnlineBidStatus; stamp: Date; closing: Date; cancelled: boolean; alsoWithdraw: { mine: boolean; linkedToThis: boolean }[] }): WithdrawFault[];
/// The alternatives a withdrawal touches: those named are withdrawn, the rest kept with their link cleared (20h).
export declare function withdrawalEffect(target: string, linked: string[], alsoWithdraw: string[]): { withdraw: string[]; clearLink: string[] };
