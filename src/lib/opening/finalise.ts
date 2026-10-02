/**
 * Finalising an opening (FR-OPN-005, 006, 011; C-1, C-5). Everything the paper schedule carries must
 * be on the record first: every envelope in time opened or withdrawn (or, at a supplementary opening,
 * the admitted one opened), every present member's initial on every offer, every checklist item
 * answered and every verdict recorded, every withdrawal matched or explained, the signed schedule's
 * pages, every present member's signature, and every rule the verdicts and the header read set.
 * Then, in the same transaction: the estimate is disclosed (6.2 `disclose`, OD-2 A), the paper copy
 * compared (C-1, never before this point), the schedule and its Grand Summary frozen, and the main
 * opening makes the exercise Opened. Nothing on it changes after (FR-OPN-011), but the signed
 * schedule's scan, which is attached only now (C-5). Pure.
 *
 * C-1: these faults never depend on the figure typed from the paper — only on whether it was answered
 * where an estimate is required — so a refusal reads the same whatever was typed.
 */

import type { OpeningChecklist } from "./checklist";
import { actFaults, type ActFault, type OpeningState } from "./state";
import type { WithdrawalFacts } from "./withdrawals";
import { withdrawalsResolved } from "./withdrawals";
import type { Finding, InvitedCountReading, OpeningVerdict, UnpurchasedConsequence } from "./types";

export type FinaliseFault =
  | ActFault
  | "ENVELOPE_UNOPENED"
  | "ADMITTED_NOT_OPENED"
  | "INITIAL_MISSING"
  | "CHECKLIST_UNANSWERED"
  | "CHECKLIST_NOT_JUDGED"
  | "VERDICT_UNSET"
  | "WITHDRAWAL_UNRESOLVED"
  | "PAGES_NOT_SET"
  | "SIGNATURE_MISSING"
  | "CONSEQUENCE_NOT_SET"
  | "UNPURCHASED_CONSEQUENCE_NOT_SET"
  | "READING_NOT_SET"
  | "ESTIMATE_COPY_NOT_ANSWERED"
  | "PERSON_REQUIRED";

export interface BidForFinalise {
  listingNo: number;
  /// Persons who initialled it.
  initials: readonly string[];
  unanswered: number;
  verdict: OpeningVerdict | null;
  /// Its sale finding is not a live sale (the unpurchased consequence then must be set).
  unpurchased: boolean;
}

