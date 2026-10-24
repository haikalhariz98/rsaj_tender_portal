/**
 * A contractor's submission (Phase 4e; spec section 5.3, the appointed contractor: "submit the work programme ... interim claims and materials-on-site lists ... give
 * written notice of delay causes ... rectify defects ... submit the statutory declaration"), and the officer's answer to it (6.14 OD-6, BD-614-31: "each submission goes to an
 * officer against a service level"). Pure.
 *
 * - A submission is sent on a contract the supplier holds, while the contract is one that is being administered (the act × status table's SUPERVISION row, asked by the store).
 * - Each kind asks for what it needs and nothing else: a claim has an amount and the day it is made up to; a materials list has its lines and that day; a delay notice has the day
 *   the cause arose; a programme, a defects report and a declaration are words. A statutory declaration is signed with the password asked again.
 * - The due day is the day it was sent plus the kind's service level, in calendar days (ASSUMED: the governing documents give no calendar; a question to the customer). No service
 *   level: no due day, and the queue says so rather than showing none.
 * - The officer answers once: taken up (recorded on the contract through the act it calls for) or returned with a note the contractor reads.
 */

import { dayPlus, daysFrom, isDay } from "@/lib/dates";
import { parseSen } from "@/lib/money";

import { BODY_MAX, DISAGREEMENT_MAX, LINES_MAX, NOTE_MAX, TITLE_MAX, type ProjectFinding, type SubmissionKind, type SubmissionOutcome } from "./types";

export interface LineInput {
  description: string;
  quantity: string;
  location: string;
  /// Money as a decimal string ("1234.50").
  value: string;
}

export interface SubmissionInput {
  kind: SubmissionKind;
  title: string;
  body: string;
  /// INTERIM_CLAIM: the amount claimed, as a decimal string. Empty otherwise.
  amount: string;
  /// The day the claim or list is made up to, or the day the delay's cause arose (YYYY-MM-DD). Empty where the kind has none.
  aboutDay: string;
  lines: readonly LineInput[];
  /// The password was asked again for this act (a STATUTORY_DECLARATION needs it).
  signed: boolean;
  /// The organisation's day the submission is sent on.
  today: string;
}

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

/// What each kind asks for.
export const KIND_SHAPE: Readonly<Record<SubmissionKind, { amount: boolean; day: "UP_TO" | "AROSE" | null; lines: boolean; signed: boolean }>> = {
  WORK_PROGRAMME: { amount: false, day: null, lines: false, signed: false },
  INTERIM_CLAIM: { amount: true, day: "UP_TO", lines: false, signed: false },
  MATERIALS_ON_SITE: { amount: false, day: "UP_TO", lines: true, signed: false },
  DELAY_NOTICE: { amount: false, day: "AROSE", lines: false, signed: false },
  DEFECTS_RECTIFIED: { amount: false, day: null, lines: false, signed: false },
  STATUTORY_DECLARATION: { amount: false, day: null, lines: false, signed: true },
  // ADR 0045 D6: Project workspace only (the legacy table refuses it). No typed figures: the files carry them (WV-12).
  SUPPLY_CLAIM: { amount: false, day: null, lines: false, signed: false },
};

