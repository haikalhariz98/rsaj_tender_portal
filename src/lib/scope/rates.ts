/**
 * Schedules of rates (FR-EST-004). Pure.
 *
 * A schedule is issued issue by issue under one label: a draft is edited, then issued with
 * the day it takes effect from, which supersedes the issue issued before it. An issued or
 * superseded issue is never edited. Which issue is in force on a day is read from the days
 * each took effect, so an issue issued today to take effect next month leaves the one
 * before it in force until then.
 *
 * A line priced from a schedule keeps what the issue said on the day it was priced — the
 * issue's label and number, the day it took effect and the rate — so superseding the issue
 * later never touches it (`priceFromSchedule`). Days are the organisation's, YYYY-MM-DD.
 */

import type { Sen } from "@/lib/money";

import type { Finding } from "./types";

export type RateScheduleStatus = "DRAFT" | "ISSUED" | "SUPERSEDED";

export interface RateItem {
  code: string;
  descriptionEn: string;
  unit: string;
  rate: Sen;
}

export interface RateIssue {
  id: string;
  label: string;
  issueNo: number;
  status: RateScheduleStatus;
  /// The organisation's day it takes effect from. Null while a draft.
  effectiveFrom: string | null;
  items: readonly RateItem[];
}

const issued = (i: RateIssue) => i.status !== "DRAFT" && i.effectiveFrom != null;

/**
 * The issue of a schedule in force on a day: of the issued and superseded issues under the
 * label, the one that took effect last on or before the day (the later issue where two took
 * effect the same day). Null where none had taken effect: nothing is priced from a draft.
 */
export function scheduleInForce(issues: readonly RateIssue[], label: string, day: string): RateIssue | null {
  return (
    issues
      .filter((i) => i.label === label && issued(i) && i.effectiveFrom! <= day)
      .sort((a, b) => (a.effectiveFrom! < b.effectiveFrom! ? 1 : a.effectiveFrom! > b.effectiveFrom! ? -1 : b.issueNo - a.issueNo))[0] ?? null
  );
}

/// The labels of the schedules with an issue in force on a day, for the pricing choice.
export function schedulesInForce(issues: readonly RateIssue[], day: string): RateIssue[] {
  const labels = [...new Set(issues.map((i) => i.label))].sort((a, b) => a.localeCompare(b));
  return labels.map((l) => scheduleInForce(issues, l, day)).filter((i): i is RateIssue => i != null);
}

export type PriceFault = "TIME_ZONE_NOT_SET" | "SCHEDULE_NOT_IN_FORCE" | "ITEM_NOT_IN_ISSUE";

/// What a priced line keeps from the issue, as it read on the pricing day.
export interface PricedFromSchedule {
  rate: Sen;
  rateScheduleId: string;
  rateItemCode: string;
  scheduleLabelSnapshot: string;
  scheduleIssueSnapshot: string;
  scheduleEffectiveFromSnapshot: string;
}

/// The issue number as a line keeps it, in words.
export const issueText = (issueNo: number) => `Issue ${issueNo}`;

/**
 * Price a line from the issue of `label` in force on `day`. Refused where no issue is in
 * force (naming the label), or where that issue has no such item.
 */
export function priceFromSchedule(issues: readonly RateIssue[], label: string, itemCode: string, day: string | null): { ok: true; priced: PricedFromSchedule } | { ok: false; fault: Finding<PriceFault> } {
  if (day == null) return { ok: false, fault: { code: "TIME_ZONE_NOT_SET", level: "block" } };
  const issue = scheduleInForce(issues, label, day);
  if (!issue) return { ok: false, fault: { code: "SCHEDULE_NOT_IN_FORCE", level: "block", data: { schedule: label, on: day } } };
  const item = issue.items.find((x) => x.code === itemCode);
  if (!item) return { ok: false, fault: { code: "ITEM_NOT_IN_ISSUE", level: "block", data: { schedule: label, issue: issue.issueNo, item: itemCode } } };
  return {
    ok: true,
    priced: {
      rate: item.rate,
      rateScheduleId: issue.id,
      rateItemCode: item.code,
      scheduleLabelSnapshot: issue.label,
      scheduleIssueSnapshot: issueText(issue.issueNo),
      scheduleEffectiveFromSnapshot: issue.effectiveFrom!,
    },
  };
}

