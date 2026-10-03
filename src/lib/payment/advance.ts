/**
 * Advance payment and its recoupment (6.13 Part A step 3: FR-PAY-001, 002; blocker B2 as ruled, OD-A9 A).
 *
 * A mechanism only, and said so: the sources document no eligibility rule, percentage or recoupment schedule, so
 * none is checked or assumed. An application names its amount, the Advance Payment Guarantee it rests on (lodged in
 * the securities register and VERIFIED, live on the day), and a recoupment schedule entered for the contract: on
 * interim certificate n, recoup this much. No schedule refuses (SCHEDULE_NOT_SET); a schedule that does not add up
 * to the advance refuses. Each interim certificate recoups what the schedule gives its sequence, never more than is
 * still unrecouped, separately for the main contractor and a nominated sub-contractor. Routed on the matrix's
 * advance_payment rows (none: refused naming the matrix). Pure: sen as bigint.
 */

import type { Sen } from "@/lib/money";

import type { AdvanceParty, Day, Finding } from "./types";

export interface ScheduleRow {
  sequence: number;
  amount: Sen;
}

export interface ApplicationInput {
  party: AdvanceParty;
  /// For a nominated sub-contractor's advance: the party it is for (recorded on the contract, not retired).
  partyKnown: boolean;
  amount: Sen | null;
  /// The guarantee named: its kind, status, expiry and value, as the register holds it. Null: none named.
  guarantee: { kind: string; status: string; expiresOn: Day | null; effectiveFrom: Day; value: Sen } | null;
  schedule: readonly ScheduleRow[];
  /// The highest interim certificate sequence issued on the contract (from a valuation, not from one, or the opening
  /// position's last): a schedule row may not fall on it or before it (code review run 2 residual MUST 2).
  issuedInterims: number;
  /// A live advance for the same party (not void): one at a time.
  liveForParty: boolean;
  /// The sequence of the interim valuation in progress (being valued, or its certificate raised and neither issued
  /// nor void), or null. Its recoupment was fixed when it was assembled from the advances issued then, so an advance
  /// is not applied for while it is in progress, and no row may fall on it or before it (code review run 2, item 2).
  inProgressSequence: number | null;
  today: Day;
}

export function applicationFaults(i: ApplicationInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}, level: "block" | "warn" = "block") => out.push({ code, level, data });
  if (i.amount == null || i.amount <= 0n) f("ADVANCE_AMOUNT_REQUIRED");
  if (i.party === "NSC" && !i.partyKnown) f("ADVANCE_PARTY_REQUIRED");
  if (i.liveForParty) f("ADVANCE_ALREADY_LIVE", { party: i.party });
  if (i.inProgressSequence != null) f("ADVANCE_VALUATION_IN_PROGRESS", { sequence: i.inProgressSequence });
  const g = i.guarantee;
  if (!g) f("APG_REQUIRED");
  else {
    if (g.kind !== "ADVANCE_PAYMENT_GUARANTEE") f("APG_NOT_AN_APG");
    else if (g.status !== "VERIFIED") f("APG_NOT_VERIFIED");
    else if (g.effectiveFrom > i.today || (g.expiresOn != null && g.expiresOn < i.today)) f("APG_NOT_LIVE");
    else if (i.amount != null && g.value < i.amount) f("APG_BELOW_ADVANCE", { value: g.value.toString(), amount: i.amount.toString() }, "warn");
  }
  if (i.schedule.length === 0) f("SCHEDULE_NOT_SET");
  else {
    const seqs = i.schedule.map((r) => r.sequence);
    if (new Set(seqs).size !== seqs.length) f("SCHEDULE_REPEATED");
    if (i.schedule.some((r) => r.amount <= 0n || !Number.isInteger(r.sequence) || r.sequence < 1)) f("SCHEDULE_ROW_INVALID");
    if (i.schedule.some((r) => r.sequence <= i.issuedInterims)) f("SCHEDULE_PAST", { issued: i.issuedInterims });
    else if (i.inProgressSequence != null && i.schedule.some((r) => r.sequence <= i.inProgressSequence!)) f("SCHEDULE_ON_VALUATION_IN_PROGRESS", { sequence: i.inProgressSequence });
    const total = i.schedule.reduce((a, r) => a + r.amount, 0n);
    if (i.amount != null && total !== i.amount) f("SCHEDULE_NOT_BALANCED", { total: total.toString(), amount: i.amount.toString() });
  }
  return out;
}

export interface LiveAdvance {
  id: string;
  party: AdvanceParty;
  amount: Sen;
  schedule: readonly ScheduleRow[];
  /// Recouped on interim certificates already issued.
  recouped: Sen;
}

export interface Recoupment {
  id: string;
  party: AdvanceParty;
  scheduled: Sen;
  recoup: Sen;
  /// Unrecouped after this certificate.
  balanceAfter: Sen;
}

/// What interim certificate `sequence` recoups of each issued advance: its scheduled amount, never more than unrecouped.
export function recoupments(advances: readonly LiveAdvance[], sequence: number): { main: Sen; nsc: Sen; lines: Recoupment[] } {
  const lines = advances.map((a) => {
    const scheduled = a.schedule.filter((r) => r.sequence === sequence).reduce((x, r) => x + r.amount, 0n);
    const unrecouped = a.amount - a.recouped;
    const recoup = scheduled < unrecouped ? scheduled : unrecouped > 0n ? unrecouped : 0n;
    return { id: a.id, party: a.party, scheduled, recoup, balanceAfter: unrecouped - recoup };
  });
  return { main: lines.filter((l) => l.party === "MAIN").reduce((x, l) => x + l.recoup, 0n), nsc: lines.filter((l) => l.party === "NSC").reduce((x, l) => x + l.recoup, 0n), lines };
}

/// At the interim certificate's issue: the advances it was assembled from must still be the issued set. One issued
/// since it was raised (or one void since) would leave its schedule row for this sequence unrecouped for good, or
/// recoup an advance no longer paid; the certificate is refused, naming each (void it and raise the valuation again).
export function advancesMovedFaults(readAtRaising: readonly string[], issuedNow: readonly { id: string; label: string }[]): Finding[] {
  const was = new Set(readAtRaising);
  const now = new Set(issuedNow.map((a) => a.id));
  const added = issuedNow.filter((a) => !was.has(a.id)).map((a) => a.label);
  const gone = readAtRaising.filter((id) => !now.has(id));
  if (!added.length && !gone.length) return [];
  return [{ code: "ADVANCES_MOVED", level: "block", data: { added: added.join("; ") || null, gone: gone.length } }];
}

/// Code review run 2 residual MUST 3 (the other order): an advance applied for but not yet issued or void holds the
/// recoupment schedule open, so no interim valuation is opened meanwhile (it would be assembled without it and its
/// row skipped for good). Names each.
export function pendingAdvanceFaults(pending: readonly { label: string }[]): Finding[] {
  return pending.length ? [{ code: "ADVANCE_PENDING", level: "block", data: { advances: pending.map((a) => a.label).join("; ") } }] : [];
}

/// At the advance certificate's issue: no schedule row may fall on or before the highest interim sequence issued or
/// in progress (it would never be recouped). Refused, naming the rows.
export function advanceIssueFaults(schedule: readonly ScheduleRow[], highestIssued: number, inProgress: number | null): Finding[] {
  const limit = Math.max(highestIssued, inProgress ?? 0);
  const passed = schedule.filter((r) => r.sequence <= limit).map((r) => r.sequence);
  return passed.length ? [{ code: "ADVANCE_SCHEDULE_PASSED", level: "block", data: { rows: passed.join(", "), limit } }] : [];
}
