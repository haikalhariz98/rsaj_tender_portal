/**
 * The Superintending Officer of a contract (FR-SUP-001, §7.2). The S.O. is an office, resolved from the approval
 * matrix's `superintending_officer` rows by the contract's value and regime (and type, where a row is confined to
 * one), never keyed: "a role rather than a post". Which office is the customer's configuration (Rule 1: the
 * bands RM300K / 1M / 3M are matrix rows, never code). The resolution is recorded with the rule and clause it
 * came from, and every holder is kept (append-only assignments; the office in force on a day is the latest
 * effective on or before it).
 *
 * A route that is an assumption (a known gap row) resolves and says so; a resolution with an error (no row,
 * an ambiguous tie, an undecided boundary, an undecided percentage edge) is refused: SO_UNRESOLVED, naming the
 * matrix. Pure.
 */

import { resolveApproval } from "@/lib/authority/resolve";
import type { Matrix, ResolutionWarning } from "@/lib/authority/types";

import type { Day, Finding } from "./types";

/// The matrix domain the S.O.'s rows carry (a configuration key, never shown).
export const SO_DOMAIN = "superintending_officer";

export interface SoQuery {
  /// The contract's value (the sum it was executed at, or the revised sum where re-resolved).
  contractValue: number;
  /// The regime the exercise was let in ("tender", "quotation"), as the rows are confined by method.
  regime: string | null;
  /// The contract type, where rows are confined by it (FR-APR-002).
  contractTypeCode: string | null;
}

export type SoResolution =
  | { state: "RESOLVED"; roleCode: string; roleLabel: string; ruleKey: string; ruleLabel: string; clause: string; notes: ResolutionWarning[] }
  | { state: "SO_UNRESOLVED"; errors: ResolutionWarning[] };

export function resolveSo(matrix: Matrix, q: SoQuery): SoResolution {
  const r = resolveApproval(matrix, { domain: SO_DOMAIN, method: q.regime, contractTypeCode: q.contractTypeCode, contractValue: q.contractValue });
  const errors = r.warnings.filter((w) => w.level === "err");
  if (!r.rule || !r.approverCode || errors.length) return { state: "SO_UNRESOLVED", errors };
  const role = matrix.roles[r.approverCode];
  return {
    state: "RESOLVED",
    roleCode: r.approverCode,
    roleLabel: role?.nameEn ?? "An office no longer configured",
    ruleKey: r.rule.ruleKey,
    ruleLabel: r.rule.labelEn,
    clause: r.rule.clause,
    // A known gap or an unchecked chain does not refuse it: it is said wherever the S.O. is shown.
    notes: r.warnings.filter((w) => w.level === "gap" || w.level === "warn"),
  };
}

export const soFaults = (r: SoResolution, matrixLabel: string | null): Finding[] =>
  r.state === "RESOLVED" ? [] : [{ code: "SO_UNRESOLVED", level: "block", data: { matrix: matrixLabel, why: r.errors.map((e) => e.code).join(",") || "NO_RULE" } }];

export interface AssignmentRow {
  id: string;
  roleCode: string;
  roleLabel: string;
  /// The organisation's day it holds from.
  effectiveOn: Day;
  /// Tie-break within a day: the moment recorded.
  recordedAt: Date;
}

/// The S.O. office in force on a day: the latest assignment effective on or before it. Null: none yet.
export function soOn<T extends AssignmentRow>(rows: readonly T[], day: Day): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.effectiveOn > day) continue;
    if (!best || r.effectiveOn > best.effectiveOn || (r.effectiveOn === best.effectiveOn && r.recordedAt > best.recordedAt)) best = r;
  }
  return best;
}

export type ResolveActFault = "NOT_EXECUTED" | "ALREADY_RESOLVED" | "SO_UNRESOLVED";

/**
 * The one-off "Resolve S.O." for a contract executed before 6.13 (the signature resolves it from then on):
 * only an executed contract with no S.O. yet.
 */
export function resolveActFaults(i: { executed: boolean; assignments: number }): Finding<ResolveActFault>[] {
  if (!i.executed) return [{ code: "NOT_EXECUTED", level: "block" }];
  if (i.assignments > 0) return [{ code: "ALREADY_RESOLVED", level: "block" }];
  return [];
}

/**
 * OD-A7: whether the S.O. is re-resolved when an issued adjustment moves the contract sum across a band. Unset
 * (null) warns on the contract and on each later S.O. signature block; it never silently reads as "no".
 */
export function reResolveReading(switchValue: boolean | null): { state: "ON" | "OFF" | "NOT_SET" } {
  return { state: switchValue == null ? "NOT_SET" : switchValue ? "ON" : "OFF" };
}
