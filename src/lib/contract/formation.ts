/**
 * Forming the Contract Document (FR-CON-003, 004, 005): the assembly in the basis's order, the
 * reconciliation against the tender, and the four checks. Pure: the caller passes what was frozen
 * when preparation started and what has been recorded since.
 *
 * Which checks a basis takes is read from the basis's own "let on a bill of quantities" answer
 * (6.2, `ContractBasis.requiresBq`), as frozen at the start of preparation: on a bill, the rates are
 * adjusted for uniformity (§7.3.2(c)); otherwise the Schedule of Rates' percentage adjustment or
 * amended rates are checked (§7.3.2(d)). The arithmetic and front-loading checks apply to every
 * basis. An unanswered basis is not read as either.
 */

import type { Sen } from "@/lib/money";
import { parsePercent } from "@/lib/securities/money";

import type { AssemblyPartState, Finding, FormationCheckKind, ReconciliationComparison, ReconciliationOutcome } from "./types";
import { RECONCILIATION_COMPARISONS } from "./types";

// ------------------------------------------------------------------ which checks

/// The checks a basis takes; null where the basis's answer was not set when preparation started.
export function applicableChecks(requiresBq: boolean | null): FormationCheckKind[] | null {
  if (requiresBq == null) return null;
  return requiresBq ? ["ARITHMETIC", "FRONT_LOADING", "RATE_UNIFORMITY"] : ["ARITHMETIC", "FRONT_LOADING", "SOR_ADJUSTMENT"];
}

// ------------------------------------------------------------------ assembly (FR-CON-003)

export type AssemblyFault = "NO_PARTS" | "CANCELLED_WITHOUT_STATEMENT";

export interface AssemblyPartFacts {
  label: string;
  state: AssemblyPartState;
  cancelledStatement: string;
}

/// The assembly is complete when it has its parts and every part an alternative cancelled says what it cancels.
export function assemblyFaults(parts: readonly AssemblyPartFacts[]): Finding<AssemblyFault>[] {
  if (parts.length === 0) return [{ code: "NO_PARTS", level: "block" }];
  return parts.filter((p) => p.state === "CANCELLED_BY_ALTERNATIVE" && !p.cancelledStatement.trim()).map((p) => ({ code: "CANCELLED_WITHOUT_STATEMENT" as const, level: "block" as const, data: { part: p.label } }));
}

// ------------------------------------------------------------------ reconciliation (FR-CON-004)

export type ReconciliationFault = "COMPARISON_NOT_RECORDED" | "AMENDMENT_NOT_RECORDED" | "AMENDMENT_UNSIGNED";

export interface ReconciliationFacts {
  comparison: ReconciliationComparison;
  outcome: ReconciliationOutcome;
  amendments: readonly { contractorSignatoryName: string; contractorSignedOn: string | null; officerSignedOn: string | null }[];
}

/**
 * All three comparisons recorded; one that found the documents amended lists its amendments, and every
 * amendment carries both signatures (the contractor's signatory and the preparing officer), recorded
 * on their behalf.
 */
export function reconciliationFaults(recs: readonly ReconciliationFacts[]): Finding<ReconciliationFault>[] {
  const out: Finding<ReconciliationFault>[] = [];
  for (const c of RECONCILIATION_COMPARISONS) {
    const r = recs.find((x) => x.comparison === c);
    if (!r) {
      out.push({ code: "COMPARISON_NOT_RECORDED", level: "block", data: { comparison: c } });
      continue;
    }
    if (r.outcome === "AMENDED" && r.amendments.length === 0) out.push({ code: "AMENDMENT_NOT_RECORDED", level: "block", data: { comparison: c } });
    for (const a of r.amendments) {
      if (!a.contractorSignatoryName.trim() || !a.contractorSignedOn || !a.officerSignedOn) out.push({ code: "AMENDMENT_UNSIGNED", level: "block", data: { comparison: c } });
    }
  }
  return out;
}

/// An amendment as recorded: what it amends, who signed for the contractor, and neither signature in the future.
export type AmendmentFault = "DESCRIPTION_REQUIRED" | "SIGNATORY_REQUIRED" | "FUTURE_DATE";
export function amendmentFaults(a: { description: string; contractorSignatoryName: string; contractorSignedOn: string; officerSignedOn: string }, today: string): Finding<AmendmentFault>[] {
  const out: Finding<AmendmentFault>[] = [];
  if (!a.description.trim()) out.push({ code: "DESCRIPTION_REQUIRED", level: "block" });
  if (!a.contractorSignatoryName.trim()) out.push({ code: "SIGNATORY_REQUIRED", level: "block" });
  if (a.contractorSignedOn > today || a.officerSignedOn > today) out.push({ code: "FUTURE_DATE", level: "block" });
  return out;
}

// ------------------------------------------------------------------ the checks (FR-CON-005)

export type CheckFault = "CHECKS_NOT_SET" | "CHECK_INCOMPLETE";

