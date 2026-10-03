/**
 * Routing a variation's approval on the approval matrix (6.13 Part A step 4: FR-VAR-008, 010, 011, 012, FR-PAD-004;
 * 614-C4; ADR 0024 Amendment 1).
 *
 * Each of FR-VAR-008's events raises its own route on its own matrix domain: prior approval `vo`, an increase of an
 * approved variation `vo_increase`, the use of rates not in the contract `vo_agreed_rate`; a re-measurement of
 * provisional quantities `remeasurement` in the tender regime and, in the quotation regime, the variation bands `vo`
 * (FR-PAD-004). The regime is the matrix's own reading of the contract value (its configured floors), never a
 * literal. The percentage is the exact ratio (percent.ts) and the contract value is the base it is taken over, so
 * both dimensions of the tender matrix (FR-VAR-011) and the one dimension of the quotation matrix (FR-VAR-012) are
 * the customer's rows. A route may carry a committee's step (the Variation Orders Committee's mandatory
 * recommendation, FR-VAR-010; a Tender Board's approval): it is discharged only by citing the committee's decision
 * on the matter tabled from the variation, never by a person. Which office decides at which percentage is the
 * matrix (Rule 1): no band, no office and no committee is code. Pure.
 */

import { regimeFor } from "@/lib/authority/resolve";
import type { Matrix, Regime, Resolution, ResolutionWarning, Rule } from "@/lib/authority/types";
import { resolveUnderFunder, type FunderContext } from "@/lib/method/approval";
import { amountOf, senToDecimalString, type Sen } from "@/lib/money";
import type { ExactRatio } from "@/lib/percent-band";

import { percentLabel, percentLabelText, ratioOf, type Reading } from "./percent";
import type { Finding, VariationEvent } from "./types";

/// The matrix domain each event routes on (an exhaustive map), in the tender regime; a re-measurement in the
/// quotation regime routes on the variation bands (FR-PAD-004).
export const EVENT_DOMAIN: Readonly<Record<VariationEvent, string>> = {
  PRIOR: "vo",
  INCREASE: "vo_increase",
  AGREED_RATE: "vo_agreed_rate",
  REMEASUREMENT: "remeasurement",
};

export function routeDomainOf(event: VariationEvent, regime: Regime | null): string {
  return event === "REMEASUREMENT" && regime === "quotation" ? EVENT_DOMAIN.PRIOR : EVENT_DOMAIN[event];
}

/// The regime the contract value falls in, on the matrix's own configured floors.
export const regimeOf = (matrix: Matrix, contractValue: Sen): Regime | null => regimeFor(amountOf(senToDecimalString(contractValue)), matrix.policy);

export interface VariationRouteQuery {
  domain: string;
  /// The value the route approves (the variation's value, the increase, the amount at agreed rates, the
  /// re-measurement).
  value: Sen;
  /// The base the percentage is taken over, which is also the contract value the band is read at (OD-A2).
  contractValue: Sen;
  ratio: ExactRatio;
  method: string | null;
  contractTypeCode: string | null;
  absentRoleCodes?: readonly string[];
}

export type VariationRoute = { ok: true; resolution: Resolution; source: "DAL" | "OVERRIDE"; overrideIssue: { id: string; label: string } | null; warnings: ResolutionWarning[] } | { ok: false; faults: Finding[] };

/// Under the requisition's funding route, with the absence rule, and the self-approval rule applied to whoever sends
/// it: where the sender holds the approving office, the engine escalates it, as the certificate's route does.
export function resolveVariationRoute(ctx: FunderContext, q: VariationRouteQuery, matrixLabel: string, senderHolds: (roleCode: string) => boolean): VariationRoute {
  const query = { domain: q.domain, method: q.method, contractTypeCode: q.contractTypeCode, value: amountOf(senToDecimalString(q.value)), contractValue: amountOf(senToDecimalString(q.contractValue)), pctRatio: q.ratio, absentRoleCodes: [...(q.absentRoleCodes ?? [])] };
  let r = resolveUnderFunder(ctx, query);
  const approver = r.resolution.approverCode;
  if (approver && senderHolds(approver)) r = resolveUnderFunder(ctx, { ...query, actorRoleCode: approver });
  const res = r.resolution;
  const errors = r.warnings.filter((w) => w.level === "err");
  if (!res.rule || errors.length || res.chain.length === 0) return { ok: false, faults: [{ code: "VARIATION_ROUTE_UNRESOLVED", level: "block", data: { matrix: matrixLabel, domain: q.domain, why: errors.map((e) => e.messageEn).join(" ") || null } }] };
  return { ok: true, resolution: res, source: r.source, overrideIssue: r.overrideIssue, warnings: r.warnings };
}

