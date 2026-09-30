/**
 * Who approves an exercise's appointment, and who approves the name (FR-MTD-002,
 * FR-MTD-008, FR-REQ-013), through the generic engine.
 *
 * The appointment routes on domain `appointment` under the method's
 * `authorityMethodKey`; approval of the name on domain `name_approval` under the same
 * key. Where the funding route's funder supersedes the limits, the funder's issued
 * rule set routes it if it has a rule for the matter; otherwise the organisation's
 * limits do and the result says so (6.1's partition). Never applied silently, never
 * skipped silently.
 */

import { resolveApproval } from "@/lib/authority/resolve";
import type { ApprovalStep, Matrix, Resolution, ResolutionWarning, ResolveQuery } from "@/lib/authority/types";

import { APPOINTMENT_DOMAIN, NAME_APPROVAL_DOMAIN, type Finding, type Method } from "./types";

export interface FunderContext {
  dal: Matrix;
  /// The funder's issued rule set for the requisition's route, where one is in force.
  override: { id: string; label: string; matrix: Matrix } | null;
  /// Whether the requisition's route supersedes the limits, as snapshotted on it.
  supersedes: boolean;
}

export interface FunderResolution {
  resolution: Resolution;
  source: "DAL" | "OVERRIDE";
  overrideIssue: { id: string; label: string } | null;
  warnings: ResolutionWarning[];
}

export function resolveUnderFunder(ctx: FunderContext, query: ResolveQuery): FunderResolution {
  let resolution = resolveApproval(ctx.dal, query);
  const warnings: ResolutionWarning[] = [];
  if (!ctx.supersedes) return { resolution, source: "DAL", overrideIssue: null, warnings: resolution.warnings };
  const clause = ctx.dal.policy.clauses?.funderOverride ?? null;
  const cite = clause ? { clause } : {};
  const noClause = clause ? "" : " The clause that says a funder's rules prevail over the approval matrix is not recorded.";
  const funded = ctx.override ? resolveApproval(ctx.override.matrix, query) : null;
  if (ctx.override && funded?.rule) {
    resolution = funded;
    warnings.push({
      code: "GOV_OVERRIDE",
      level: "info",
      messageEn: `Externally funded: the funder's rule set “${ctx.override.label}” superseded the approval matrix here.${noClause}`,
      messageMs: `Dibiayai pihak luar: set peraturan penyandang dana “${ctx.override.label}” mengatasi matriks kelulusan.`,
      ...cite,
    });
    return { resolution, source: "OVERRIDE", overrideIssue: { id: ctx.override.id, label: ctx.override.label }, warnings: [...resolution.warnings, ...warnings] };
  }
  warnings.push({
    code: "GOV_OVERRIDE",
    level: "warn",
    messageEn:
      (ctx.override
        ? `Externally funded, but the funder's rule set “${ctx.override.label}” has no rule for this, so the approval matrix routed it.`
        : "Externally funded, but no funder's rule set is issued for this funding route, so the approval matrix routed it. The funder's own guidelines may still prevail where they conflict.") + noClause,
    messageMs: "Dibiayai pihak luar, tetapi set peraturan penyandang dana tidak digunakan.",
    ...cite,
  });
  // The engine's own GOV_OVERRIDE is not added: the query does not carry the flag.
  return { resolution, source: "DAL", overrideIssue: null, warnings: [...resolution.warnings, ...warnings] };
}

export type AppointmentState = "RESOLVED" | "DEPENDS_ON_METHOD" | "NO_METHOD_KEY" | "NO_RULE";

export interface AppointmentPreview {
  state: AppointmentState;
  methodCode: string | null;
  ruleKey: string | null;
  ruleLabel: string | null;
  clause: string | null;
  approverCode: string | null;
  committeeCode: string | null;
  committeeAct: string | null;
  chain: ApprovalStep[];
  source: "DAL" | "OVERRIDE";
  overrideIssue: { id: string; label: string } | null;
  /// The engine's warnings, already worded.
  warnings: ResolutionWarning[];
}

