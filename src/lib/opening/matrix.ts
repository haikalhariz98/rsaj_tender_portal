/**
 * The SR-14 opening checklist as a matrix: a column per opened bid, a row per item of the frozen checklist (Sourcing Requirements v2, SR-14; rulings 22,
 * 23, 24; wave 3c plan §3.1). Pure.
 *
 * - What a cell offers is read from the rules frozen at publication (`SourcingExercise.onlineBidRules`), never from the live part configuration (G1).
 * - Every mandatory returned part stays a row online, flagged for opening or not (20cn, FR-OPN-008): the supplier was told a missing part is recorded as
 *   missing. An addendum row is answered against the portal acknowledgement (20co).
 * - Present is refused on a part no file was received for (20cv). Absent and Not applicable stay the officers' judgement, and the completeness switch
 *   decides what an Absent does (`verdict.ts`, unchanged).
 * - Only the named opening officers present at the opening act on the matrix, never an administrator; answers and decisions are each officer's own act, and
 *   a confirmation is too, except a paper confirmation, which one present officer may record for another (ruling 22, 20cp).
 * - A decision stands only once every named officer has confirmed the column as it now reads. A confirmation counts on the current reading (the as-read
 *   correction counter, `initials.ts`) and the current column revision, on both channels (ruling 22, 20cp, plan §1.3): every answer changed and every
 *   decision recorded or cleared raises the revision, so a confirmation taken before the change asks to be given again.
 * - The words never say "Pass" or "Fail" of a tally or a cell: Pass is the decision, and only the decision row says it (plan §1.1, the "Checklist result" row).
 */

import { formatDate } from "@/lib/format";
import type { BidPartRule } from "@/lib/bids/online/types";

import type { ChecklistItem } from "./checklist";
import { initialStale } from "./initials";
import type { ChecklistAnswer, Finding, OpeningVerdict } from "./types";

export type CellKind = "PAPER" | "CHECK_FILES" | "RECEIVED_NOT_CHECKED" | "NOT_RECEIVED" | "ADDENDUM";

export interface CellFacts {
  itemKey: string;
  kind: CellKind;
  /// CHECK_FILES and RECEIVED_NOT_CHECKED: the bid's files for the item's part, in upload order. Otherwise empty.
  fileIds: readonly string[];
  /// ADDENDUM on an online opening: the day the bidder's supplier acknowledged it on the portal; null: not acknowledged. Otherwise null.
  acknowledgedOn: string | null;
}

const ADDENDUM_KEY = /^addendum:(\d+)$/;

/// One bid's cells, one per frozen checklist item, in the checklist's order. Paper: every cell PAPER. Online: by the FROZEN rules (G1), never the live part configuration.
/// An item whose part has no frozen rule, or whose part code is not in the pack, is NOT_RECEIVED when the bid holds no file for it and RECEIVED_NOT_CHECKED otherwise (the narrower use, as `grantPlan`).
export function cellFacts(i: {
  online: boolean;
  items: readonly ChecklistItem[];
  /// The pack's parts: the checklist keys parts by code, the rules and files by pack part id.
  packParts: readonly { id: string; partCode: string }[];
  rules: readonly BidPartRule[];
  files: readonly { fileId: string; packPartId: string }[];
  /// Addendum number → acknowledgement day (ISO), for this bid's supplier.
  acknowledgements: ReadonlyMap<number, string>;
}): CellFacts[] {
  return i.items.map((item): CellFacts => {
    const none = { itemKey: item.key, fileIds: [] as string[], acknowledgedOn: null };
    if (!i.online) return { ...none, kind: "PAPER" };
    if (item.source === "ADDENDUM") {
      const m = ADDENDUM_KEY.exec(item.key);
      return { ...none, kind: "ADDENDUM", acknowledgedOn: m ? (i.acknowledgements.get(Number(m[1])) ?? null) : null };
    }
    // A code missing from the pack has no pack part id, so no file can be matched to it: nothing was received for it.
    const part = i.packParts.find((p) => p.partCode === item.key);
    const fileIds = part ? i.files.filter((f) => f.packPartId === part.id).map((f) => f.fileId) : [];
    if (fileIds.length === 0) return { ...none, kind: "NOT_RECEIVED" };
    const opened = part !== undefined && i.rules.some((r) => r.packPartId === part.id && r.openingCheck);
    return { ...none, kind: opened ? "CHECK_FILES" : "RECEIVED_NOT_CHECKED", fileIds };
  });
}

export type CellAnswerFault = "NO_FILE_RECEIVED";

