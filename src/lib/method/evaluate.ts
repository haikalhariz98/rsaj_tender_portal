/**
 * One exercise, judged whole: its bands, its method, its value against the
 * requisition's approval, its justification, its scope and contract type, and its
 * taxonomies. Pure: the action that saves, the route handler that previews and the
 * screen that shows it all call this, so they can never disagree.
 *
 * A draft may be saved half-written, but what it does give must be real: the save
 * refuses only on `SAVE_BLOCKERS`. Everything that blocks at all blocks the move into
 * preparation.
 */

import type { Sen } from "@/lib/money";

import type { FunderContext } from "./approval";
import { determineBands, type BandDetermination } from "./bands";
import { contractTypeChoice, defaultContractType, scopeFaults, type Derivation, type TypeChoice } from "./contract-type";
import { selectionFaults } from "./eligibility";
import { justificationFaults } from "./justification";
import { deriveTaxonomies, type TaxonomyOutcome } from "./taxonomy";
import type {
  ClassificationPolicy,
  ContractBasis,
  ContractTypeRow,
  DeliverableKind,
  ExerciseStatus,
  Finding,
  FundingPosture,
  JustificationReason,
  Method,
  Provenance,
  Taxonomy,
  TaxonomyMapping,
  TaxonomyPick,
  TermsBand,
} from "./types";
import { exerciseValueFaults, type ApprovedRoute } from "./value";

export interface MethodConfig {
  methods: Method[];
  reasons: JustificationReason[];
  types: ContractTypeRow[];
  bases: ContractBasis[];
  taxonomies: Taxonomy[];
  mappings: TaxonomyMapping[];
  policy: ClassificationPolicy;
}

export interface ExerciseDraft {
  id: string | null;
  value: Sen;
  methodCode: string | null;
  methodReason: string;
  externalRouteNote: string;
  parentContractRef: string | null;
  scope: { kind: DeliverableKind; amount: Sen; description: string }[];
  /// The type chosen on the form; null takes the derived one.
  contractTypeCode: string | null;
  typeReason: string;
  typePersonId: string | null;
  basisCode: string | null;
  justificationReasonCode: string | null;
  justificationText: string;
  evidenceNote: string;
  dossierReference: string | null;
  emergencyTrigger: string;
  coordinationMeetingOn: string | null;
}

export interface EvaluationContext {
  funder: FunderContext;
  termsBands: readonly TermsBand[];
  boundaryProvenance: Provenance;
  posture: FundingPosture | null;
  on: Date;
  config: MethodConfig;
  approved: ApprovedRoute | null;
  siblings: readonly { id: string; value: Sen; status: ExerciseStatus }[];
  lockedAt: Date | null;
  currentTypeCode: string | null;
  picks: readonly { taxonomyCode: string; valueCode: string; pick: TaxonomyPick }[];
}

export interface Evaluation {
  bands: BandDetermination;
  method: Method | null;
  derivation: Derivation;
  type: TypeChoice;
  taxonomies: TaxonomyOutcome[];
  findings: Finding[];
}

/// What a half-written draft may not be saved with: what it gives must be real.
export const SAVE_BLOCKERS = new Set([
  "NO_APPROVED_ROUTE",
  "EXCEEDS_APPROVED_VALUE",
  "METHODS_NOT_SET",
  "SOURCING_NOT_PERMITTED",
  "METHOD_REQUIRED",
  "METHOD_UNKNOWN",
  "METHOD_RETIRED",
  "METHOD_NOT_IN_REGIME",
  "OVERRIDE_REASON_REQUIRED",
  "SCOPE_REQUIRED",
  "SCOPE_AMOUNT_INVALID",
  "SCOPE_SUM_MISMATCH",
  "TYPE_UNKNOWN",
  "TYPE_REASON_REQUIRED",
  "TYPE_PERSON_REQUIRED",
  "LOCKED",
  "BASIS_UNKNOWN",
  "REASON_UNKNOWN",
]);

export const saveBlockers = (fs: readonly Finding[]) => fs.filter((f) => f.level === "block" && SAVE_BLOCKERS.has(f.code));

export function evaluateExercise(d: ExerciseDraft, ctx: EvaluationContext): Evaluation {
  const method = d.methodCode ? (ctx.config.methods.find((m) => m.code === d.methodCode) ?? null) : null;
  const bands = determineBands(d.value, {
    funder: ctx.funder,
    termsBands: ctx.termsBands,
    boundaryProvenance: ctx.boundaryProvenance,
    methods: ctx.config.methods,
    posture: ctx.posture,
    on: ctx.on,
    method,
  });
  const findings: Finding[] = [...bands.findings];

  findings.push(
    ...exerciseValueFaults(ctx.approved, ctx.siblings, { id: d.id, value: d.value, requisitionRuleKey: bands.requisition.ruleKey, requisitionRuleLabel: bands.requisition.ruleLabel }, ctx.funder.dal.policy),
  );
  findings.push(
    ...selectionFaults(
      { methodCode: d.methodCode, methodReason: d.methodReason, externalRouteNote: d.externalRouteNote, parentContractRef: d.parentContractRef, justificationText: d.justificationText },
      { methods: ctx.config.methods, regime: bands.regime, posture: ctx.posture, on: ctx.on },
    ),
  );
  if (method) findings.push(...justificationFaults(method, d, ctx.config.reasons, ctx.on));

  findings.push(...scopeFaults(d.scope, d.value));
  const derivation = defaultContractType(
    d.scope.map((s) => ({ kind: s.kind, amount: s.amount })),
    ctx.config.types,
    ctx.config.policy,
    ctx.on,
  );
  const type = contractTypeChoice(derivation, { code: d.contractTypeCode, reason: d.typeReason, personId: d.typePersonId }, ctx.config.types, {
    lockedAt: ctx.lockedAt,
    currentCode: ctx.currentTypeCode,
    on: ctx.on,
  });
  findings.push(...type.faults);

  if (d.basisCode) {
    const b = ctx.config.bases.find((x) => x.code === d.basisCode);
    if (!b || (b.retiredOn != null && b.retiredOn <= ctx.on)) findings.push({ code: "BASIS_UNKNOWN", level: "block" });
  }
  const taxonomies = deriveTaxonomies(type.code, d.basisCode, ctx.picks, ctx.config.mappings, ctx.config.taxonomies, ctx.on);
  return { bands, method, derivation, type, taxonomies, findings };
}
