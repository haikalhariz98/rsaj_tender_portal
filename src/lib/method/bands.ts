/**
 * The three value-band families of an exercise, determined separately (FR-MTD-001,
 * FR-MTD-002, FR-MTD-003; ADR 0006).
 *
 * - Requisition: 6.1's requisition route by value. On an exercise the band shown is the
 *   rule on the requisition's approved route; this preview is what `value.ts` compares
 *   it with.
 * - Method: the regime from the issue's floors, and who approves the appointment for
 *   the chosen (or proposed) method from the `appointment` rules.
 * - Terms: the `TermsBand` rows of the issue in force.
 *
 * None of the three reads another's edges. Money comes in as sen; the engine's number
 * bridge is used only to band.
 */

import { edgeAtBoundary, inBand, regimeFor } from "@/lib/authority/resolve";
import type { Policy, Regime } from "@/lib/authority/types";
import { senToDecimalString, type Sen } from "@/lib/money";
import { resolveRequisitionRoute } from "@/lib/requisition/route";

import { appointmentPreview, resolveNameApproval, type AppointmentPreview, type FunderContext, type NameApprovalState } from "./approval";
import { boundaryFindings, boundaryOf, type BoundaryResult } from "./boundary";
import { methodOptions, proposedMethod, type ProposalOutcome } from "./eligibility";
import type { Finding, FundingPosture, Method, Provenance, TermsBand } from "./types";

/// The engine takes a number for banding; every comparison inside it is in exact sen.
export const bandingNumber = (value: Sen): number => Number(senToDecimalString(value));

export type TermsState = "APPLIES" | "NONE_IN_REGIME" | "NO_BAND_FOR_VALUE" | "NOT_SET";

export interface TermsResult {
  state: TermsState;
  band: TermsBand | null;
  /// More than one band covers the value: the first by order is shown, with a warning.
  overlapping: boolean;
  /// The comparison the band applied at the boundary; null where no edge sits there.
  boundaryOperator: "GT" | "GTE" | null;
}

function termsOperator(t: TermsBand, policy: Policy): "GT" | "GTE" | null {
  if (!edgeAtBoundary({ minValue: t.minValue, maxValue: t.maxValue, contractValueMin: null, contractValueMax: null }, policy)) return null;
  return t.followsBoundarySwitch === true && policy.boundaryInclusive === false ? "GTE" : "GT";
}

/**
 * Which terms set applies. No rows at all is not set (D12 open), never "none apply";
 * rows that exist but not for this regime are an answer; rows for the regime that miss
 * this value are a gap. Each band passes its own boundary opt-in to `inBand`.
 */
export function termsFor(value: number, regime: Regime, terms: readonly TermsBand[], policy: Policy): TermsResult {
  if (terms.length === 0) return { state: "NOT_SET", band: null, overlapping: false, boundaryOperator: null };
  const inRegime = [...terms].filter((t) => t.regime == null || t.regime === regime).sort((a, b) => a.sortOrder - b.sortOrder);
  if (inRegime.length === 0) return { state: "NONE_IN_REGIME", band: null, overlapping: false, boundaryOperator: null };
  const hits = inRegime.filter((t) => inBand(value, t.minValue, t.maxValue, policy, t.followsBoundarySwitch));
  if (hits.length === 0) return { state: "NO_BAND_FOR_VALUE", band: null, overlapping: false, boundaryOperator: null };
  return { state: "APPLIES", band: hits[0], overlapping: hits.length > 1, boundaryOperator: termsOperator(hits[0], policy) };
}

export interface BandContext {
  funder: FunderContext;
  termsBands: readonly TermsBand[];
  boundaryProvenance: Provenance;
  methods: readonly Method[];
  posture: FundingPosture | null;
  on: Date;
  /// The method chosen, where one is. Without it the preview uses the proposed one.
  method: Method | null;
}

export interface BandDetermination {
  value: Sen;
  requisition: {
    ruleKey: string | null;
    ruleLabel: string | null;
    approverCode: string | null;
    source: "DAL" | "OVERRIDE";
    faults: string[];
  };
  regime: Regime;
  proposed: ProposalOutcome;
  options: Method[];
  /// The method the appointment preview is for: the chosen one, else the proposed one.
  previewMethod: Method | null;
  appointment: AppointmentPreview;
  nameApproval: (AppointmentPreview & { nameState: NameApprovalState }) | null;
  terms: TermsResult;
  boundary: BoundaryResult;
  findings: Finding[];
}

export function determineBands(value: Sen, ctx: BandContext): BandDetermination {
  const n = bandingNumber(value);
  const policy = ctx.funder.dal.policy;
  const regime = regimeFor(n, policy)!;

  const req = resolveRequisitionRoute(ctx.funder.dal, ctx.funder.override, {
    value: n,
    overBudget: false,
    fundingRouteCode: null,
    fundingSupersedesAuthority: ctx.funder.supersedes,
  });

  const options = methodOptions(ctx.methods, regime, ctx.posture, ctx.on);
  const proposed = proposedMethod(ctx.methods, regime, ctx.on);
  const previewMethod = ctx.method ?? (proposed.state === "PROPOSED" ? (ctx.methods.find((m) => m.code === proposed.code) ?? null) : null);
  const appointment = appointmentPreview(ctx.funder, previewMethod, n);
  const nameApproval = previewMethod?.requiresNameApproval ? resolveNameApproval(ctx.funder, previewMethod, n) : null;

  const terms = termsFor(n, regime, ctx.termsBands, policy);
  const boundary = boundaryOf(value, policy, ctx.boundaryProvenance);

  const findings: Finding[] = [...boundaryFindings(boundary)];
  // On the boundary, a rule or band that applied a different comparison from the regime
  // put this value in a different band from its regime: carried with the case (review #7).
  if (boundary.onBoundary) {
    if (appointment.boundaryOperator && appointment.boundaryOperator !== boundary.operator) {
      findings.push({ code: "REGIME_RULE_DISAGREE", level: "warn", data: { label: appointment.ruleLabel, kind: "rule" } });
    }
    if (terms.boundaryOperator && terms.boundaryOperator !== boundary.operator) {
      findings.push({ code: "REGIME_RULE_DISAGREE", level: "warn", data: { label: terms.band?.labelEn ?? null, kind: "terms" } });
    }
  }
  if (terms.state === "NOT_SET") findings.push({ code: "TERMS_NOT_SET", level: "warn" });
  if (terms.state === "NO_BAND_FOR_VALUE") findings.push({ code: "TERMS_NO_BAND", level: "warn" });
  if (terms.overlapping) findings.push({ code: "TERMS_OVERLAP", level: "warn" });
  if (appointment.state === "NO_RULE") findings.push({ code: "APPOINTMENT_NO_RULE", level: "warn" });
  if (appointment.state === "NO_METHOD_KEY") findings.push({ code: "APPOINTMENT_NO_METHOD_KEY", level: "warn" });
  if (appointment.state === "DEPENDS_ON_METHOD") findings.push({ code: "DEPENDS_ON_METHOD", level: "info" });

  return {
    value,
    requisition: {
      ruleKey: req.resolution.rule?.ruleKey ?? null,
      ruleLabel: req.resolution.rule?.labelEn ?? null,
      approverCode: req.resolution.approverCode,
      source: req.source,
      faults: req.faults.map((f) => f.messageEn),
    },
    regime,
    proposed,
    options,
    previewMethod,
    appointment,
    nameApproval,
    terms,
    boundary,
    findings,
  };
}
