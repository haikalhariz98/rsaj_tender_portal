/**
 * The approval route for a requisition (FR-REQ-006, FR-REQ-008, FR-REQ-009).
 *
 * Domain `requisition` through the generic engine; the rows are the customer's. An
 * over-budget requisition routes on the `over_budget` condition and never by band —
 * with no such row it cannot be routed at all. Where the funding route's funder
 * supersedes the limits, the funder's issued rule set routes it if it has a rule for
 * the matter; otherwise the organisation's own limits route it and the trail says the
 * funder's rules were not applied, and why.
 */

import { resolveApproval } from "@/lib/authority/resolve";
import type { Matrix, Resolution, ResolutionWarning } from "@/lib/authority/types";

import { OVER_BUDGET_COND, REQUISITION_DOMAIN } from "./types";

export interface RouteQuery {
  value: number;
  overBudget: boolean;
  actorRoleCode?: string | null;
  absentRoleCodes?: string[];
  fundingRouteCode: string | null;
  fundingSupersedesAuthority: boolean;
}

export interface OverrideIssue {
  id: string;
  label: string;
  matrix: Matrix;
}

export type RouteFault = "NO_OVER_BUDGET_ROUTE" | "UNROUTABLE";

export interface RequisitionRoute {
  resolution: Resolution;
  /// Which issue routed it.
  source: "DAL" | "OVERRIDE";
  fundingOverrideApplied: boolean;
  overrideIssue: { id: string; label: string } | null;
  /// Why the funder's rules were not applied where they supersede: none issued, or
  /// no rule in them matches.
  overrideGap: "NO_OVERRIDE_ISSUE" | "NO_OVERRIDE_RULE" | null;
  warnings: ResolutionWarning[];
  /// Anything that stops submission. Every `err` warning is one.
  faults: { code: RouteFault; messageEn: string }[];
}

const funderClause = (m: Matrix) => m.policy.clauses?.funderOverride ?? null;

export function resolveRequisitionRoute(
  dal: Matrix,
  override: OverrideIssue | null,
  q: RouteQuery,
): RequisitionRoute {
  const query = {
    domain: REQUISITION_DOMAIN,
    cond: q.overBudget ? OVER_BUDGET_COND : null,
    value: q.value,
    actorRoleCode: q.actorRoleCode ?? null,
    absentRoleCodes: q.absentRoleCodes ?? [],
    funding: q.fundingRouteCode,
  };

  let resolution = resolveApproval(dal, query);
  let source: RequisitionRoute["source"] = "DAL";
  let overrideGap: RequisitionRoute["overrideGap"] = null;
  const warnings: ResolutionWarning[] = [];
  const clause = funderClause(dal);
  const cite = clause ? { clause } : {};
  const noClause = clause ? "" : " The clause behind this rule is not recorded in the approval matrix.";

  if (q.fundingSupersedesAuthority) {
    const funded = override ? resolveApproval(override.matrix, query) : null;
    if (override && funded?.rule && (!q.overBudget || funded.rule.cond === OVER_BUDGET_COND)) {
      resolution = funded;
      source = "OVERRIDE";
      warnings.push({
        code: "GOV_OVERRIDE",
        level: "info",
        messageEn: `Externally funded: the funder's rule set “${override.label}” superseded the approval matrix for this requisition.${noClause}`,
        messageMs: `Dibiayai pihak luar: set peraturan penyandang dana “${override.label}” mengatasi matriks kelulusan.`,
        ...cite,
      });
    } else {
      overrideGap = override ? "NO_OVERRIDE_RULE" : "NO_OVERRIDE_ISSUE";
      warnings.push({
        code: "GOV_OVERRIDE",
        level: "warn",
        messageEn:
          (override
            ? `Externally funded, but the funder's rule set “${override.label}” has no rule for this requisition, so the approval matrix routed it.`
            : "Externally funded, but no funder's rule set is issued for this funding route, so the approval matrix routed it. The funder's own guidelines may still prevail where they conflict.") + noClause,
        messageMs: override
          ? `Dibiayai pihak luar, tetapi set peraturan penyandang dana “${override.label}” tiada peraturan untuk permohonan ini.`
          : "Dibiayai pihak luar, tetapi tiada set peraturan penyandang dana dikeluarkan untuk laluan ini.",
        ...cite,
      });
    }
  }

  const all = [...resolution.warnings, ...warnings];
  const faults: RequisitionRoute["faults"] = [];

  // FR-REQ-008: over budget routes by the condition row, never the band route that
  // would otherwise match. Without the row there is no route to show.
  if (q.overBudget && resolution.rule && resolution.rule.cond !== OVER_BUDGET_COND) {
    faults.push({
      code: "NO_OVER_BUDGET_ROUTE",
      messageEn: "This requisition is over budget and the approval matrix has no over-budget rule for requisitions, so it cannot be routed. Add the rule to the matrix.",
    });
    resolution = { ...resolution, rule: null, chain: [], approverCode: null, boundaryOperator: null };
  }
  for (const w of all) if (w.level === "err") faults.push({ code: "UNROUTABLE", messageEn: w.messageEn });
  if (!resolution.rule && faults.length === 0) faults.push({ code: "UNROUTABLE", messageEn: "No approval rule matches this requisition." });

  return {
    resolution,
    source,
    fundingOverrideApplied: source === "OVERRIDE",
    overrideIssue: source === "OVERRIDE" && override ? { id: override.id, label: override.label } : null,
    overrideGap,
    warnings: all,
    faults,
  };
}
