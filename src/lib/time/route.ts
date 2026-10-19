/**
 * A contract matter's route on the approval matrix (6.13 Part B run 1b: FR-EOT-007, 012; FR-LAD-009; ADR 0029). Pure.
 *
 * The route is resolved on the kind's own domain (`MATTER_DOMAIN`), under the requisition's funding route, with the
 * absence rule and the sender's own office (self-approval: where the sender holds the approving office, the engine
 * escalates it, as every route does). An EOT is routed on the cause of its financial impact (BD-613-132: the matrix's
 * condition keys), never its value; a waiver on the exact ratio waived ÷ LAD amount (`percent-band.ts`, which side of
 * an edge the issue's switch); a value-routed kind on its value. No approver, band or committee is here (Rule 1): a
 * missing row is refused, naming the matrix and the domain.
 */

import type { Resolution, ResolutionWarning } from "@/lib/authority/types";
import { resolveUnderFunder, type FunderContext } from "@/lib/method/approval";
import { amountOf, senToDecimalString, type Sen } from "@/lib/money";
import type { ExactRatio } from "@/lib/percent-band";
import { MATTER_DOMAIN, type ContractMatterKind } from "@/lib/matter/matter";

import type { FinancialImpact, Finding } from "./types";

/// BD-613-132: the EOT's routing conditions, as the matrix's rows name them.
export const EOT_COND: Readonly<Record<FinancialImpact, string>> = {
  OTHER: "financial_not_authority",
  AUTHORITY_REQUIREMENT: "financial_authority",
  NONE: "no_financial_impact",
};
export const eotCondOf = (impact: FinancialImpact): string => EOT_COND[impact];

/// FR-EOT-007's note (decision D2): shown on every EOT route, so the conflict is never hidden.
export const D2_EOT_NOTE = {
  en: "Decision D2 is open: SK006 §7.6.1 (as amended 12.01.2026) makes the Variation Orders Committee the approver of an extension with no financial impact, while the DAL makes the S.O./P.D. the approver with the committee's mandatory recommendation. This route follows the matrix as configured.",
} as const;

export interface MatterRouteQuery {
  kind: ContractMatterKind;
  value: Sen | null;
  ratio: ExactRatio | null;
  cond?: string | null;
  /// The contract value the matrix reads the regime and contract-value bands at.
  contractValue: Sen;
  method: string | null;
  contractTypeCode: string | null;
  absentRoleCodes?: readonly string[];
}

export type MatterRoute = { ok: true; resolution: Resolution; source: "DAL" | "OVERRIDE"; overrideIssue: { id: string; label: string } | null; warnings: ResolutionWarning[]; notes: { en: string;  }[]; domain: string } | { ok: false; faults: Finding[] };

export function resolveMatterRoute(ctx: FunderContext, q: MatterRouteQuery, matrixLabel: string, senderHolds: (roleCode: string) => boolean): MatterRoute {
  const domain = MATTER_DOMAIN[q.kind];
  const query = {
    domain,
    method: q.method,
    contractTypeCode: q.contractTypeCode,
    cond: q.cond ?? null,
    value: q.value == null ? null : amountOf(senToDecimalString(q.value)),
    contractValue: amountOf(senToDecimalString(q.contractValue)),
    pctRatio: q.ratio,
    absentRoleCodes: [...(q.absentRoleCodes ?? [])],
  };
  let r = resolveUnderFunder(ctx, query);
  const approver = r.resolution.approverCode;
  if (approver && senderHolds(approver)) r = resolveUnderFunder(ctx, { ...query, actorRoleCode: approver });
  const res = r.resolution;
  const errors = r.warnings.filter((w) => w.level === "err");
  if (!res.rule || errors.length || res.chain.length === 0) return { ok: false, faults: [{ code: "NO_RULE", level: "block", data: { matrix: matrixLabel, domain, why: errors.map((e) => e.messageEn).join(" ") || null } }] };
  return { ok: true, resolution: res, source: r.source, overrideIssue: r.overrideIssue, warnings: r.warnings, notes: q.kind === "EOT" ? [D2_EOT_NOTE] : [], domain };
}