/// Online only: Present is refused on a part no file was received for. Paper and every other cell: no fault.
export function cellAnswerFaults(cell: CellFacts, answer: ChecklistAnswer): Finding<CellAnswerFault>[] {
  return cell.kind === "NOT_RECEIVED" && answer === "PRESENT" ? [{ code: "NO_FILE_RECEIVED", level: "block" }] : [];
}

export interface ColumnTally { present: number; absent: number; notApplicable: number; unanswered: number; total: number }

/// Counts the answers to the checklist's own items; an answer to a key no longer on it is not counted.
export function columnTally(items: readonly ChecklistItem[], answers: ReadonlyMap<string, ChecklistAnswer>): ColumnTally {
  const t: ColumnTally = { present: 0, absent: 0, notApplicable: 0, unanswered: 0, total: items.length };
  for (const it of items) {
    const a = answers.get(it.key);
    if (a === "PRESENT") t.present++;
    else if (a === "ABSENT") t.absent++;
    else if (a === "NOT_APPLICABLE") t.notApplicable++;
    else t.unanswered++;
  }
  return t;
}

/// The words of a column with no checklist items at all.
export const EMPTY_TALLY_TEXT = "No items on the checklist";

/// "3 of 3 present", "2 of 3 present · 1 absent", "1 of 3 not applicable", "1 not answered". Never "Pass" or "Fail" (the overclaim scans hold this).
/// Each count that is not zero, in the order present, absent, not applicable, not answered; the first answered count says "of" the total, and "not answered" never does.
export function tallyText(t: ColumnTally): string {
  if (t.total === 0) return EMPTY_TALLY_TEXT;
  const answered = ([[t.present, "present"], [t.absent, "absent"], [t.notApplicable, "not applicable"]] as const).filter(([n]) => n > 0);
  const parts = answered.map(([n, w], k) => (k === 0 ? `${n} of ${t.total} ${w}` : `${n} ${w}`));
  if (t.unanswered > 0) parts.push(`${t.unanswered} not answered`);
  return parts.join(" · ");
}

export interface ColumnFacts { asReadCorrections: number; columnRevision: number }
export interface ConfirmationFacts { personId: string; correctionNo: number; columnRevision: number }

/// Both channels: taken on the current reading (`initialStale` as built) AND on the current column revision.
/// `online` is named by every caller, but the rule is the same on both channels (ruling 22, 20cp, plan §1.3): a paper initial taken before a decision was cleared
/// and recorded again must not count either. Rows from before the revision existed stand at revision 0 until the column next changes.
export function confirmationStands(online: boolean, bid: ColumnFacts, c: Pick<ConfirmationFacts, "correctionNo" | "columnRevision">): boolean {
  return !initialStale(bid, c) && c.columnRevision === bid.columnRevision;
}
export const standingConfirmations = <C extends Pick<ConfirmationFacts, "correctionNo" | "columnRevision">>(online: boolean, bid: ColumnFacts, cs: readonly C[]): C[] =>
  cs.filter((c) => confirmationStands(online, bid, c));

export type ColumnStatus = "ANSWERING" | "AWAITING_DECISION" | "AWAITING_CONFIRMATION" | "CONFIRMED";

/**
 * Where a column stands. Each named officer is in exactly one of `confirmed` (a standing confirmation), `stale` (confirmed before a change: confirm again) and
 * `awaiting` (no confirmation at all), in the order given. A confirmation by anyone not named is ignored. With no named officer at all the column is never
 * CONFIRMED: a decision stands on every named officer's confirmation, and an empty panel is a gap, not a pass.
 */
export function columnStatus(i: {
  online: boolean;
  tally: ColumnTally;
  verdict: OpeningVerdict | null;
  bid: ColumnFacts;
  officers: readonly { personId: string; name: string }[];
  confirmations: readonly ConfirmationFacts[];
}): { status: ColumnStatus; confirmed: { personId: string; name: string }[]; awaiting: { personId: string; name: string }[]; stale: { personId: string; name: string }[] } {
  const seen = new Set<string>();
  const officers = i.officers.filter((o) => !seen.has(o.personId) && !!seen.add(o.personId));
  const confirmed: { personId: string; name: string }[] = [];
  const awaiting: { personId: string; name: string }[] = [];
  const stale: { personId: string; name: string }[] = [];
  for (const o of officers) {
    const own = i.confirmations.filter((c) => c.personId === o.personId);
    const entry = { personId: o.personId, name: o.name };
    if (own.some((c) => confirmationStands(i.online, i.bid, c))) confirmed.push(entry);
    else if (own.length > 0) stale.push(entry);
    else awaiting.push(entry);
  }
  const status: ColumnStatus =
    i.tally.unanswered > 0 ? "ANSWERING" : i.verdict === null ? "AWAITING_DECISION" : officers.length === 0 || confirmed.length < officers.length ? "AWAITING_CONFIRMATION" : "CONFIRMED";
  return { status, confirmed, awaiting, stale };
}