export function submissionFaults(i: SubmissionInput): ProjectFinding[] {
  const out: ProjectFinding[] = [];
  const f = (code: ProjectFinding["code"], data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  const shape = KIND_SHAPE[i.kind];
  if (!i.title.trim()) f("TITLE_REQUIRED");
  else if (i.title.trim().length > TITLE_MAX) f("TITLE_TOO_LONG", { max: TITLE_MAX });
  if (!i.body.trim()) f("BODY_REQUIRED");
  else if (i.body.trim().length > BODY_MAX) f("BODY_TOO_LONG", { max: BODY_MAX });
  if (shape.amount) {
    if (!i.amount.trim()) f("AMOUNT_REQUIRED");
    else if (!MONEY.test(i.amount.trim())) f("AMOUNT_FORMAT");
  } else if (i.amount.trim()) f("AMOUNT_NOT_ON_KIND");
  if (shape.day) {
    if (!i.aboutDay.trim()) f("DAY_REQUIRED");
    else if (!isDay(i.aboutDay.trim())) f("DAY_FORMAT");
    else if (i.aboutDay.trim() > i.today) f("DAY_IN_FUTURE", { day: i.today });
  } else if (i.aboutDay.trim()) f("DAY_NOT_ON_KIND");
  if (shape.lines) {
    if (i.lines.length === 0) f("LINES_REQUIRED");
    else if (i.lines.length > LINES_MAX) f("TOO_MANY_LINES", { max: LINES_MAX });
    else {
      for (const [n, l] of i.lines.entries()) {
        if (!l.description.trim() || !l.quantity.trim() || !l.location.trim()) f("LINE_INCOMPLETE", { line: n + 1 });
        if (!MONEY.test(l.value.trim())) f("LINE_VALUE_FORMAT", { line: n + 1 });
      }
    }
  } else if (i.lines.length > 0) f("LINES_NOT_ON_KIND");
  if (shape.signed && !i.signed) f("PASSWORD_REQUIRED");
  return out;
}

/**
 * How many submissions one portal account may send in a window (4e review fix). A technical bound, not the customer's policy (logged OPEN for the product owner, as the inspection
 * log's one-minute repeat rule was): far above any contractor's working pace, and low enough that a script under one session cannot flood the table and the S.O.'s inbox, whose
 * notices can never be deleted. Counted by the store from the submissions themselves.
 */
export const SUBMISSION_WINDOW_MINUTES = 60;
export const SUBMISSIONS_PER_WINDOW = 30;

export function submissionFloodFault(sentInWindow: number): ProjectFinding | null {
  return sentInWindow >= SUBMISSIONS_PER_WINDOW ? { code: "TOO_MANY_SUBMISSIONS", level: "block", data: { max: SUBMISSIONS_PER_WINDOW, minutes: SUBMISSION_WINDOW_MINUTES } } : null;
}

/// The amount as sen, for a claim whose fields passed.
export const amountSen = (amount: string) => parseSen(amount.trim());

/// The due day: the day sent plus the service level in calendar days (ASSUMED calendar). Null where no service level is set.
export function dueDayOf(submittedOn: string, serviceLevelDays: number | null): string | null {
  if (serviceLevelDays == null || serviceLevelDays < 1) return null;
  return dayPlus(submittedOn, serviceLevelDays);
}

export type ServiceState = { state: "NOT_SET" } | { state: "DUE"; dueOn: string; daysLeft: number } | { state: "OVERDUE"; dueOn: string; daysOver: number } | { state: "ANSWERED"; dueOn: string | null; onTime: boolean | null };

/// Where a submission stands against its service level on a day. Answered: whether it was answered by its due day (null where none was set).
export function serviceState(i: { dueOn: string | null; decidedOn: string | null; today: string }): ServiceState {
  if (i.decidedOn) return { state: "ANSWERED", dueOn: i.dueOn, onTime: i.dueOn ? i.decidedOn <= i.dueOn : null };
  if (!i.dueOn) return { state: "NOT_SET" };
  const diff = daysFrom(i.today, i.dueOn);
  return diff >= 0 ? { state: "DUE", dueOn: i.dueOn, daysLeft: diff } : { state: "OVERDUE", dueOn: i.dueOn, daysOver: -diff };
}

/// The officer's answer: once, with a note where it is returned.
export function answerFaults(i: { outcome: SubmissionOutcome; note: string; alreadyAnswered: boolean }): ProjectFinding[] {
  const out: ProjectFinding[] = [];
  if (i.alreadyAnswered) out.push({ code: "ALREADY_ANSWERED", level: "block" });
  if (i.outcome === "RETURNED" && !i.note.trim()) out.push({ code: "NOTE_REQUIRED", level: "block" });
  if (i.note.trim().length > NOTE_MAX) out.push({ code: "NOTE_TOO_LONG", level: "block", data: { max: NOTE_MAX } });
  return out;
}

/// A disagreement the contractor records on a diary entry from the portal: words, once.
export function disagreementFaults(i: { disagreement: string; existing: string }): ProjectFinding[] {
  if (i.existing.trim()) return [{ code: "ALREADY_DISPUTED", level: "block" }];
  if (!i.disagreement.trim()) return [{ code: "DISAGREEMENT_REQUIRED", level: "block" }];
  if (i.disagreement.trim().length > DISAGREEMENT_MAX) return [{ code: "DISAGREEMENT_TOO_LONG", level: "block", data: { max: DISAGREEMENT_MAX } }];
  return [];
}