export interface CheckFacts {
  kind: FormationCheckKind;
  completedOn: string | null;
}

/// Every check the basis takes, complete with its officer and day. Unset: the basis's answer was not frozen.
export function checkFaults(applicable: readonly FormationCheckKind[] | null, checks: readonly CheckFacts[]): Finding<CheckFault>[] {
  if (applicable == null) return [{ code: "CHECKS_NOT_SET", level: "block" }];
  return applicable.filter((k) => !checks.find((c) => c.kind === k)?.completedOn).map((k) => ({ code: "CHECK_INCOMPLETE" as const, level: "block" as const, data: { check: k } }));
}

/**
 * The variance the arithmetic corrections produce against the tendered figures: Σ(corrected − tendered),
 * exactly, in sen. The accepted contract sum is not changed by it (OD-3 A, assumed): the difference is
 * shown beside the sum.
 */
export function arithmeticVariance(lines: readonly { tendered: Sen; corrected: Sen }[]): Sen {
  return lines.reduce((s, l) => s + (l.corrected - l.tendered), 0n);
}

export interface RateFacts {
  itemRef: string;
  tenderedRate: Sen;
  estimateRate: Sen;
  provisional: boolean;
}

/**
 * The rates to look at for front loading (FR-CON-005 b): those whose tendered rate is above the configured
 * multiple of the estimate rate, and, apart, those exactly at it (the configuration does not say which
 * side the multiple itself falls, so they are listed for the officer's judgement rather than read either
 * way). Provisionally measured items are listed first: the procedure names them. No ratio set: nothing
 * is computed, and the check is the officer's judgement alone. An estimate rate of nothing or less is
 * never divided by: listed above whenever anything was tendered on it.
 */
export function frontLoadingItems<T extends RateFacts>(rates: readonly T[], ratio: string | null): { state: "NO_RATIO" } | { state: "JUDGED"; above: T[]; atRatio: T[] } {
  if (ratio == null) return { state: "NO_RATIO" };
  const r = parsePercent(ratio); // ten-thousandths: "1.5" → 15000n
  const above: T[] = [];
  const atRatio: T[] = [];
  for (const x of rates) {
    if (x.estimateRate <= 0n) {
      if (x.tenderedRate > 0n) above.push(x);
      continue;
    }
    const lhs = x.tenderedRate * 10_000n;
    const rhs = x.estimateRate * r;
    if (lhs > rhs) above.push(x);
    else if (lhs === rhs) atRatio.push(x);
  }
  const order = (a: T, b: T) => Number(b.provisional) - Number(a.provisional);
  return { state: "JUDGED", above: above.sort(order), atRatio: atRatio.sort(order) };
}

export type CompleteFault = "NOT_FOR_BASIS" | "ALREADY_COMPLETE" | "FUTURE_DATE" | "BEFORE_PREPARATION" | "FRONT_LOADING_NOTE_REQUIRED" | "NO_RATE_COMPARED";

/**
 * Whether a check may be recorded complete: one the basis takes, not already complete, on a day neither
 * in the future nor before preparation started. Front loading needs at least one rate compared, and a
 * note saying what was done wherever rates were listed (or no ratio was set: the judgement is the note).
 */
export function completeFaults(i: { kind: FormationCheckKind; applicable: readonly FormationCheckKind[] | null; completedOn: string | null; on: string; today: string; preparationOn: string; note: string; rates: readonly RateFacts[]; ratio: string | null }): Finding<CompleteFault>[] {
  const out: Finding<CompleteFault>[] = [];
  if (!i.applicable?.includes(i.kind)) out.push({ code: "NOT_FOR_BASIS", level: "block" });
  if (i.completedOn) out.push({ code: "ALREADY_COMPLETE", level: "block" });
  if (i.on > i.today) out.push({ code: "FUTURE_DATE", level: "block" });
  if (i.on < i.preparationOn) out.push({ code: "BEFORE_PREPARATION", level: "block" });
  if (i.kind === "FRONT_LOADING") {
    if (i.rates.length === 0) out.push({ code: "NO_RATE_COMPARED", level: "block" });
    const fl = frontLoadingItems(i.rates, i.ratio);
    const listed = fl.state === "NO_RATIO" || fl.above.length + fl.atRatio.length > 0;
    if (i.rates.length > 0 && listed && !i.note.trim()) out.push({ code: "FRONT_LOADING_NOTE_REQUIRED", level: "block" });
  }
  return out;
}

/// What preparing the contract still lacks before it can go to the legal office.
export function formationFaults(i: { parts: readonly AssemblyPartFacts[]; reconciliations: readonly ReconciliationFacts[]; applicable: readonly FormationCheckKind[] | null; checks: readonly CheckFacts[] }): Finding<AssemblyFault | ReconciliationFault | CheckFault>[] {
  return [...assemblyFaults(i.parts), ...reconciliationFaults(i.reconciliations), ...checkFaults(i.applicable, i.checks)];
}