export type MatrixActorFault = "ADMINISTRATOR" | "NOT_A_NAMED_OFFICER" | "NOT_OWN_ACT";

/// Both channels: the actor is not an administrator, and the actor and the subject are each a present panel member of this opening (20cp). NOT_OWN_ACT where the subject is not the actor,
/// except a paper confirmation (`act: "CONFIRM"`, not online), which one present panel member may record on behalf of another (3c-Q3, 20cp); the record names both.
/// Every fault that applies is returned (they accumulate), NOT_A_NAMED_OFFICER at most once, whether the actor, the subject or both are off the panel.
export function matrixActorFaults(i: { online: boolean; act: "ANSWER" | "DECIDE" | "CONFIRM"; administrator: boolean; actorPersonId: string; subjectPersonId: string; officers: readonly string[] }): Finding<MatrixActorFault>[] {
  const out: Finding<MatrixActorFault>[] = [];
  if (i.administrator) out.push({ code: "ADMINISTRATOR", level: "block" });
  if (!i.officers.includes(i.actorPersonId) || !i.officers.includes(i.subjectPersonId)) out.push({ code: "NOT_A_NAMED_OFFICER", level: "block" });
  const onBehalfAllowed = i.act === "CONFIRM" && !i.online;
  if (i.subjectPersonId !== i.actorPersonId && !onBehalfAllowed) out.push({ code: "NOT_OWN_ACT", level: "block" });
  return out;
}

export type ConfirmFault = "COLUMN_NOT_ANSWERED" | "DECISION_NOT_RECORDED";

/// Both channels: a confirmation needs every item answered and a decision recorded.
export function confirmFaults(i: { tally: ColumnTally; verdict: OpeningVerdict | null }): Finding<ConfirmFault>[] {
  const out: Finding<ConfirmFault>[] = [];
  if (i.tally.unanswered > 0) out.push({ code: "COLUMN_NOT_ANSWERED", level: "block", data: { count: i.tally.unanswered } });
  if (i.verdict === null) out.push({ code: "DECISION_NOT_RECORDED", level: "block" });
  return out;
}

export const MATRIX_FAULT_TEXT: Readonly<Record<CellAnswerFault | MatrixActorFault | ConfirmFault, string>> = {
  NO_FILE_RECEIVED: "No file was received for this part, so it cannot be recorded as present. Record it as absent or not applicable.",
  ADMINISTRATOR: "An administrator account does not answer, decide or confirm anything at an opening.",
  NOT_A_NAMED_OFFICER: "Only the named opening officers present at this opening record its answers, decisions and confirmations, and only for an officer present at it.",
  NOT_OWN_ACT: "Each named opening officer records this for themselves. Only a confirmation on a paper opening may be recorded for another officer present at it.",
  COLUMN_NOT_ANSWERED: "Every item in this column must be answered before the column is confirmed.",
  DECISION_NOT_RECORDED: "No decision is recorded for this column yet. Record it before confirming the column.",
};

/// Staff-facing English; no code reaches a screen. The addendum's own line, with its day, is `addendumCellText`.
export const CELL_WORDS: Readonly<Record<CellKind, string>> = {
  PAPER: "Checked against the envelope at the opening",
  CHECK_FILES: "Opened at the opening by the named opening officers",
  RECEIVED_NOT_CHECKED: "A file was received. It is not opened at the opening, only at finalising",
  NOT_RECEIVED: "No file was received for this part",
  ADDENDUM: "Answered from the portal's record of acknowledgements",
};

/// An online addendum cell's line: the day it was acknowledged on the portal (a YYYY-MM-DD day, as the organisation reads it), or that it was not.
export const addendumCellText = (acknowledgedOn: string | null): string => (acknowledgedOn ? `Acknowledged on the portal on ${formatDate(acknowledgedOn)}` : "Not acknowledged on the portal");

/// The addendum cell's line for a reader from whom the day is held until finalising (20c, 20cm): the day could be matched against the acknowledgement register to name the column.
export const ADDENDUM_DAY_HELD_TEXT = "The acknowledgement day is shown to the named opening officers until the opening is finalised";

/// Step 5: the confirmations row's status, in staff words. Never "approved" or "passed": a confirmation is each officer's initial on the column as it stands (ruling 22).
export const COLUMN_STATUS_TEXT: Readonly<Record<ColumnStatus, string>> = {
  ANSWERING: "Being answered",
  AWAITING_DECISION: "Answered, awaiting a decision",
  AWAITING_CONFIRMATION: "Awaiting confirmation",
  CONFIRMED: "Confirmed by every officer",
};
