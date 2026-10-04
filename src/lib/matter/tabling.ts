/**
 * Tabling a committee's step from the matter's own record (6.13 Part B run 1a; ADR 0029 §3, BD-613-73). Pure.
 *
 * Generalised from the variation's tabling (6.13 Part A step 4, FR-VAR-010, 013), which goes through it unchanged: a
 * step's matter is tabled once and waits for the committee's decision (a matter pending or deferred stands), and a step
 * is cited only from a matter the committee has decided. One rule for every matter tabled from its record (a variation,
 * a contract matter), never at a sitting; it also gives the committee matter's typed keys, so a VARIATION matter names
 * its variation and a CONTRACT matter its contract matter (the CHECKs CommitteeDecision_variation_matter and
 * CommitteeDecision_contract_matter).
 */

import type { Finding } from "@/lib/method/types";

export interface MatterFact {
  withdrawn: boolean;
  /// The route's domain the matter was tabled for.
  domain: string;
  committeeCode: string;
  outcome: "PENDING" | "DEFERRED" | "CARRIED" | "NOT_CARRIED";
}

const forStep = (m: MatterFact, domain: string, committeeCode: string) => !m.withdrawn && m.domain === domain && m.committeeCode === committeeCode;

/// Tabling the step's matter: refused while one stands waiting for the committee (tabled and pending, or deferred).
export function tableFaults(matters: readonly MatterFact[], domain: string, committeeCode: string): Finding[] {
  return matters.some((m) => forStep(m, domain, committeeCode) && (m.outcome === "PENDING" || m.outcome === "DEFERRED")) ? [{ code: "ALREADY_TABLED", level: "block" }] : [];
}

/// Citing the step: there must be a matter tabled for it, and the committee must have decided it.
export function citeFaults(matters: readonly MatterFact[], domain: string, committeeCode: string): Finding[] {
  const mine = matters.filter((m) => forStep(m, domain, committeeCode));
  if (!mine.length) return [{ code: "NOT_TABLED_YET", level: "block" }];
  if (!mine.some((m) => m.outcome === "CARRIED" || m.outcome === "NOT_CARRIED")) return [{ code: "NOT_DECIDED_YET", level: "block" }];
  return [];
}

/// The record a committee matter is tabled from: a variation (Part A) or a contract matter (Part B, ADR 0029).
export type TabledFrom = { kind: "VARIATION"; id: string; reference: string | null } | { kind: "CONTRACT"; id: string; reference: string | null };

export type TabledKeys = { matterKind: "VARIATION"; matterRef: string | null; variationId: string } | { matterKind: "CONTRACT"; matterRef: string | null; contractMatterId: string };

/// The one tabling rule for a matter tabled from its record, with the committee matter's typed keys.
export function tablingOf(from: TabledFrom, matters: readonly MatterFact[]) {
  const keys: TabledKeys = from.kind === "VARIATION" ? { matterKind: "VARIATION", matterRef: from.reference, variationId: from.id } : { matterKind: "CONTRACT", matterRef: from.reference, contractMatterId: from.id };
  return {
    tableFaults: (domain: string, committeeCode: string) => tableFaults(matters, domain, committeeCode),
    citeFaults: (domain: string, committeeCode: string) => citeFaults(matters, domain, committeeCode),
    keys,
  };
}