export type ScheduleFault =
  | "ISSUE_FROZEN"
  | "LABEL_REQUIRED"
  | "PROVENANCE_REQUIRED"
  | "ITEM_CODE_REQUIRED"
  | "CODE_TAKEN"
  | "ITEM_DESCRIPTION_REQUIRED"
  | "RATE_NEGATIVE"
  | "ISSUE_NO_ITEMS"
  | "EFFECTIVE_REQUIRED"
  | "EFFECTIVE_NOT_AFTER_CURRENT"
  | "ISSUER_REQUIRED"
  | "TIME_ZONE_NOT_SET"
  | "ISSUE_DRAFT_EXISTS";

/// An issued or superseded issue is frozen: nothing about it, or its items, is edited.
export function scheduleEditFault(issue: Pick<RateIssue, "status">): Finding<ScheduleFault> | null {
  return issue.status === "DRAFT" ? null : { code: "ISSUE_FROZEN", level: "block" };
}

/// The number the next issue under a label takes: one more than the highest so far.
export const nextIssueNo = (issues: readonly Pick<RateIssue, "label" | "issueNo">[], label: string) => Math.max(0, ...issues.filter((i) => i.label === label).map((i) => i.issueNo)) + 1;

/// Starting a new issue: one draft at a time under a label.
export function startIssueFaults(issues: readonly RateIssue[], label: string): Finding<ScheduleFault>[] {
  const out: Finding<ScheduleFault>[] = [];
  if (!label.trim()) out.push({ code: "LABEL_REQUIRED", level: "block" });
  else if (issues.some((i) => i.label === label && i.status === "DRAFT")) out.push({ code: "ISSUE_DRAFT_EXISTS", level: "block" });
  return out;
}

/// An item on a draft issue: a code unique within the issue, a description, a rate not below zero.
export function itemFaults(item: { code: string; descriptionEn: string; rate: Sen | null; id?: string }, issue: Pick<RateIssue, "status"> & { items: readonly (RateItem & { id?: string })[] }): (Finding<ScheduleFault> & { field?: string })[] {
  const out: (Finding<ScheduleFault> & { field?: string })[] = [];
  const edit = scheduleEditFault(issue);
  if (edit) return [edit];
  if (!item.code.trim()) out.push({ code: "ITEM_CODE_REQUIRED", level: "block", field: "code" });
  else if (issue.items.some((x) => x.code === item.code.trim() && (item.id == null || x.id !== item.id))) out.push({ code: "CODE_TAKEN", level: "block", field: "code" });
  if (!item.descriptionEn.trim()) out.push({ code: "ITEM_DESCRIPTION_REQUIRED", level: "block", field: "descriptionEn" });
  if (item.rate != null && item.rate < 0n) out.push({ code: "RATE_NEGATIVE", level: "block", field: "rate" });
  return out;
}

/**
 * Issuing a draft: it has items, a day it takes effect from that is after the day the issue
 * now issued under the label took effect (two issues never take effect on one day in an
 * order nobody chose), and a named issuer ("recorded on behalf of, not signed"). Returns the
 * issue it supersedes, if any.
 */
export function issueFaults(
  draft: RateIssue,
  issues: readonly RateIssue[],
  i: { effectiveFrom: string | null; issuedByPersonId: string | null; today: string | null },
): { faults: Finding<ScheduleFault>[]; supersedes: RateIssue | null } {
  const faults: Finding<ScheduleFault>[] = [];
  const edit = scheduleEditFault(draft);
  if (edit) return { faults: [edit], supersedes: null };
  if (draft.items.length === 0) faults.push({ code: "ISSUE_NO_ITEMS", level: "block" });
  if (i.today == null) faults.push({ code: "TIME_ZONE_NOT_SET", level: "block" });
  if (!i.effectiveFrom) faults.push({ code: "EFFECTIVE_REQUIRED", level: "block" });
  if (!i.issuedByPersonId) faults.push({ code: "ISSUER_REQUIRED", level: "block" });
  const current = issues.find((x) => x.label === draft.label && x.status === "ISSUED" && x.id !== draft.id) ?? null;
  if (current && i.effectiveFrom && current.effectiveFrom && i.effectiveFrom <= current.effectiveFrom) {
    faults.push({ code: "EFFECTIVE_NOT_AFTER_CURRENT", level: "block", data: { current: current.effectiveFrom, issue: current.issueNo } });
  }
  return { faults, supersedes: current };
}
