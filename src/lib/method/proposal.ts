/**
 * The selected-tender proposal (FR-MTD-006): every required item answered before it
 * goes to review, and reviewed before the name is sent for approval. C&P reviews,
 * comments and adjusts; the review names the reviewer, recorded on their behalf.
 */

import type { ChecklistItem, Finding, ProposalState } from "./types";

export type ProposalFault = "ITEMS_NOT_SET" | "ITEM_EMPTY" | "NOT_DRAFT" | "NOT_SUBMITTED" | "NOT_REVIEWED" | "REVIEWER_REQUIRED" | "FUTURE_DATE" | "TIME_ZONE_UNSET";

const liveItems = (items: readonly ChecklistItem[], on: Date) => items.filter((i) => i.retiredOn == null || i.retiredOn > on).sort((a, b) => a.sortOrder - b.sortOrder);

/// Required items in force with nothing but whitespace in them. A method that asks for
/// a proposal but lists no items has not been configured, which is not "complete".
export function proposalFaults(items: readonly ChecklistItem[], answers: readonly { itemKey: string; text: string }[], on: Date): Finding<ProposalFault>[] {
  const live = liveItems(items, on);
  if (live.length === 0) return [{ code: "ITEMS_NOT_SET", level: "block" }];
  const text = new Map(answers.map((a) => [a.itemKey, a.text]));
  return live
    .filter((i) => i.required && !(text.get(i.key) ?? "").trim())
    .map((i) => ({ code: "ITEM_EMPTY" as const, level: "block" as const, data: { item: i.labelEn } }));
}

export function proposalTransition(
  from: ProposalState | null,
  to: ProposalState,
  ctx: { faults: readonly Finding[]; reviewerPersonId?: string | null; on?: string | null; today: string | null },
): Finding<ProposalFault>[] {
  if (ctx.today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<ProposalFault>[] = [];
  if (to === "SUBMITTED") {
    if (from !== "DRAFT") out.push({ code: "NOT_DRAFT", level: "block" });
    out.push(...(ctx.faults as Finding<ProposalFault>[]));
  }
  if (to === "REVIEWED" || to === "DRAFT") {
    if (from !== "SUBMITTED") out.push({ code: "NOT_SUBMITTED", level: "block" });
    if (!ctx.reviewerPersonId) out.push({ code: "REVIEWER_REQUIRED", level: "block" });
  }
  if (ctx.on && ctx.on > ctx.today) out.push({ code: "FUTURE_DATE", level: "block" });
  return out;
}

/// The name may be sent for approval only once the proposal, where one is asked for,
/// has been reviewed.
export function nameRequestProposalFault(requiresProposal: boolean, state: ProposalState | null): Finding<ProposalFault> | null {
  if (!requiresProposal) return null;
  return state === "REVIEWED" ? null : { code: "NOT_REVIEWED", level: "block" };
}

/**
 * The proposal state an exercise holds for its method: a method that asks for a
 * proposal opens one (FR-MTD-005); one that does not holds none. A change of method or
 * of value re-opens a submitted or reviewed proposal as a draft — it was reviewed for a
 * different exercise (6.3 ruling on BD-5). Answers already given are kept.
 */
export function proposalStateFor(requiresProposal: boolean, current: ProposalState | null, changed: boolean): ProposalState | null {
  if (!requiresProposal) return null;
  if (current == null || changed) return "DRAFT";
  return current;
}

/// One item as submitted: its key, its wording and whether it was required, with the
/// answer given. Stored on submission (6.3 ruling on the proposal record).
export interface ProposalRecordItem {
  key: string;
  label: string;
  required: boolean;
  answer: string;
}
export interface ProposalRecord {
  v: 1;
  items: ProposalRecordItem[];
}

export function proposalRecordOf(items: readonly ChecklistItem[], answers: readonly { itemKey: string; text: string }[], on: Date): ProposalRecord {
  const text = new Map(answers.map((a) => [a.itemKey, a.text]));
  return { v: 1, items: liveItems(items, on).map((i) => ({ key: i.key, label: i.labelEn, required: i.required, answer: text.get(i.key) ?? "" })) };
}

export function isProposalRecord(x: unknown): x is ProposalRecord {
  return typeof x === "object" && x != null && (x as { v?: unknown }).v === 1 && Array.isArray((x as { items?: unknown }).items);
}

export interface ProposalRow {
  key: string;
  label: string;
  required: boolean;
  answer: string;
}

/**
 * What the proposal shows. Being prepared: the method's items in force, with the answers
 * so far. Submitted, reviewed or decided: the stored record, including items retired or
 * reworded since. A proposal submitted before the record was kept has none; it then
 * shows the items in force and says so (`fromRecord` false).
 */
export function proposalView(
  state: ProposalState | null,
  record: unknown,
  items: readonly ChecklistItem[],
  answers: readonly { itemKey: string; text: string }[],
  on: Date,
): { rows: ProposalRow[]; fromRecord: boolean } {
  if (state && state !== "DRAFT" && isProposalRecord(record)) return { rows: record.items, fromRecord: true };
  const text = new Map(answers.map((a) => [a.itemKey, a.text]));
  return { rows: liveItems(items, on).map((i) => ({ key: i.key, label: i.labelEn, required: i.required, answer: text.get(i.key) ?? "" })), fromRecord: false };
}
