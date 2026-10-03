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
  /// Interim certificates already issued on the contract: a schedule row may not fall on one of them.
  issuedInterims: number;
  /// A live advance for the same party (not void): one at a time.
  liveForParty: boolean;
  today: Day;
}

export function applicationFaults(i: ApplicationInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}, level: "block" | "warn" = "block") => out.push({ code, level, data });
  if (i.amount == null || i.amount <= 0n) f("ADVANCE_AMOUNT_REQUIRED");
  if (i.party === "NSC" && !i.partyKnown) f("ADVANCE_PARTY_REQUIRED");
  if (i.liveForParty) f("ADVANCE_ALREADY_LIVE", { party: i.party });
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
