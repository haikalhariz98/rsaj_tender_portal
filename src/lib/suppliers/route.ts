/**
 * A supplier matter's route through the engine (6.15 OD-2 A, OD-8 A): the domain (`supplier_registration`;
 * a2 adds `supplier_blacklist`), the condition (an application's kind), and **no value**. The ruling sets the
 * routing value null in 6.15a: a null value matches only a rule with no value band (`inBand`), never an
 * invented 0. The customer's matrix ships no rule for these domains; with none, the matter is refused,
 * naming the Approval matrix.
 *
 * The officer who sends the matter for decision is its requester (FR-APR-008, 6.1's rule reused): where
 * they hold the approving office the engine's self-approval rule escalates it, with nowhere to escalate
 * the route is refused naming the setting, and a step only they could act for is refused naming the way
 * out. A committee step is refused (the negotiation's rule, BD-65-6): no sitting tables a supplier matter,
 * so its decision would be read by nothing. Pure: the matrix and who may act are passed in.
 */

import { requesterOnlySteps, requesterOnlyText, type AbleToAct } from "@/lib/authority/requester-only";
import { resolveApproval } from "@/lib/authority/resolve";
import type { ApprovalStep, CoreChainRecord, Matrix, ResolutionWarning } from "@/lib/authority/types";
import type { Delegation } from "@/lib/people/delegation";
import type { Roster } from "@/lib/people/roster";
import { holdersFor, type Holders } from "@/lib/requisition/holders";

export type SupplierRouteState = "NO_RULE" | "RULE_UNSOUND" | "HAS_COMMITTEE_STEP" | "SELF_APPROVAL_NOWHERE" | "REQUESTER_ONLY" | "RESOLVED";

export interface SupplierRoute {
  state: SupplierRouteState;
  ruleKey: string | null;
  ruleLabel: string | null;
  clause: string | null;
  approverCode: string | null;
  chain: ApprovalStep[];
  boundaryOperator: "GT" | "GTE" | null;
  warnings: ResolutionWarning[];
  core?: CoreChainRecord;
  /// Why it cannot open, in words (English and Malay), where it cannot.
  refusal: { en: string; ms: string } | null;
}

export interface SupplierRequester {
  id: string;
  holds: (roleCode: string) => boolean;
  ableToAct: (roleCode: string) => AbleToAct;
}

const MATRIX_EXIT = {
  en: "Record a rule for it under Configuration › Approval matrix, with no value band (supplier matters are not routed on a value), then send it again.",
  ms: "Rekodkan peraturan untuknya di Konfigurasi › Matriks kelulusan, tanpa jalur nilai (perkara pembekal tidak dihalakan mengikut nilai), kemudian hantar semula.",
};

/**
 * The route for a supplier matter. `what` names the matter in the refusal ("a supplier's registration").
 */
export function supplierRoute(matrix: Matrix, domain: string, cond: string | null, requester: SupplierRequester, what: { en: string; ms: string }): SupplierRoute {
  const q = { domain, cond, value: null };
  let r = resolveApproval(matrix, q);
  const base = (state: SupplierRouteState, refusal: { en: string; ms: string } | null): SupplierRoute => ({
    state,
    ruleKey: r.rule?.ruleKey ?? null,
    ruleLabel: r.rule?.labelEn ?? null,
    clause: r.rule?.clause ?? null,
    approverCode: r.approverCode,
    chain: r.chain,
    boundaryOperator: r.boundaryOperator,
    warnings: r.warnings,
    core: r.core,
    refusal,
  });
  if (!r.rule) return base("NO_RULE", { en: `No approval rule in the matrix in force covers ${what.en}. ${MATRIX_EXIT.en}`, ms: `Tiada peraturan kelulusan dalam matriks yang berkuat kuasa meliputi ${what.ms}. ${MATRIX_EXIT.ms}` });
  const unsound = r.warnings.filter((w) => w.level === "err");
  if (unsound.length) return base("RULE_UNSOUND", { en: unsound.map((w) => w.messageEn).join(" "), ms: unsound.map((w) => w.messageMs).join(" ") });
  if (r.chain.some((s) => s.committeeCode))
    return base("HAS_COMMITTEE_STEP", {
      en: `The rule “${r.rule.labelEn}” routes ${what.en} through a committee, and no sitting tables a supplier matter, so its decision would never be read. Route it to offices under Configuration › Approval matrix, then send it again.`,
      ms: `Peraturan “${r.rule.labelMs ?? r.rule.labelEn}” menghalakan ${what.ms} melalui jawatankuasa, dan tiada mesyuarat membentangkan perkara pembekal, jadi keputusannya tidak akan dibaca. Halakan kepada jawatan di Konfigurasi › Matriks kelulusan, kemudian hantar semula.`,
    });
  if (r.approverCode && requester.holds(r.approverCode)) {
    const self = r.approverCode;
    const e = resolveApproval(matrix, { ...q, actorRoleCode: self });
    const refused = e.warnings.find((w) => w.code === "SELF_APPROVAL" && w.level === "err");
    if (refused || !e.approverCode) {
      const name = matrix.roles[self]?.nameEn ?? "the approving office";
      const nameMs = matrix.roles[self]?.nameMs ?? "jawatan yang meluluskan";
      return base("SELF_APPROVAL_NOWHERE", {
        en: `The officer sending it holds the office that approves ${what.en} (${name}), and no office is set to approve in its place. Set where self-approval escalates to for that office under Users & roles, or have another officer send it.`,
        ms: `Pegawai yang menghantarnya memegang jawatan yang meluluskan ${what.ms} (${nameMs}), dan tiada jawatan ditetapkan untuk meluluskan bagi pihaknya. Tetapkan ke mana kelulusan sendiri dinaikkan bagi jawatan itu di Pengguna & peranan, atau minta pegawai lain menghantarnya.`,
      });
    }
    r = e;
  }
  const only = requesterOnlySteps(r.chain, requester.id, requester.ableToAct);
  if (only.length) {
    // 6.1's words for the requester-only rule (English only, as written there).
    const en = only.map((s) => requesterOnlyText(s, matrix.roles[s.roleCode]?.nameEn ?? "an office no longer configured", "matter", matrix.policy.clauses?.selfApproval)).join(" ");
    return base("REQUESTER_ONLY", { en, ms: `Pegawai yang menghantarnya sahaja boleh bertindak bagi langkah ${only.map((s) => s.sequence).join(", ")} laluan ini, dan tiada sesiapa memutuskan langkah perkara yang dibangkitkannya. ${en}` });
  }
  return base("RESOLVED", null);
}

/**
 * The holders of an office for a supplier matter on a day: organisation-wide assignments only (a
 * supplier matter belongs to no unit, so no unit's holder is nearer), and only delegations with no value
 * ceiling (a matter routed on no value cannot be judged against one). The decider check, the requester
 * check and the worklist's "nobody able to act" all read this one.
 */
export function supplierHolders(roleCode: string, roster: Roster, delegations: readonly Delegation[], day: string): Holders {
  const h = holdersFor(roleCode, [], roster, delegations, day);
  return { ...h, delegates: h.delegates.filter((d) => d.delegation.valueCeiling == null) };
}
