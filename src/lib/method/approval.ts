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
  /// The comparison the matched rule applied at the boundary; null where no edge of it
  /// sits there.
  boundaryOperator: "GT" | "GTE" | null;
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
  boundaryOperator: null,
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
    boundaryOperator: r.resolution.boundaryOperator,
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

type RouteOrder = { openedAt: Date; createdAt?: Date | null; id?: string };

/// Routes newest first: by the day opened, then by when written, then by id — two
/// routes opened on the same day, even written in the same instant, are never ordered
/// by chance (ruling on BD-17).
export function latestFirst<T extends RouteOrder>(instances: readonly T[]): T[] {
  const byId = (a: T, b: T) => ((b.id ?? "") < (a.id ?? "") ? -1 : (b.id ?? "") > (a.id ?? "") ? 1 : 0);
  return [...instances].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime() || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || byId(a, b));
}

/**
 * Whether invitation may proceed as far as the name goes (FR-MTD-008). Built and
 * tested here; enforced by 6.5, which invites. Reads the latest name-approval route.
 */
export function invitationFault(
  method: Pick<Method, "requiresNameApproval">,
  instances: readonly ({ status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED" } & RouteOrder)[],
): Finding<NameFault> | null {
  if (!method.requiresNameApproval) return null;
  const latest = latestFirst(instances)[0];
  if (!latest || latest.status === "RECALLED") return { code: "NAME_NOT_REQUESTED", level: "block" };
  if (latest.status === "PENDING") return { code: "NAME_NOT_APPROVED", level: "block" };
  if (latest.status === "REJECTED") return { code: "NAME_REJECTED", level: "block" };
  return null;
}

/// Warning codes a name route is closed with, so its label says why it closed.
export const WITHDRAWN_ON_CHANGE = "WITHDRAWN_ON_CHANGE";
export const WITHDRAWN_ON_CANCEL = "WITHDRAWN_ON_CANCEL";

/// A name route's status in words. A route withdrawn because the exercise changed reads
/// "Withdrawn on change", never "recalled" (6.3 ruling on BD-5).
export function nameRouteLabel(status: string, warnings: unknown): string {
  const codes = Array.isArray(warnings) ? warnings.map((w) => (w as { code?: unknown })?.code) : [];
  if (status === "RECALLED") {
    if (codes.includes(WITHDRAWN_ON_CHANGE)) return "Withdrawn on change";
    if (codes.includes(WITHDRAWN_ON_CANCEL)) return "Withdrawn: exercise cancelled";
    return "Withdrawn";
  }
  return ({ PENDING: "In progress", APPROVED: "Approved", REJECTED: "Refused" } as Record<string, string>)[status] ?? "Closed";
}

export type NameRequestFault = "NAME_EXERCISE_CANCELLED" | "NAME_NOT_ASKED" | "NAME_ALREADY_REQUESTED" | "TIME_ZONE_UNSET";

/**
 * Whether the name may be sent for approval now. While the exercise is a draft or in
 * preparation (it gates invitation, not preparation — ruling on BD-4), and again after
 * a route was refused or withdrawn; never while one is open or approved.
 */
export function nameRequestFault(
  status: "DRAFT" | "DOCUMENTS_IN_PREPARATION" | "CANCELLED",
  method: Pick<Method, "requiresNameApproval"> | null,
  instances: readonly { status: string }[],
  today: string | null,
): Finding<NameRequestFault> | null {
  if (status === "CANCELLED") return { code: "NAME_EXERCISE_CANCELLED", level: "block" };
  if (!method?.requiresNameApproval) return { code: "NAME_NOT_ASKED", level: "block" };
  if (today == null) return { code: "TIME_ZONE_UNSET", level: "block" };
  if (instances.some((i) => i.status === "PENDING" || i.status === "APPROVED")) return { code: "NAME_ALREADY_REQUESTED", level: "block" };
  return null;
}

/// Whether the requester holds an office, and whether they alone do, from 6.1's holder
/// lookup for the requisition's unit. The request action and the page both ask it.
export function requesterHolding(holdersOf: (roleCode: string) => { holderIds: readonly string[] }, requesterId: string) {
  return {
    holds: (code: string) => holdersOf(code).holderIds.includes(requesterId),
    soleHolder: (code: string) => {
      const h = holdersOf(code).holderIds;
      return h.length > 0 && h.every((x) => x === requesterId);
    },
  };
}

/**
 * The name's route with the requester in mind (6.1's rule, reused). Where the
 * requisition's requester holds the approving office, the engine's self-approval rule
 * escalates it; with nowhere to escalate, the route is refused naming the setting.
 * Any other step whose office only the requester holds could be decided only by a
 * delegate: said, as a warning on the route.
 */
export function nameRouteForRequester(
  ctx: FunderContext,
  method: Method,
  value: number,
  requester: { holds: (roleCode: string) => boolean; soleHolder: (roleCode: string) => boolean },
): (AppointmentPreview & { nameState: NameApprovalState }) & { refusal: string | null } {
  let r = resolveNameApproval(ctx, method, value);
  if (r.nameState !== "RESOLVED") return { ...r, refusal: null };
  if (r.approverCode && requester.holds(r.approverCode)) {
    const self = r.approverCode;
    const q = { domain: NAME_APPROVAL_DOMAIN, method: method.authorityMethodKey, value, actorRoleCode: self };
    const e = resolveUnderFunder(ctx, q);
    const refused = e.warnings.find((w) => w.code === "SELF_APPROVAL" && w.level === "err");
    if (refused || !e.resolution.approverCode) {
      const name = ctx.dal.roles[self]?.nameEn ?? "the approving office";
      return { ...r, refusal: `The requisition's requester holds the office that approves the name (${name}), and no office is set to approve in its place. Set where self-approval escalates to for that office under Users & roles, then request again.` };
    }
    r = {
      ...r,
      approverCode: e.resolution.approverCode,
      chain: e.resolution.chain,
      warnings: e.warnings,
    };
  }
  const only = r.chain.filter((s) => !s.committeeCode && requester.soleHolder(s.roleCode));
  const notes = only.map((s) => ({
    code: "REQUESTER_HOLDS_STEP",
    level: "warn" as const,
    messageEn: `The requisition's requester is the only holder of the ${ctx.dal.roles[s.roleCode]?.nameEn ?? "office"} step and may not decide it: only a delegate of that office can.`,
    messageMs: "Pemohon ialah satu-satunya pemegang jawatan ini; hanya wakil boleh memutuskan.",
  }));
  // A warning of this module, not of the engine: worded, and rendered by its text.
  return { ...r, warnings: [...r.warnings, ...(notes as unknown as ResolutionWarning[])], refusal: null };
}
