/**
 * An online submission, a replace and a withdrawal (ADR 0036 D5, D7, D8, rulings 17c, 20b, 20e, 20h, 20m; FR-BID-002 to 007; build plan §1.3). Pure.
 *
 * The door's rules, judged on the stamp the database clock gave the act (taken before the password check): the stamp at the closing second is in time, and the next
 * second is late (FR-BID-002, as the envelope trigger judges it). A late submission is taken until the main opening is started (20b), and none at all after it (the
 * trigger refuses every insert once the main opening exists). The sale is `saleStands`'s answer (17c, 20m), the invitee list the purchase's own (20m).
 */

import { MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";
import type { onlineSubmissionAllowed } from "@/lib/sealing/switch";

import type { BidPartRule, Declaration, OnlineBidFileState, OnlineBidKind, OnlineBidStatus, SubmissionChannel, SubmissionWarning, SubmitFault, WithdrawFault } from "./types";

/// The units a period is declared in: `PeriodUnit`'s values (`submission.test.ts` pins the two equal).
export const DECLARED_UNITS = ["DAYS", "WEEKS", "MONTHS"] as const;
/// The price as `OpenedBid.priceAsRead` holds it, Decimal(18, 2): at most 16 digits before the point and 2 after, no sign, no exponent, no separators.
const PRICE = /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/;
/// The period as `OpenedBid.completionPeriod` holds it: a whole number from 1 (its CHECK) to the largest Int.
const MAX_PERIOD = 2_147_483_647;

// src/lib/bids/online/submission.ts (D5, D7, D8)
/**
 * The declared Harga and Tempoh Kerja (ruling 20, D5). The declaration stays sealed until the finalise writes it into `OpenedBid`, so only what that write can hold is
 * accepted now: a figure refused at the finalise would leave the opening unfinalisable. The price is a decimal string, never a number (no float is ever money).
 * Unknown fields are not carried into the value.
 */
export function parseDeclaration(raw: unknown): { ok: true; value: Declaration } | { ok: false; faults: SubmitFault[] } {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const faults: SubmitFault[] = [];
  const price = r.price;
  if (typeof price !== "string" || !PRICE.test(price) || !/[1-9]/.test(price)) faults.push("PRICE_INVALID");
  const period = r.completionPeriod;
  if (typeof period !== "number" || !Number.isInteger(period) || period < 1 || period > MAX_PERIOD) faults.push("PERIOD_INVALID");
  const unit = r.completionUnit;
  if (typeof unit !== "string" || !(DECLARED_UNITS as readonly string[]).includes(unit)) faults.push("UNIT_NOT_SET");
  if (faults.length > 0) return { ok: false, faults };
  return { ok: true, value: { price: price as string, completionPeriod: period as number, completionUnit: unit as Declaration["completionUnit"] } };
}

/**
 * Everything the door refuses, the lateness the stamp gives, the warnings, and whether an alternative will not be considered.
 * - LIVE_BID_HELD: a main bid while one of the supplier's in-time main bids stands (a second, or a late one beside it; FR-BID-005). A replace is the way to change one.
 * - Alternatives (20h): no main bid is needed; a named parent must be the supplier's own live submission; where alternatives are not permitted it is accepted and
 *   marked not considered, with a warning before it is submitted; not stated is refused only defensively (publication refuses it first). A bid names no parent.
 * - Files: at least one; each the supplier's own draft for a part the bidder returns. A mandatory part with no file is warned about, never refused (FR-BID-007).
 * - The cap (20e) counts the supplier's submissions on the exercise before this one.
 */
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
}): { faults: SubmitFault[]; late: boolean; warnings: SubmissionWarning[]; alternativeNotConsidered: boolean } {
  const faults: SubmitFault[] = [];
  const warnings: SubmissionWarning[] = [];
  const late = i.stamp.getTime() > i.closing.getTime();
  const add = (f: SubmitFault) => {
    if (!faults.includes(f)) faults.push(f);
  };

  if (i.channel !== "ONLINE") return { faults: ["CHANNEL_NOT_ONLINE"], late, warnings, alternativeNotConsidered: false };
  if (i.online.fault) add(i.online.fault);
  if (!i.published) add("NOT_PUBLISHED");
  if (i.cancelled) add("CANCELLED");
  if (!i.keyLive) add("KEY_NOT_LIVE");
  if (!i.saleStands) add("NO_LIVE_SALE");
  if (i.invitedPath && !i.onInviteeList) add("NOT_ON_INVITEE_LIST");
  if (i.mainOpeningStartedAt !== null) add("LATE_CLOSED");

  if (i.replaces !== null) {
    if (!i.replaces.mine || i.replaces.status !== "SUBMITTED") add("NOTHING_TO_REPLACE");
    if (late) add("REPLACE_AFTER_CLOSING");
    warnings.push({ code: "REPLACE_REUPLOADS_ALL" });
  } else if (i.kind === "BID" && i.liveMainInTime) add("LIVE_BID_HELD");

  let alternativeNotConsidered = false;
  if (i.kind === "ALTERNATIVE") {
    if (i.alternativesPermitted === null) add("ALTERNATIVES_NOT_STATED");
    else if (i.alternativesPermitted === false) {
      alternativeNotConsidered = true;
      warnings.push({ code: "ALTERNATIVE_NOT_CONSIDERED" });
    }
    if (i.parent !== "NONE_NAMED" && (i.parent === null || !i.parent.mine || i.parent.status !== "SUBMITTED")) add("PARENT_NOT_YOUR_LIVE_BID");
  } else if (i.parent !== "NONE_NAMED") add("PARENT_NOT_YOUR_LIVE_BID");

  const returned = i.rules.filter((r) => r.returnedByBidder);
  if (i.files.length === 0) add("NO_FILES");
  for (const f of i.files) {
    if (!f.mine) add("FILE_NOT_YOURS");
    if (f.state !== "DRAFT") add("FILE_NOT_DRAFT");
    if (!returned.some((r) => r.packPartId === f.packPartId)) add("PART_UNKNOWN");
  }
  for (const r of returned.filter((x) => x.mandatory)) {
    if (!i.files.some((f) => f.packPartId === r.packPartId)) warnings.push({ code: "MANDATORY_PART_MISSING", packPartId: r.packPartId, label: r.label });
  }

  if (i.submissionsBySupplier >= MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE) add("TOO_MANY_SUBMISSIONS");
  return { faults, late, warnings, alternativeNotConsidered };
}

