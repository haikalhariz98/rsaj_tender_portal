/**
 * FR-OPN-008, FR-BID-007 (6.6's ruling for 6.7): the checklist each bid is checked against at opening,
 * snapshotted when the opening starts. It is the approved pack's mandatory parts that a bidder returns
 * with its bid — the declaration (FR-DOC-008) by definition, every other part by the configured
 * `returnedByBidder` snapshotted on the pack part — then every addendum issued (6.5), which stays on
 * the checklist. A mandatory part whose return is not set is listed as not judged: the opening cannot
 * finalise completeness against it, and no bid's verdict is recorded while one is. Pure.
 */

import type { ChecklistItem } from "@/lib/bids/completeness";

import type { ChecklistAnswer, Finding } from "./types";

export type { ChecklistItem };

export interface PackPartForChecklist {
  partCode: string;
  label: string;
  role: string;
  mandatory: boolean | null;
  returnedByBidder: boolean | null;
  sortOrder: number;
}

export interface OpeningChecklist {
  items: ChecklistItem[];
  /// Mandatory parts whose return is not set: not judged, and finalising waits (6.6 ruling).
  notJudged: string[];
  /// Mandatory parts a bidder does not return (listed so the panel sees they were considered).
  notReturned: string[];
}

/// Returned by definition (FR-DOC-008).
export const returnedByDefinition = (role: string) => role === "DECLARATION";

export function openingChecklist(i: { parts: readonly PackPartForChecklist[]; addenda: readonly { number: number; title: string }[] }): OpeningChecklist {
  const parts = [...i.parts].filter((p) => p.mandatory === true).sort((a, b) => a.sortOrder - b.sortOrder);
  const returned = (p: PackPartForChecklist) => returnedByDefinition(p.role) || p.returnedByBidder === true;
  return {
    items: [
      ...parts.filter(returned).map((p) => ({ key: p.partCode, label: p.label, source: "PART" as const })),
      ...[...i.addenda].sort((a, b) => a.number - b.number).map((a) => ({ key: `addendum:${a.number}`, label: `Addendum ${a.number}: ${a.title}`, source: "ADDENDUM" as const })),
    ],
    notJudged: parts.filter((p) => !returned(p) && p.returnedByBidder == null).map((p) => p.label),
    notReturned: parts.filter((p) => !returnedByDefinition(p.role) && p.returnedByBidder === false).map((p) => p.label),
  };
}

/// The frozen checklist, as stored on the opening and read back (defensive about its shape).
export function checklistFromSnapshot(raw: unknown): OpeningChecklist {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const items = Array.isArray(o.items) ? o.items.filter((x): x is ChecklistItem => !!x && typeof x === "object" && typeof (x as ChecklistItem).key === "string" && typeof (x as ChecklistItem).label === "string") : [];
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { items, notJudged: strings(o.notJudged), notReturned: strings(o.notReturned) };
}

/// What a bid presented: an item is missing only where answered ABSENT; NOT_APPLICABLE is not missing.
export function missingItems(items: readonly ChecklistItem[], answers: ReadonlyMap<string, ChecklistAnswer>): ChecklistItem[] {
  return items.filter((it) => answers.get(it.key) === "ABSENT");
}

/// Items not yet answered for a bid.
export const unansweredItems = (items: readonly ChecklistItem[], answers: ReadonlyMap<string, ChecklistAnswer>) => items.filter((it) => !answers.has(it.key));

export type AnswerFault = "NOT_ON_CHECKLIST" | "ANSWER_REQUIRED";

/// An answer is for an item of the frozen checklist.
export function answerFaults(items: readonly ChecklistItem[], itemKey: string, answer: ChecklistAnswer | null): Finding<AnswerFault>[] {
  const out: Finding<AnswerFault>[] = [];
  if (!items.some((it) => it.key === itemKey)) out.push({ code: "NOT_ON_CHECKLIST", level: "block" });
  if (!answer) out.push({ code: "ANSWER_REQUIRED", level: "block" });
  return out;
}