/// The band edges a domain's rows state (for OD-A3's label): every percentage edge of the matrix's rows on it.
export const edgesOf = (rules: readonly Pick<Rule, "domain" | "pctMin" | "pctMax">[], domain: string): string[] => [...new Set(rules.filter((r) => r.domain === domain).flatMap((r) => [r.pctMin, r.pctMax]).filter((e): e is string => e != null))];

/// OD-A3 A, as frozen with a route (run 3 review MUST 2): the percentage labelled against the band edges of the domain
/// the route is actually resolved on (an increase, agreed rates and a re-measurement have their own rows).
export const routePercentLabel = (rules: readonly Pick<Rule, "domain" | "pctMin" | "pctMax">[], domain: string, ratio: ExactRatio): { en: string; ms: string } => percentLabelText(percentLabel(ratio, edgesOf(rules, domain)));

/**
 * Run 3 residual S2: the application's two percentages, this variation's and the cumulative with it, labelled against
 * the band edges of the matrix the prior approval's route was actually resolved on (the override's rows under a
 * funding override, never the issued matrix's), the one the route was read on being the route's own frozen label.
 * `cumulative`: whether the route's reading carried the cumulative (the basis). Pure.
 */
export function applicationPercents(i: {
  rules: readonly Pick<Rule, "domain" | "pctMin" | "pctMax">[];
  domain: string;
  value: Sen;
  cumulativeApproved: Sen;
  den: Sen;
  cumulative: boolean;
  label: { en: string; ms: string };
}): { thisPct: { en: string; ms: string }; cumPct: { en: string; ms: string } } {
  const edges = edgesOf(i.rules, i.domain);
  const read = (num: Sen) => percentLabelText(percentLabel({ num, den: i.den }, edges));
  return i.cumulative ? { thisPct: read(i.value), cumPct: i.label } : { thisPct: i.label, cumPct: read(i.cumulativeApproved + i.value) };
}

/**
 * Run 3 residual C1: a sent route's percentage as shown. Frozen with the route (sent since run 3's MUST 2): that label.
 * Sent before labels were frozen: read now against the given rows (the issued matrix's, without any funding override)
 * and said to be so (`frozen: false`), never presented as the label the route was sent on. Pure.
 */
export function sentLabelOf(r: Reading, rules: readonly Pick<Rule, "domain" | "pctMin" | "pctMax">[], domain: string): { en: string; ms: string; frozen: boolean } {
  if (r.label) return { ...r.label, frozen: true };
  return { ...routePercentLabel(rules, r.domain ?? domain, ratioOf(r)), frozen: false };
}

/**
 * Acceptance S-5: the bands a Variation Order Certificate's cumulative percentage is labelled on, and the words that
 * say which. The variation's own approved prior-approval route, as frozen with it (its domain's edges on the matrix it
 * was resolved on, a funding override's included); exempt from prior approval, or with no prior approval route (or
 * one sent before its edges were frozen), the issued matrix's variation (`vo`) bands, said so. Pure.
 */
export function orderBands(i: {
  /// The approved prior-approval route's frozen reading and its matrix labels, or null.
  prior: { edges?: readonly string[]; matrixLabel: string | null; overrideLabel: string | null } | null;
  exempt: boolean;
  /// The issued matrix today and its label (null: none issued).
  issuedRules: readonly Pick<Rule, "domain" | "pctMin" | "pctMax">[];
  issuedLabel: string | null;
}): { edges: string[]; words: { en: string; ms: string } } {
  if (!i.exempt && i.prior?.edges) {
    const on = i.prior.overrideLabel ? { en: `${i.prior.overrideLabel}, the funding override`, ms: `${i.prior.overrideLabel}, penggantian sumber pembiayaan` } : { en: i.prior.matrixLabel ?? "its matrix", ms: i.prior.matrixLabel ?? "matriksnya" };
    return { edges: [...i.prior.edges], words: { en: `The bands of this variation's prior approval route (${on.en})`, ms: `Jalur laluan kelulusan terdahulu perubahan kerja ini (${on.ms})` } };
  }
  const why = i.exempt ? { en: "exempt from prior approval", ms: "dikecualikan daripada kelulusan terdahulu" } : i.prior ? { en: "its prior approval's bands were not frozen with it", ms: "jalur kelulusan terdahulunya tidak dibekukan bersamanya" } : { en: "no prior approval route", ms: "tiada laluan kelulusan terdahulu" };
  const label = i.issuedLabel ?? "none issued";
  return { edges: edgesOf(i.issuedRules, "vo"), words: { en: `The issued matrix's variation bands (${label}; ${why.en})`, ms: `Jalur perubahan kerja matriks yang dikeluarkan (${label}; ${why.ms})` } };
}
