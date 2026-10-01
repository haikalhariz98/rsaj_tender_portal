/**
 * Retention and disposal (NFR-RET-001, NFR-RET-002). Computed, never acted on: this
 * build has no disposal run and deletes nothing. `disposalFault` exists so the rule is
 * built and tested before anything calls it.
 *
 * An unset period or trigger never elapses — "not set" is not "zero". The clock runs
 * from the trigger day: a retention of N months from day D elapses on D plus N months
 * (month-end clamped), and is RUNNING until the day before.
 *
 * BD-DS-10 as ruled: a period is a whole number of months, at least one. The database
 * refuses anything else on the class (CHECK `DocumentClass_retention_positive`), so zero
 * is never read as "not set": a period that is not one — only possible in a snapshot
 * taken before the CHECK — reads PERIOD_INVALID, which never elapses and blocks disposal
 * naming it.
 */

import { addMonths } from "@/lib/securities/period";

import type { DisposalMethod, Finding, RetentionTrigger } from "./types";

/// A class's retention as a document snapshots it at creation.
export interface RetentionRule {
  retentionMonths: number | null;
  retentionTrigger: RetentionTrigger | null;
  disposalMethod: DisposalMethod | null;
  /// The office whose authority a disposal needs, by its code; rendered by name.
  disposalAuthorityRoleCode: string | null;
}

export type RetentionState =
  | { state: "NOT_SET"; missing: ("PERIOD" | "TRIGGER")[] }
  | { state: "PERIOD_INVALID"; months: number }
  | { state: "TRIGGER_NOT_REACHED"; trigger: RetentionTrigger }
  | { state: "RUNNING"; elapsesOn: string }
  | { state: "ELAPSED"; elapsedOn: string };

/// `triggerDay`: the day the class's trigger happened for this document, or null if it has not.
export function retentionState(rule: Pick<RetentionRule, "retentionMonths" | "retentionTrigger">, triggerDay: string | null, today: string): RetentionState {
  if (rule.retentionMonths != null && !isRetentionPeriod(rule.retentionMonths)) return { state: "PERIOD_INVALID", months: rule.retentionMonths };
  const missing: ("PERIOD" | "TRIGGER")[] = [];
  if (rule.retentionMonths == null) missing.push("PERIOD");
  if (rule.retentionTrigger == null) missing.push("TRIGGER");
  if (missing.length) return { state: "NOT_SET", missing };
  if (triggerDay == null) return { state: "TRIGGER_NOT_REACHED", trigger: rule.retentionTrigger! };
  const elapsesOn = addMonths(triggerDay, rule.retentionMonths!);
  return today >= elapsesOn ? { state: "ELAPSED", elapsedOn: elapsesOn } : { state: "RUNNING", elapsesOn };
}

/// A retention period as the CHECK allows it: a whole number of months, at least one.
export const isRetentionPeriod = (months: number) => Number.isInteger(months) && months >= 1;

export function isRetentionRule(x: unknown): x is RetentionRule {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return "retentionMonths" in r && "retentionTrigger" in r && "disposalMethod" in r && "disposalAuthorityRoleCode" in r;
}

export type DisposalFault =
  | "RETENTION_NOT_SET"
  | "RETENTION_PERIOD_INVALID"
  | "TRIGGER_NOT_REACHED"
  | "RETENTION_RUNNING"
  | "ON_LEGAL_HOLD"
  | "OBLIGATION_OUTSTANDING"
  | "DISPOSAL_METHOD_NOT_SET"
  | "DISPOSAL_AUTHORITY_NOT_SET";

/**
 * Whether a document could be disposed of today. Every reason it may not is returned:
 * retention not set or still running, a legal hold standing, any obligation that
 * survives on the record it belongs to (a bond, a guarantee, a claim — passed in by the
 * caller, labelled), and the disposal method or authority not set. No caller in this
 * build: there is no disposal run.
 */
export function disposalFault(
  doc: { retention: RetentionRule; triggerDay: string | null },
  holds: readonly { releasedAt: Date | null }[],
  survivingObligations: readonly { label: string }[],
  today: string,
): Finding<DisposalFault>[] {
  const out: Finding<DisposalFault>[] = [];
  const st = retentionState(doc.retention, doc.triggerDay, today);
  if (st.state === "NOT_SET") out.push({ code: "RETENTION_NOT_SET", level: "block", data: { missing: st.missing.join(",") } });
  if (st.state === "PERIOD_INVALID") out.push({ code: "RETENTION_PERIOD_INVALID", level: "block", data: { months: st.months } });
  if (st.state === "TRIGGER_NOT_REACHED") out.push({ code: "TRIGGER_NOT_REACHED", level: "block", data: { trigger: st.trigger } });
  if (st.state === "RUNNING") out.push({ code: "RETENTION_RUNNING", level: "block", data: { until: st.elapsesOn } });
  const standing = holds.filter((h) => h.releasedAt == null).length;
  if (standing) out.push({ code: "ON_LEGAL_HOLD", level: "block", data: { count: standing } });
  for (const o of survivingObligations) out.push({ code: "OBLIGATION_OUTSTANDING", level: "block", data: { obligation: o.label } });
  if (doc.retention.disposalMethod == null) out.push({ code: "DISPOSAL_METHOD_NOT_SET", level: "block" });
  if (!doc.retention.disposalAuthorityRoleCode) out.push({ code: "DISPOSAL_AUTHORITY_NOT_SET", level: "block" });
  return out;
}
