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

import { resolveApproval } from "@/lib/authority/resolve";
import type { Matrix } from "@/lib/authority/types";
import { parseSen, type Sen } from "@/lib/money";
import type { Holders } from "@/lib/requisition/holders";

import { SIGNATORY_DOMAIN, type InstrumentKind } from "./types";

export type SignatoryFault = "SIGNATORY_UNRESOLVED" | "SIGNATORY_AMBIGUOUS" | "SIGNATORY_GAP" | "SIGNATORY_BOUNDARY_UNDECIDED";

export type Signatory =
  | { ok: true; roleCode: string; roleLabel: string; ruleKey: string; ruleLabel: string; clause: string; recommenders: { roleCode: string; roleLabel: string; act: string }[]; delegable: boolean }
  | { ok: false; fault: SignatoryFault };

export function resolveSignatory(matrix: Matrix, q: { kind: InstrumentKind; value: number }): Signatory {
  const r = resolveApproval(matrix, { domain: SIGNATORY_DOMAIN, cond: q.kind, value: q.value });
  if (!r.rule || !r.rule.approverCode || r.rule.domain !== SIGNATORY_DOMAIN || r.rule.cond !== q.kind) return { ok: false, fault: "SIGNATORY_UNRESOLVED" };
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
    recommenders: r.rule.recommenders.map((x) => ({ roleCode: x.roleCode, roleLabel: name(x.roleCode), act: x.act })),
    delegable: !r.rule.nonDelegable,
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
