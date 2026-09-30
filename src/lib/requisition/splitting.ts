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
import { addSen, senToDecimalString, type Sen } from "@/lib/money";

import { daysBetween, REQUISITION_DOMAIN, type RequisitionStatus, type SplitKey, type SplitState } from "./types";

export interface SplitSubject {
  id: string;
  reference: string;
  status: RequisitionStatus;
  /// YYYY-MM-DD.
  raisedOn: string;
  /// Exact sen, converted once from the database's Decimal string (`parseSen`).
  value: Sen;
  keys: Record<SplitKey, string | null>;
}

export interface SplitPolicy {
  windowDays: number | null;
  matchOn: readonly SplitKey[];
  aggregateAcrossYear: boolean | null;
  /// The company's financial year start, MM-DD, needed only to aggregate by year.
  financialYearStart: string | null;
}

export type NotSetReason = "WINDOW" | "MATCH_ON" | "YEAR_AGGREGATION" | "FINANCIAL_YEAR" | `MISSING_KEY:${SplitKey}`;

export interface SplitAssessment {
  state: SplitState;
  /// Why the check could not run, where it could not: a setting unset, or a key the
  /// requisition itself does not carry.
  notSet: NotSetReason[];
  related: { id: string; reference: string; value: Sen }[];
  /// Exact sen: the sum of this requisition and the related ones.
  combinedValue: Sen | null;
  crossesBand: boolean | null;
}

/// Sen to the ringgit number the authority engine takes, through the exact decimal string.
const amountOf = (sen: Sen) => Number(senToDecimalString(sen));

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
  // Unset is not "the window only": whether a financial year aggregates is policy too.
  if (policy.aggregateAcrossYear == null) notSet.push("YEAR_AGGREGATION");
  if (policy.aggregateAcrossYear === true && !policy.financialYearStart) notSet.push("FINANCIAL_YEAR");
  // A key the requisition itself lacks cannot relate it to anything: not assessed,
  // rather than silently clear.
  for (const k of policy.matchOn) if (req.keys[k] == null) notSet.push(`MISSING_KEY:${k}`);
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

  // Summed in exact sen: this total decides whether the pieces would have gone to a
  // higher band.
  const combinedValue = addSen(req.value, ...related.map((o) => o.value));
  let crossesBand: boolean | null = null;
  if (matrix) {
    // The engine reads ringgit as a number: the one conversion, here, from the exact
    // two-decimal string.
    const alone = amountOf(req.value);
    const together = amountOf(combinedValue);
    crossesBand =
      (resolveApproval(matrix, { domain: REQUISITION_DOMAIN, value: alone }).rule?.ruleKey ?? null) !==
        (resolveApproval(matrix, { domain: REQUISITION_DOMAIN, value: together }).rule?.ruleKey ?? null) ||
      regimeFor(alone, matrix.policy) !== regimeFor(together, matrix.policy);
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
 * How a stored split state reads, the same on the list and the record. Always from
 * what was stored: a NOT_SET check reads "Not assessed" for ever, however the policy
 * is set later.
 */
export function splitStateLabel(
  state: SplitState | null,
  justified = false,
): { label: string; tone: "ok" | "warn" | "err" | "neutral" } {
  if (state == null) return { label: "Not assessed", tone: "neutral" };
  if (state === "NOT_SET") return { label: "Not assessed · control not set", tone: "warn" };
  if (state === "CLEAR") return { label: "No split found", tone: "ok" };
  if (justified) return { label: "Possible split · justified", tone: "warn" };
  return { label: "Possible split", tone: "err" };
}

export type JustifierFault = "OFFICE_NOT_SET" | "TIME_ZONE_UNSET" | "REQUESTER" | "ENDORSER" | "NOT_HOLDER" | "DELEGATE" | "INACTIVE" | "FUTURE_DATE";

/**
 * Who may justify a flagged split (ruling Q3): a holder of the justifying office the
 * policy names, never the requester or an endorser. Unset office blocks. The Person is
 * named by the recording officer and recorded on their behalf, not signed.
 */
export function justifierFaults(ctx: {
  roleCode: string | null;
  person: { id: string; isActive: boolean } | null;
  requesterId: string;
  endorserIds: readonly string[];
  /// Direct holders of the justifying office for the requisition's unit, on the day.
  holderIds: readonly string[];
  /// People holding a delegation of it. Refused (ruling BD-26): only a direct holder
  /// may justify, until a justification records the delegation and a ceiling rule is
  /// decided. Named apart so the refusal can say why.
  delegateIds?: readonly string[];
  on: string;
  today: string | null;
}): JustifierFault[] {
  if (!ctx.roleCode) return ["OFFICE_NOT_SET"];
  if (ctx.today == null) return ["TIME_ZONE_UNSET"];
  const faults: JustifierFault[] = [];
  const pid = ctx.person?.id ?? null;
  if (!pid) return ["NOT_HOLDER"];
  if (pid === ctx.requesterId) faults.push("REQUESTER");
  if (ctx.endorserIds.includes(pid)) faults.push("ENDORSER");
  if (!ctx.holderIds.includes(pid)) faults.push(ctx.delegateIds?.includes(pid) ? "DELEGATE" : "NOT_HOLDER");
  if (!ctx.person!.isActive) faults.push("INACTIVE");
  if (ctx.on > ctx.today) faults.push("FUTURE_DATE");
  return faults;
}