/// `stamp`: the withdrawal's own database stamp, taken after its body is read and before the password check (as submit); it becomes OnlineBid.statusAt.
/// Allowed up to and including the closing second (FR-BID-004, D7), as the status trigger judges it. Only the supplier's own alternatives linked to this bid may be
/// withdrawn with it.
export function withdrawFaults(i: { mine: boolean; status: OnlineBidStatus; stamp: Date; closing: Date; cancelled: boolean; alsoWithdraw: { mine: boolean; linkedToThis: boolean }[] }): WithdrawFault[] {
  const out: WithdrawFault[] = [];
  if (!i.mine) out.push("NOT_YOURS");
  if (i.status !== "SUBMITTED") out.push("NOT_LIVE");
  if (i.stamp.getTime() > i.closing.getTime()) out.push("AFTER_CLOSING");
  if (i.cancelled) out.push("CANCELLED");
  if (i.alsoWithdraw.some((a) => !a.mine || !a.linkedToThis)) out.push("ALTERNATIVE_NOT_LINKED");
  return out;
}

/// The alternatives a withdrawal touches: those named are withdrawn, the rest kept with their link cleared (20h).
/// The target first, then the named alternatives that are linked to it, in the order of `linked`; a name that is not linked touches nothing.
export function withdrawalEffect(target: string, linked: string[], alsoWithdraw: string[]): { withdraw: string[]; clearLink: string[] } {
  const named = new Set(alsoWithdraw);
  const links = [...new Set(linked)].filter((id) => id !== target);
  return { withdraw: [target, ...links.filter((id) => named.has(id))], clearLink: links.filter((id) => !named.has(id)) };
}
