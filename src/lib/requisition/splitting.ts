/**
 * The anti-splitting check (FR-REQ-015, ruling OD-7 and OD-8).
 *
 * No governing document sets a splitting rule, so the relatedness keys, the window
 * and whether a financial year aggregates are the customer's policy, shipped unset
 * (B7). Unset is NOT_SET: submission proceeds, the state is stored and shown to the
 * approver, and it is never later shown as CLEAR. A FLAGGED result needs a recorded
 * justification before approval.
 */

import { regimeFor, resolveApproval } from "@/lib/authority/resolve";
import type { Matrix } from "@/lib/authority/types";

import { daysBetween, REQUISITION_DOMAIN, type RequisitionStatus, type SplitKey, type SplitState } from "./types";

export interface SplitSubject {
  id: string;
  reference: string;
  status: RequisitionStatus;
  /// YYYY-MM-DD.
  raisedOn: string;
  value: number;
  keys: Record<SplitKey, string | null>;
}

export interface SplitPolicy {
  windowDays: number | null;
  matchOn: readonly SplitKey[];
  aggregateAcrossYear: boolean | null;
  /// The company's financial year start, MM-DD, needed only to aggregate by year.
  financialYearStart: string | null;
}

export interface SplitAssessment {
  state: SplitState;
  /// Why the check could not run, where it could not.
  notSet: ("WINDOW" | "MATCH_ON" | "FINANCIAL_YEAR")[];
  related: { id: string; reference: string; value: number }[];
  combinedValue: number | null;
  crossesBand: boolean | null;
}

const EXCLUDED: ReadonlySet<RequisitionStatus> = new Set(["CANCELLED", "REJECTED"]);

/// The financial year a day falls in, labelled by the year it starts.
export function financialYearOf(day: string, start: string): number {
  const year = Number(day.slice(0, 4));
  return day.slice(5) >= start ? year : year - 1;
}

export function assessSplitting(
  req: SplitSubject,
  others: readonly SplitSubject[],
  policy: SplitPolicy,
  matrix: Matrix | null,
): SplitAssessment {
  const notSet: SplitAssessment["notSet"] = [];
  if (policy.windowDays == null) notSet.push("WINDOW");
  if (policy.matchOn.length === 0) notSet.push("MATCH_ON");
  if (policy.aggregateAcrossYear === true && !policy.financialYearStart) notSet.push("FINANCIAL_YEAR");
  if (notSet.length > 0) return { state: "NOT_SET", notSet, related: [], combinedValue: null, crossesBand: null };

  const window = policy.windowDays!;
  const related = others.filter((o) => {
    if (o.id === req.id || EXCLUDED.has(o.status)) return false;
    // Every key must be present and equal on both: a key one side lacks relates nothing.
    if (!policy.matchOn.every((k) => req.keys[k] != null && req.keys[k] === o.keys[k])) return false;
    if (Math.abs(daysBetween(o.raisedOn, req.raisedOn)) <= window) return true;
    return (
      policy.aggregateAcrossYear === true &&
      financialYearOf(o.raisedOn, policy.financialYearStart!) === financialYearOf(req.raisedOn, policy.financialYearStart!)
    );
  });

  if (related.length === 0) return { state: "CLEAR", notSet: [], related: [], combinedValue: null, crossesBand: null };

  // Summed in sen: this total decides whether the pieces would have gone to a higher band.
  const combinedSen = related.reduce((n, o) => n + Math.round(o.value * 100), Math.round(req.value * 100));
  const combinedValue = combinedSen / 100;
  let crossesBand: boolean | null = null;
  if (matrix) {
    const alone = resolveApproval(matrix, { domain: REQUISITION_DOMAIN, value: req.value });
    const together = resolveApproval(matrix, { domain: REQUISITION_DOMAIN, value: combinedValue });
    crossesBand =
      (alone.rule?.ruleKey ?? null) !== (together.rule?.ruleKey ?? null) ||
      regimeFor(req.value, matrix.policy) !== regimeFor(combinedValue, matrix.policy);
  }
  return {
    state: "FLAGGED",
    notSet: [],
    related: related.map((o) => ({ id: o.id, reference: o.reference, value: o.value })),
    combinedValue,
    crossesBand,
  };
}

/// Why approval must wait on the split check, or null.
export function splitApprovalFault(check: { state: SplitState; overrideJustification: string | null } | null): "JUSTIFICATION_REQUIRED" | null {
  return check?.state === "FLAGGED" && !check.overrideJustification?.trim() ? "JUSTIFICATION_REQUIRED" : null;
}

/**
 * How a stored split state reads. Always from what was stored: a NOT_SET check reads
 * "Not assessed" for ever, however the policy is set later.
 */
export function splitStateLabel(
  state: SplitState | null,
  justified = false,
  short = false,
): { label: string; tone: "ok" | "warn" | "err" | "neutral" } {
  if (state == null) return { label: "Not assessed", tone: "neutral" };
  if (state === "NOT_SET") return { label: short ? "Control not set" : "Not assessed · control not set", tone: "warn" };
  if (state === "CLEAR") return { label: short ? "No split found" : "No related requisitions", tone: "ok" };
  if (justified) return { label: short ? "Split justified" : "Possible split · justified", tone: "warn" };
  return { label: "Possible split", tone: "err" };
}
