/**
 * What an exercise was judged under, frozen (lessons: a decided record renders from
 * its snapshot; later configuration edits never rewrite it).
 *
 * `bandSnapshot` is written on every save of a draft and read by the screen: the band
 * labels, the approvers' names and the terms set as they stood that day.
 * `classificationSnapshot` is written once, on the move into preparation: the method's
 * flags, the contract type and its twelve behaviours, the mixed-scope threshold with
 * its provenance, the basis and the taxonomy outcomes.
 */

import type { BandDetermination } from "./bands";
import type { BehaviourKey, BehaviourValue } from "./profile";
import type { TaxonomyState } from "./taxonomy";
import type { BoundaryOperator, ContractTypeState, Method, Provenance, Regime } from "./types";

export interface ChainStepSnap {
  role: string;
  act: string;
  committee: boolean;
}

export interface RouteSnap {
  state: string;
  ruleLabel: string | null;
  clause: string | null;
  approver: string | null;
  committee: string | null;
  committeeAct: string | null;
  chain: ChainStepSnap[];
  /// The funder's rule set that routed it, where one did.
  overrideLabel: string | null;
  warnings: { level: string; text: string }[];
}

export interface BandSnapshot {
  v: 1;
  matrixLabel: string;
  regime: Regime;
  proposed: { state: string; method: string | null };
  method: string | null;
  requisitionPreview: { ruleLabel: string | null; approver: string | null };
  appointment: RouteSnap;
  nameApproval: (RouteSnap & { nameState: string }) | null;
  terms: {
    state: string;
    label: string | null;
    retentionApplies: boolean | null;
    defectsLiabilityApplies: boolean | null;
    insuranceNote: string;
    clause: string | null;
    provenance: Provenance | null;
  };
  boundary: { value: number; operator: BoundaryOperator; onBoundary: boolean; ruled: boolean; provenance: Provenance; source: string };
}

export function bandSnapshot(
  d: BandDetermination,
  ctx: { matrixLabel: string; boundarySource: string; name: (code: string) => string; methodName: (code: string) => string },
): BandSnapshot {
  const route = (a: BandDetermination["appointment"]): RouteSnap => ({
    state: a.state,
    ruleLabel: a.ruleLabel,
    clause: a.clause,
    approver: a.approverCode ? ctx.name(a.approverCode) : null,
    committee: a.committeeCode ? ctx.name(a.committeeCode) : null,
    committeeAct: a.committeeAct,
    chain: a.chain.map((s) => ({ role: ctx.name(s.roleCode), act: s.act, committee: !!s.committeeCode })),
    overrideLabel: a.overrideIssue?.label ?? null,
    warnings: a.warnings.map((w) => ({ level: w.level, text: w.messageEn })),
  });
  return {
    v: 1,
    matrixLabel: ctx.matrixLabel,
    regime: d.regime,
    proposed: { state: d.proposed.state, method: d.proposed.state === "PROPOSED" ? ctx.methodName(d.proposed.code) : null },
    method: d.previewMethod ? d.previewMethod.nameEn : null,
    requisitionPreview: { ruleLabel: d.requisition.ruleLabel, approver: d.requisition.approverCode ? ctx.name(d.requisition.approverCode) : null },
    appointment: route(d.appointment),
    nameApproval: d.nameApproval ? { ...route(d.nameApproval), nameState: d.nameApproval.nameState } : null,
    terms: {
      state: d.terms.state,
      label: d.terms.band?.labelEn ?? null,
      retentionApplies: d.terms.band?.retentionApplies ?? null,
      defectsLiabilityApplies: d.terms.band?.defectsLiabilityApplies ?? null,
      insuranceNote: d.terms.band?.insuranceNote ?? "",
      clause: d.terms.band?.clause ?? null,
      provenance: d.terms.band?.provenance ?? null,
    },
    boundary: { value: d.boundary.boundaryValue, operator: d.boundary.operator, onBoundary: d.boundary.onBoundary, ruled: d.boundary.ruled, provenance: d.boundary.provenance, source: ctx.boundarySource },
  };
}