export function finaliseFaults(i: {
  state: OpeningState;
  bids: readonly BidForFinalise[];
  /// Present panel members.
  present: readonly { personId: string; name: string }[];
  signed: readonly string[];
  pages: number | null;
  checklist: OpeningChecklist;
  withdrawals: readonly WithdrawalFacts[];
  /// MAIN: envelopes in time on the register still RECEIVED (not opened, not withdrawn).
  unopened: number;
  /// SUPPLEMENTARY: whether its admitted envelope is opened.
  admittedOpened: boolean;
  completenessEliminates: boolean | null;
  unpurchased: UnpurchasedConsequence | null;
  invitedReading: InvitedCountReading | null;
  /// Where the method requires an estimate and one is lodged: whether the paper's figure (or "not in the box") was answered.
  estimate: { required: boolean; lodged: boolean; paperAnswered: boolean };
  personActive: boolean;
}): Finding<FinaliseFault>[] {
  const out: Finding<FinaliseFault>[] = [...actFaults(i.state)];
  const f = (code: FinaliseFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (i.state.kind === "MAIN" && i.unopened > 0) f("ENVELOPE_UNOPENED", { count: i.unopened });
  if (i.state.kind === "SUPPLEMENTARY" && !i.admittedOpened) f("ADMITTED_NOT_OPENED");
  if (i.checklist.notJudged.length) f("CHECKLIST_NOT_JUDGED", { parts: i.checklist.notJudged.join(", ") });
  for (const b of [...i.bids].sort((a, c) => a.listingNo - c.listingNo)) {
    for (const m of i.present) if (!b.initials.includes(m.personId)) f("INITIAL_MISSING", { listingNo: b.listingNo, person: m.name });
    if (b.unanswered > 0) f("CHECKLIST_UNANSWERED", { listingNo: b.listingNo, count: b.unanswered });
    if (!b.verdict) f("VERDICT_UNSET", { listingNo: b.listingNo });
  }
  const w = withdrawalsResolved(i.withdrawals);
  if (w) out.push(w);
  if (i.pages == null) f("PAGES_NOT_SET");
  for (const m of i.present) if (!i.signed.includes(m.personId)) f("SIGNATURE_MISSING", { person: m.name });
  if (i.completenessEliminates == null) f("CONSEQUENCE_NOT_SET");
  // OD-4: only where such a bid exists.
  if (i.unpurchased == null && i.bids.some((b) => b.unpurchased)) f("UNPURCHASED_CONSEQUENCE_NOT_SET");
  if (i.invitedReading == null) f("READING_NOT_SET");
  if (i.estimate.required && i.estimate.lodged && !i.estimate.paperAnswered) f("ESTIMATE_COPY_NOT_ANSWERED");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

export type ScanFault = "SEALED_FIGURE_ON_PAPER" | "SIGNED_SCHEDULE_NOT_ATTACHED";

/**
 * The signed schedule's scan (FR-OPN-006, C-5): refused before finalising (the paper carries the
 * estimate's row: 6.2 Q-2), and once finalised its absence holds evaluation (6.8) and the award back.
 */
export function scheduleScanFault(o: { finalised: boolean; liveScans: number }): Finding<ScanFault> | null {
  if (!o.finalised) return { code: "SEALED_FIGURE_ON_PAPER", level: "block" };
  return o.liveScans > 0 ? null : { code: "SIGNED_SCHEDULE_NOT_ATTACHED", level: "block" };
}

export type MarkFault = ActFault | "NOT_ON_PANEL" | "ABSENT" | "ALREADY_RECORDED" | "NOT_THIS_OPENING" | "DAY_REQUIRED" | "DAY_IN_FUTURE" | "DAY_BEFORE_OPENING" | "TIME_ZONE_NOT_SET";

/// A present member's initial on an offer, or signature on the schedule (FR-OPN-006), attested.
export function markFaults(i: { state: OpeningState; panel: readonly { personId: string; present: boolean }[]; personId: string; already: boolean; sameOpening: boolean; signedOn?: { day: string | null; today: string | null; startDay: string | null } }): Finding<MarkFault>[] {
  const out: Finding<MarkFault>[] = [...actFaults(i.state)];
  const f = (code: MarkFault) => out.push({ code, level: "block" });
  if (!i.sameOpening) f("NOT_THIS_OPENING");
  const m = i.panel.find((p) => p.personId === i.personId);
  if (!m) f("NOT_ON_PANEL");
  else if (!m.present) f("ABSENT");
  if (i.already) f("ALREADY_RECORDED");
  if (i.signedOn) {
    const s = i.signedOn;
    if (!s.today) f("TIME_ZONE_NOT_SET");
    if (!s.day) f("DAY_REQUIRED");
    else {
      if (s.today && s.day > s.today) f("DAY_IN_FUTURE");
      if (s.startDay && s.day < s.startDay) f("DAY_BEFORE_OPENING");
    }
  }
  return out;
}

export type RecordFault = ActFault | "PAGES_POSITIVE";

/// The paper's pages and the minutes are recorded while the opening is open (FR-OPN-005).
export function recordFaults(i: { state: OpeningState; pages?: number | null }): Finding<RecordFault>[] {
  const out: Finding<RecordFault>[] = [...actFaults(i.state)];
  if (i.pages !== undefined && (i.pages == null || i.pages < 1)) out.push({ code: "PAGES_POSITIVE", level: "block" });
  return out;
}
