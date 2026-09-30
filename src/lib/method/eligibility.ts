/**
 * Which methods an exercise may use, which one the regime proposes, and why a choice
 * cannot stand (FR-MTD-004, 005, 010; rulings R-12, R-15).
 */

import type { Regime } from "@/lib/authority/types";
import { activeOn, availableInRegime } from "@/lib/reference/vocabulary";

import type { Finding, FundingPosture, Method } from "./types";

/// The methods in force that this exercise may use. Under a route whose external body
/// sets the route, the regime does not narrow the list: the note says who chose.
export function methodOptions(methods: readonly Method[], regime: Regime, posture: FundingPosture | null, on: Date): Method[] {
  if (posture === "RECORDS_ONLY") return [];
  const inForce = activeOn(methods, on);
  if (posture === "ROUTE_SET_EXTERNALLY") return inForce;
  return inForce.filter((m) => availableInRegime(m, regime));
}

export type ProposalOutcome =
  | { state: "PROPOSED"; code: string }
  | { state: "NO_DEFAULT" }
  | { state: "SEVERAL_DEFAULTS"; codes: string[] }
  | { state: "UNSET" };

const isDefault = (m: Method, regime: Regime) =>
  regime === "tender" ? m.defaultInTender : regime === "quotation" ? m.defaultInQuotation : m.defaultBelow;

/**
 * The method the regime proposes: the one in force marked default for it. None, or
 * more than one, proposes nothing — the approver then depends on the method, and is
 * never guessed. An empty list is unset, not "no default".
 */
export function proposedMethod(methods: readonly Method[], regime: Regime, on: Date): ProposalOutcome {
  const inForce = activeOn(methods, on);
  if (inForce.length === 0) return { state: "UNSET" };
  const defaults = inForce.filter((m) => isDefault(m, regime) && availableInRegime(m, regime));
  if (defaults.length === 1) return { state: "PROPOSED", code: defaults[0].code };
  if (defaults.length === 0) return { state: "NO_DEFAULT" };
  return { state: "SEVERAL_DEFAULTS", codes: defaults.map((m) => m.code) };
}

export type SelectionFault =
  | "METHODS_NOT_SET"
  | "SOURCING_NOT_PERMITTED"
  | "METHOD_REQUIRED"
  | "METHOD_UNKNOWN"
  | "METHOD_RETIRED"
  | "METHOD_NOT_IN_REGIME"
  | "OVERRIDE_REASON_REQUIRED"
  | "EXTERNAL_ROUTE_NOTE_REQUIRED"
  | "JUSTIFICATION_REQUIRED"
  | "PARENT_CONTRACT_REQUIRED";

export interface SelectionDraft {
  methodCode: string | null;
  methodReason: string;
  externalRouteNote: string;
  parentContractRef: string | null;
  justificationText: string;
}

export function selectionFaults(
  d: SelectionDraft,
  ctx: { methods: readonly Method[]; regime: Regime; posture: FundingPosture | null; on: Date },
): Finding<SelectionFault>[] {
  const out: Finding<SelectionFault>[] = [];
  const f = (code: SelectionFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (ctx.posture === "RECORDS_ONLY") return [{ code: "SOURCING_NOT_PERMITTED", level: "block" }];
  const proposed = proposedMethod(ctx.methods, ctx.regime, ctx.on);
  if (proposed.state === "UNSET") return [{ code: "METHODS_NOT_SET", level: "block" }];
  if (!d.methodCode) return [{ code: "METHOD_REQUIRED", level: "block" }];
  const m = ctx.methods.find((x) => x.code === d.methodCode);
  if (!m) return [{ code: "METHOD_UNKNOWN", level: "block" }];
  if (m.retiredOn != null && m.retiredOn <= ctx.on) f("METHOD_RETIRED", { method: m.nameEn });
  else if (!methodOptions(ctx.methods, ctx.regime, ctx.posture, ctx.on).some((x) => x.code === m.code)) f("METHOD_NOT_IN_REGIME", { method: m.nameEn, regime: ctx.regime });
  // A method other than the one the regime proposes is an override, and says why (R-12).
  if (proposed.state === "PROPOSED" && proposed.code !== m.code && !d.methodReason.trim()) {
    f("OVERRIDE_REASON_REQUIRED", { proposed: ctx.methods.find((x) => x.code === proposed.code)?.nameEn ?? null });
  }
  if (ctx.posture === "ROUTE_SET_EXTERNALLY" && !d.externalRouteNote.trim()) f("EXTERNAL_ROUTE_NOTE_REQUIRED");
  if (m.requiresJustification && !d.justificationText.trim()) f("JUSTIFICATION_REQUIRED", { prompt: m.justificationPrompt || null });
  // A call-off draws on a contract that is not in the portal yet (R-15).
  if (!m.requiresFreshSourcing && !d.parentContractRef?.trim()) f("PARENT_CONTRACT_REQUIRED");
  return out;
}