export function isBandSnapshot(x: unknown): x is BandSnapshot {
  return typeof x === "object" && x != null && (x as { v?: unknown }).v === 1 && typeof (x as { regime?: unknown }).regime === "string";
}

export interface ClassificationSnapshot {
  v: 1;
  method: {
    code: string;
    nameEn: string;
    committee: string | null;
    flags: Pick<Method, "requiresJustification" | "requiresProposal" | "requiresNameApproval" | "restrictedAccess" | "requiresDossier" | "requiresCoordinationRecord" | "requiresFreshSourcing">;
  };
  contractType: {
    code: string;
    nameEn: string;
    state: ContractTypeState;
    derivedCode: string | null;
    derivedName: string | null;
    derivationState: string;
    sharePct: string | null;
    profile: { key: BehaviourKey; value: BehaviourValue }[];
  };
  policy: { dominanceSharePct: string | null; provenance: Provenance | null };
  basis: { code: string; nameEn: string; standardFormLabel: string | null };
  taxonomies: { taxonomy: string; state: TaxonomyState; value: string | null }[];
}

export function isClassificationSnapshot(x: unknown): x is ClassificationSnapshot {
  return typeof x === "object" && x != null && (x as { v?: unknown }).v === 1 && typeof (x as { contractType?: unknown }).contractType === "object";
}

/**
 * The decided record of an evaluation that is moving into preparation. Null where it
 * could not be decided (no method, type or basis) — the move refuses before this.
 */
export function classificationSnapshotOf(
  ev: { method: Method | null; derivation: { state: string; code: string | null; sharePct: string | null }; type: { state: ContractTypeState | null; code: string | null }; taxonomies: { taxonomyCode: string; state: TaxonomyState; valueCode: string | null }[] },
  cfg: {
    types: (import("./types").ContractTypeRow)[];
    bases: (import("./types").ContractBasis)[];
    taxonomies: (import("./types").Taxonomy)[];
    policy: import("./types").ClassificationPolicy;
  },
  basisCode: string | null,
  committeeName: (code: string) => string,
  profile: (t: import("./types").ContractTypeRow) => { key: BehaviourKey; value: BehaviourValue }[],
): ClassificationSnapshot | null {
  const m = ev.method;
  const t = cfg.types.find((x) => x.code === ev.type.code);
  const b = cfg.bases.find((x) => x.code === basisCode);
  if (!m || !t || !b || !ev.type.state) return null;
  const derived = cfg.types.find((x) => x.code === ev.derivation.code) ?? null;
  return {
    v: 1,
    method: {
      code: m.code,
      nameEn: m.nameEn,
      committee: m.committeeCode ? committeeName(m.committeeCode) : null,
      flags: {
        requiresJustification: m.requiresJustification,
        requiresProposal: m.requiresProposal,
        requiresNameApproval: m.requiresNameApproval,
        restrictedAccess: m.restrictedAccess,
        requiresDossier: m.requiresDossier,
        requiresCoordinationRecord: m.requiresCoordinationRecord,
        requiresFreshSourcing: m.requiresFreshSourcing,
      },
    },
    contractType: {
      code: t.code,
      nameEn: t.nameEn,
      state: ev.type.state,
      derivedCode: derived?.code ?? null,
      derivedName: derived?.nameEn ?? null,
      derivationState: ev.derivation.state,
      sharePct: ev.derivation.sharePct,
      profile: profile(t),
    },
    policy: { dominanceSharePct: cfg.policy.dominanceSharePct, provenance: cfg.policy.provenance },
    basis: { code: b.code, nameEn: b.nameEn, standardFormLabel: b.standardFormLabel },
    taxonomies: ev.taxonomies.map((x) => {
      const tax = cfg.taxonomies.find((y) => y.code === x.taxonomyCode);
      return { taxonomy: tax?.nameEn ?? "A classification no longer configured", state: x.state, value: x.valueCode ? (tax?.values.find((v) => v.code === x.valueCode)?.nameEn ?? "A value no longer configured") : null };
    }),
  };
}
