import type { AuthorityAct, Matrix, Policy, Role, Rule } from "./types";

/**
 * Shape of the authority rows as extracted from the source manual transcription in
 * `prisma/seed-data/`. Kept separate from {@link Rule} so the seed files stay a
 * faithful record of the transcription and renaming a field here is not a data edit.
 */
export interface SeedRule {
  id: string;
  domain: string;
  method?: string | null;
  cond?: string | null;
  min?: number | null;
  max?: number | null;
  pctMin?: number | null;
  pctMax?: number | null;
  cvMin?: number | null;
  cvMax?: number | null;
  followsBoundarySwitch?: boolean | null;
  label: string;
  proposer?: string | null;
  approver?: string | null;
  committee?: string | null;
  committeeAct?: string | null;
  nonDelegable?: boolean;
  approverMandatory?: boolean;
  gap?: boolean;
  gapNote?: string | null;
  note?: string;
  clause: string;
  order?: number;
  recommenders?: Array<{ role: string; act: string }>;
}

export interface SeedRole {
  code: string;
  nameEn: string;
  nameMs: string;
  isCommittee: boolean;
  escalatesToCode: string | null;
  selfApprovalEscalatesToCode: string | null;
  sortOrder: number;
}

export interface SeedPolicy extends Policy {
  /// Free text identifying the manual issue, e.g. "Issue A Rev 00 · 11 June 2021".
  revision?: string;
}

export function toRule(seed: SeedRule): Rule {
  return {
    ruleKey: seed.id,
    domain: seed.domain,
    method: seed.method ?? null,
    cond: seed.cond ?? null,
    minValue: seed.min ?? null,
    maxValue: seed.max ?? null,
    pctMin: seed.pctMin ?? null,
    pctMax: seed.pctMax ?? null,
    contractValueMin: seed.cvMin ?? null,
    contractValueMax: seed.cvMax ?? null,
    followsBoundarySwitch: seed.followsBoundarySwitch ?? null,
    labelEn: seed.label,
    labelMs: null,
    proposerCode: seed.proposer ?? null,
    approverCode: seed.approver ?? null,
    committeeCode: seed.committee ?? null,
    committeeAct: (seed.committeeAct as AuthorityAct | undefined) ?? null,
    nonDelegable: Boolean(seed.nonDelegable),
    approverMandatory: Boolean(seed.approverMandatory),
    isGap: Boolean(seed.gap),
    gapNote: seed.gapNote ?? null,
    note: seed.note ?? "",
    clause: seed.clause,
    sortOrder: seed.order ?? 0,
    recommenders: (seed.recommenders ?? []).map((r) => ({
      roleCode: r.role,
      act: r.act as AuthorityAct,
    })),
  };
}

export function toRole(seed: SeedRole): Role {
  return {
    code: seed.code,
    nameEn: seed.nameEn,
    nameMs: seed.nameMs,
    isCommittee: seed.isCommittee,
    escalatesToCode: seed.escalatesToCode,
    selfApprovalEscalatesToCode: seed.selfApprovalEscalatesToCode,
  };
}

export function buildMatrix(rules: SeedRule[], roles: SeedRole[], policy: SeedPolicy): Matrix {
  return {
    policy: {
      boundaryValue: policy.boundaryValue,
      boundaryInclusive: policy.boundaryInclusive,
      quotationFloor: policy.quotationFloor,
      tenderFloor: policy.tenderFloor,
      requisitionBoundary: policy.requisitionBoundary,
      currency: policy.currency,
    },
    roles: Object.fromEntries(roles.map((r) => [r.code, toRole(r)])),
    rules: rules.map(toRule),
  };
}
