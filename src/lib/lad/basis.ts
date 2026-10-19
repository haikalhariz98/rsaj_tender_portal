/**
 * The damages decision's basis, per scope (6.13 Part B run 1b: 613A-C2 (a)(1), (2) as approved, BD-613-89; FR-LAD-001,
 * 011; ADR 0030 §2). Pure.
 *
 * - FR-LAD-001: the LAD path cannot open while an extension-of-time determination is outstanding or positive. A claim
 *   open, or entitled and not yet certified, on the decision's scope blocks LAD_APPLIES (EOT_DETERMINATION_OUTSTANDING,
 *   naming it); a claim on the whole works blocks every scope, a section's claim that section and the whole works.
 *   EXCUSED_OR_PENDING names the open or entitled claim it waits on (EOT_CLAIM_REQUIRED), never free text alone.
 * - FR-LAD-011: one live decision per scope (the whole works, or each section); a further one replaces its own scope's,
 *   with its reason (Part A's replacement rule, per scope). Part A's decisions with no scope read as the whole works.
 * - Supersession (BD-613-89): an issued EOT certificate supersedes the live decision on a scope it moves, for later
 *   certificates only. A valuation past the new date is refused NON_COMPLETION_SUPERSEDED until a replacement; on or
 *   before it the decision is closed by the extension and nothing is asked.
 * - A Part A decision (basis CNC_DETERMINATION) stays live and readable until replaced, labelled as such.
 */

import { formatDate } from "@/lib/format";
import { replacementFaults, type DecisionRow } from "@/lib/lad/non-completion";
import type { Finding } from "@/lib/method/types";

type Day = string;
export type Scope = "WHOLE" | "SECTION";

export const scopeKey = (scope: Scope | null, sectionRef: string | null): string => (scope === "SECTION" && sectionRef ? `SECTION:${sectionRef}` : "WHOLE");

export interface ClaimFact {
  id: string;
  reference: string | null;
  scope: Scope;
  sectionRef: string | null;
  entitlement: "ENTITLED" | "NOT_ENTITLED" | null;
  closed: boolean;
  /// Its EOT certificate is issued.
  certified: boolean;
}

export type ClaimState = "OPEN" | "ENTITLED_UNCERTIFIED" | "CLOSED" | "CERTIFIED";

export function claimState(c: ClaimFact): ClaimState {
  if (c.closed) return "CLOSED";
  if (c.certified) return "CERTIFIED";
  return c.entitlement === "ENTITLED" ? "ENTITLED_UNCERTIFIED" : "OPEN";
}

const outstanding = (c: ClaimFact) => {
  const s = claimState(c);
  return s === "OPEN" || s === "ENTITLED_UNCERTIFIED";
};
const overlaps = (c: ClaimFact, scope: Scope, sectionRef: string | null) => c.scope === "WHOLE" || scope === "WHOLE" || c.sectionRef === sectionRef;

export function decisionBasisFaults(i: { outcome: "LAD_APPLIES" | "EXCUSED_OR_PENDING"; scope: Scope; sectionRef: string | null; claims: readonly ClaimFact[]; eotClaimId: string | null }): Finding[] {
  if (i.outcome === "LAD_APPLIES") {
    return i.claims.filter((c) => outstanding(c) && overlaps(c, i.scope, i.sectionRef)).map((c) => ({ code: "EOT_DETERMINATION_OUTSTANDING", level: "block" as const, data: { claim: c.reference, state: claimState(c) } }));
  }
  if (!i.eotClaimId) return [{ code: "EOT_CLAIM_REQUIRED", level: "block" }];
  const c = i.claims.find((x) => x.id === i.eotClaimId);
  return c && outstanding(c) ? [] : [{ code: "EOT_CLAIM_NOT_OUTSTANDING", level: "block", data: { claim: c?.reference ?? null } }];
}

export interface ScopedDecisionRow {
  id: string;
  scope: Scope | null;
  sectionRef: string | null;
  replacesId: string | null;
  /// Its Certificate of Non-Completion's status, or null where it opened none.
  certificateStatus: string | null;
}

/// The live decision of each scope (rows oldest first): the latest one no later decision replaced, whose certificate (if
/// any) is not void. Keys in the order the scopes were first decided.
export function liveDecisionsByScope<T extends ScopedDecisionRow>(rows: readonly T[]): Map<string, T> {
  const replaced = new Set(rows.map((r) => r.replacesId).filter((x): x is string => !!x));
  const out = new Map<string, T>();
  for (const r of rows) {
    const key = scopeKey(r.scope, r.sectionRef);
    if (!replaced.has(r.id) && r.certificateStatus !== "VOID") out.set(key, r);
  }
  // Keep the first-decided order: re-insert in the order each key first appears.
  const order = [...new Set(rows.map((r) => scopeKey(r.scope, r.sectionRef)))];
  return new Map(order.filter((k) => out.has(k)).map((k) => [k, out.get(k)!]));
}

/// Part A's replacement rule, on the decision's own scope.
export function replacementFaultsOnScope(live: ReadonlyMap<string, ScopedDecisionRow>, scope: Scope, sectionRef: string | null, i: { replacesId: string | null; reason: string; valuationInProgress?: string | null }): Finding[] {
  const l = live.get(scopeKey(scope, sectionRef)) ?? null;
  const row: DecisionRow | null = l ? { id: l.id, replacesId: l.replacesId, certificateStatus: l.certificateStatus } : null;
  return replacementFaults({ live: row, replacesId: i.replacesId, reason: i.reason, valuationInProgress: i.valuationInProgress ?? null });
}

export type Supersession = { state: "LIVE" } | { state: "CLOSED_BY_EXTENSION" } | { state: "REFUSED"; fault: Finding };

export function supersession(sup: { eotNumber: string | null; newDate: Day } | null, valuationDay: Day, scopeLabel: string): Supersession {
  if (!sup) return { state: "LIVE" };
  if (valuationDay <= sup.newDate) return { state: "CLOSED_BY_EXTENSION" };
  return { state: "REFUSED", fault: { code: "NON_COMPLETION_SUPERSEDED", level: "block", data: { scope: scopeLabel, eotNumber: sup.eotNumber, day: sup.newDate } } };
}

/// The note recorded on the decision at the EOT certificate's issue (BD-613-89).
export function supersededNote(number: string, newDate: Day, today: Day): { en: string;  } {
  const d = formatDate(newDate);
  return today <= newDate
    ? { en: `Closed by the extension of time ${number}: the new date for completion ${d} is not yet past.` }
    : { en: `Superseded by the extension of time ${number}: a valuation past ${d} needs a replacement decision.` };
}

export const PART_A_LABEL = {
  en: "Entitlement determined on the non-completion decision, before extension-of-time records",
} as const;