const EMPTY = (state: AppointmentState, methodCode: string | null): AppointmentPreview => ({
  state,
  methodCode,
  ruleKey: null,
  ruleLabel: null,
  clause: null,
  approverCode: null,
  committeeCode: null,
  committeeAct: null,
  chain: [],
  source: "DAL",
  overrideIssue: null,
  warnings: [],
});

function preview(ctx: FunderContext, domain: string, method: Method, value: number): AppointmentPreview {
  if (!method.authorityMethodKey) return EMPTY("NO_METHOD_KEY", method.code);
  const r = resolveUnderFunder(ctx, { domain, method: method.authorityMethodKey, value });
  const rule = r.resolution.rule;
  if (!rule) return { ...EMPTY("NO_RULE", method.code), source: r.source, overrideIssue: r.overrideIssue, warnings: r.warnings };
  return {
    state: "RESOLVED",
    methodCode: method.code,
    ruleKey: rule.ruleKey,
    ruleLabel: rule.labelEn,
    clause: rule.clause,
    approverCode: r.resolution.approverCode,
    committeeCode: rule.committeeCode,
    committeeAct: rule.committeeAct,
    chain: r.resolution.chain,
    source: r.source,
    overrideIssue: r.overrideIssue,
    warnings: r.warnings,
  };
}

/**
 * Who approves the appointment for this method at this value. With no method (none
 * chosen, and the regime proposes no single one) the approver depends on the method,
 * and is never guessed (ruling R-12).
 */
export function appointmentPreview(ctx: FunderContext, method: Method | null, value: number): AppointmentPreview {
  if (!method) return EMPTY("DEPENDS_ON_METHOD", null);
  return preview(ctx, APPOINTMENT_DOMAIN, method, value);
}

export type NameApprovalState = "NOT_REQUIRED" | "NO_METHOD_KEY" | "NO_RULE" | "HAS_COMMITTEE_STEP" | "RESOLVED";

/**
 * The route for approval of the name (FR-MTD-008), where the method asks for one. A
 * committee step cannot be discharged on an exercise yet (exercises are not tabled at
 * sittings until 6.5), so a route with one is refused and says so (build decision).
 */
export function resolveNameApproval(ctx: FunderContext, method: Method, value: number): AppointmentPreview & { nameState: NameApprovalState } {
  if (!method.requiresNameApproval) return { ...EMPTY("NO_RULE", method.code), nameState: "NOT_REQUIRED" };
  const p = preview(ctx, NAME_APPROVAL_DOMAIN, method, value);
  if (p.state === "NO_METHOD_KEY") return { ...p, nameState: "NO_METHOD_KEY" };
  if (p.state === "NO_RULE") return { ...p, nameState: "NO_RULE" };
  if (p.chain.some((s) => s.committeeCode)) return { ...p, nameState: "HAS_COMMITTEE_STEP" };
  return { ...p, nameState: "RESOLVED" };
}

export type NameFault = "NAME_NOT_REQUESTED" | "NAME_NOT_APPROVED" | "NAME_REJECTED";

/**
 * Whether invitation may proceed as far as the name goes (FR-MTD-008). Built and
 * tested here; enforced by 6.5, which invites. Reads the latest name-approval route.
 */
export function invitationFault(
  method: Pick<Method, "requiresNameApproval">,
  instances: readonly { status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED"; openedAt: Date }[],
): Finding<NameFault> | null {
  if (!method.requiresNameApproval) return null;
  const latest = [...instances].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())[0];
  if (!latest || latest.status === "RECALLED") return { code: "NAME_NOT_REQUESTED", level: "block" };
  if (latest.status === "PENDING") return { code: "NAME_NOT_APPROVED", level: "block" };
  if (latest.status === "REJECTED") return { code: "NAME_REJECTED", level: "block" };
  return null;
}
