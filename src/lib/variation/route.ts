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

import { percentLabel, percentLabelText } from "./percent";
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
