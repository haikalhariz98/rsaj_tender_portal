/**
 * Who signs the instrument (FR-AWD-002, DAL §3.1.4.4 item 5).
 *
 * Resolved from the customer's matrix rows on matter `award_signatory`, conditioned on
 * the instrument, at the awarded value. No row, two rows, or a known-gap row refuses
 * issue (6.11 ruling): the engine's upward reversion for an unrouted matter is not
 * applied — a contract signatory cannot be an assumption. The Person recorded as
 * signing must hold the office for the requisition's unit on the day they sign, or a
 * delegation of it where the rule allows one; any other signature is refused.
 */

import { resolveApproval, ruleIsDelegable } from "@/lib/authority/resolve";
import type { Matrix } from "@/lib/authority/types";
import { parseSen, type Sen } from "@/lib/money";
import type { Holders } from "@/lib/requisition/holders";

import { SIGNATORY_DOMAIN, type InstrumentKind } from "./types";

export type SignatoryFault = "SIGNATORY_UNRESOLVED" | "SIGNATORY_NOT_FOR_INSTRUMENT" | "SIGNATORY_AMBIGUOUS" | "SIGNATORY_GAP" | "SIGNATORY_BOUNDARY_UNDECIDED";

export type Signatory =
  | { ok: true; roleCode: string; roleLabel: string; ruleKey: string; ruleLabel: string; clause: string; recommenders: { roleCode: string; roleLabel: string; act: string }[]; delegable: boolean }
  | { ok: false; fault: SignatoryFault };

export function resolveSignatory(matrix: Matrix, q: { kind: InstrumentKind; value: number }): Signatory {
  return resolveSignatoryFor(matrix, { cond: q.kind, value: q.value });
}

/**
 * The one resolver for every signing on matter `award_signatory`, by the condition the rows name: an
 * instrument kind for the award (6.11), or the customer's condition for the contract agreement (6.12
 * OD-4 A, `ContractPolicy.signatoryCond`, frozen when preparation started). One signing band, one reading.
 */
export function resolveSignatoryFor(matrix: Matrix, q: { cond: string; value: number }): Signatory {
  const r = resolveApproval(matrix, { domain: SIGNATORY_DOMAIN, cond: q.cond, value: q.value });
  if (!r.rule || !r.rule.approverCode || r.rule.domain !== SIGNATORY_DOMAIN) return { ok: false, fault: "SIGNATORY_UNRESOLVED" };
  // A signatory row names the instrument it signs. A general row (no instrument) is
  // not read as covering both: which office signs which instrument is the customer's.
  if (r.rule.cond !== q.cond) return { ok: false, fault: "SIGNATORY_NOT_FOR_INSTRUMENT" };
  if (r.warnings.some((w) => w.code === "AMBIGUOUS")) return { ok: false, fault: "SIGNATORY_AMBIGUOUS" };
  if (r.rule.isGap) return { ok: false, fault: "SIGNATORY_GAP" };
  if (r.warnings.some((w) => w.code === "BOUNDARY_SWITCH_UNDECIDED")) return { ok: false, fault: "SIGNATORY_BOUNDARY_UNDECIDED" };
  const name = (c: string) => matrix.roles[c]?.nameEn ?? "An office no longer configured";
  return {
    ok: true,
    roleCode: r.rule.approverCode,
    roleLabel: name(r.rule.approverCode),
    ruleKey: r.rule.ruleKey,
    ruleLabel: r.rule.labelEn,
    clause: r.rule.clause,
    // Everyone before the signatory on the resolver's own chain — generated from the core
    // routing where the rule takes it from there — never the rule's fields restated
    // (6.9 ruling C3).
    recommenders: r.chain.slice(0, -1).map((x) => ({ roleCode: x.roleCode, roleLabel: name(x.roleCode), act: x.act })),
    // The engine's own reading: a fixed rule, a mandatory approval or a mandatory
    // recommendation is not delegated.
    delegable: ruleIsDelegable(r.rule),
  };
}

export type SignerFault = "NO_TIME_ZONE" | "NOT_HOLDER" | "INACTIVE" | "DELEGATION_NOT_PERMITTED" | "OVER_CEILING" | "FUTURE_DATE" | "BEFORE_APPROVAL";

/**
 * Whether a named Person may sign: a holder of the resolved office on the signing day,
 * or a delegate of it where the rule is delegable and the value within the ceiling.
 */
export function checkSignatory(
  sig: { delegable: boolean },
  person: { id: string; isActive: boolean } | null,
  holders: Holders,
  ctx: { today: string | null; signedOn: string; approvedOn: string | null; value: Sen },
): { faults: SignerFault[]; delegationId: string | null } {
  if (ctx.today == null) return { faults: ["NO_TIME_ZONE"], delegationId: null };
  const faults: SignerFault[] = [];
  let delegationId: string | null = null;
  if (ctx.signedOn > ctx.today) faults.push("FUTURE_DATE");
  if (ctx.approvedOn && ctx.signedOn < ctx.approvedOn) faults.push("BEFORE_APPROVAL");
  if (!person) return { faults: [...faults, "NOT_HOLDER"], delegationId };
  if (!person.isActive) faults.push("INACTIVE");
  if (!holders.holderIds.includes(person.id)) {
    const via = holders.delegates.find((d) => d.personId === person.id);
    if (!via) faults.push("NOT_HOLDER");
    else if (!sig.delegable) faults.push("DELEGATION_NOT_PERMITTED");
    else {
      delegationId = via.delegation.id;
      if (via.delegation.valueCeiling != null && ctx.value > parseSen(via.delegation.valueCeiling)) faults.push("OVER_CEILING");
    }
  }
  return { faults, delegationId };
}

/**
 * The day the appointment was approved, as the organisation reckons days: the latest
 * day a step of the approved route was decided. The route's own closing timestamp is
 * the moment it was saved, in UTC, and is not a day.
 */
export function approvedOnOf(route: { status: string; steps: readonly { decision: string; decidedOn: Date | null }[] } | null): string | null {
  if (!route || route.status !== "APPROVED") return null;
  const days = route.steps.filter((s) => s.decision === "DONE" && s.decidedOn).map((s) => s.decidedOn!.toISOString().slice(0, 10));
  return days.length ? days.sort().at(-1)! : null;
}
