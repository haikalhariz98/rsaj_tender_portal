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

import { requesterOnlySteps, requesterOnlyText, type AbleToAct } from "@/lib/authority/requester-only";
import { resolveApproval } from "@/lib/authority/resolve";
import type { ApprovalStep, CoreChainRecord, Matrix, Resolution, ResolutionWarning, ResolveQuery } from "@/lib/authority/types";

import type { Sen } from "@/lib/money";
import { ableToAct, type Holders } from "@/lib/requisition/holders";

import { APPOINTMENT_DOMAIN, NAME_APPROVAL_DOMAIN, TENDERING_APPROVAL_DOMAIN, WINDOW_CHANGE_DOMAIN, type ExerciseStatus, type Finding, type Method } from "./types";

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
  /// The core routing behind the chain, for a route's snapshot (FR-APR-004).
  core?: CoreChainRecord;
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

/// The route of `domain` for a method at a value, under the funder's rule set where it supersedes.
/// `cond`: the matter's condition, where the domain's rows are written per condition (6.5's
/// window_change: a correction, an extension or a cancellation); a general row serves any.
export function exerciseRoutePreview(ctx: FunderContext, domain: string, method: Method, value: number, cond: string | null = null): AppointmentPreview {
  return preview(ctx, domain, method, value, cond);
}

function preview(ctx: FunderContext, domain: string, method: Method, value: number, cond: string | null = null): AppointmentPreview {
  if (!method.authorityMethodKey) return EMPTY("NO_METHOD_KEY", method.code);
  const r = resolveUnderFunder(ctx, { domain, method: method.authorityMethodKey, value, ...(cond ? { cond } : {}) });
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
    core: r.resolution.core,
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

/**
 * An exercise's own routes, told apart by domain (ruling X-5). An exercise carries the
 * approval of its name and, from 6.4, Approval for Tendering; an award's appointment
 * route also names the exercise but is the award's. Every reader takes its routes
 * through this one splitter, never by `awardId` alone, so a tendering route never reads
 * as a name route (and an approved one never satisfies `invitationFault`). A later
 * module adds its domain here and nowhere else.
 */
export const EXERCISE_ROUTE_DOMAINS = [NAME_APPROVAL_DOMAIN, TENDERING_APPROVAL_DOMAIN, WINDOW_CHANGE_DOMAIN] as const;
export type ExerciseRouteDomain = (typeof EXERCISE_ROUTE_DOMAINS)[number];

/// The database filter for an exercise's own routes: no award, and one of its domains.
export const EXERCISE_ROUTES_WHERE = { awardId: null, domain: { in: [...EXERCISE_ROUTE_DOMAINS] } };

const isExerciseDomain = (d: string): d is ExerciseRouteDomain => (EXERCISE_ROUTE_DOMAINS as readonly string[]).includes(d);

/// An exercise's routes split by domain, in the order given. A route of another domain,
/// or an award's, is in none of them.
export function routesByDomain<T extends { domain: string; awardId?: string | null }>(routes: readonly T[]): Record<ExerciseRouteDomain, T[]> {
  const out = Object.fromEntries(EXERCISE_ROUTE_DOMAINS.map((d) => [d, [] as T[]])) as Record<ExerciseRouteDomain, T[]>;
  for (const r of routes) if (!r.awardId && isExerciseDomain(r.domain)) out[r.domain].push(r);
  return out;
}

/// The approval-of-the-name routes (FR-MTD-008).
export const nameRoutesOf = <T extends { domain: string; awardId?: string | null }>(routes: readonly T[]): T[] => routesByDomain(routes)[NAME_APPROVAL_DOMAIN];
/// The Approval for Tendering routes (FR-DOC-012).
export const tenderingRoutesOf = <T extends { domain: string; awardId?: string | null }>(routes: readonly T[]): T[] => routesByDomain(routes)[TENDERING_APPROVAL_DOMAIN];
/// 6.5: the routes deciding a change to the window — a closing correction or extension, or a cancellation (OD-5).
export const windowChangeRoutesOf = <T extends { domain: string; awardId?: string | null }>(routes: readonly T[]): T[] => routesByDomain(routes)[WINDOW_CHANGE_DOMAIN];
/// Every route of the exercise's own, of any of its domains (cancelling withdraws them all).
export const exerciseRoutesOf = <T extends { domain: string; awardId?: string | null }>(routes: readonly T[]): T[] => {
  const by = routesByDomain(routes);
  return routes.filter((r) => EXERCISE_ROUTE_DOMAINS.some((d) => by[d].includes(r)));
};

/// What an exercise route is called, where it opens and how its audit rows name it.
/// Labels only: the domain key never reaches a screen.
export const EXERCISE_ROUTE_MATTER: Record<ExerciseRouteDomain, { kind: string; tab: string; auditNoun: string }> = {
  [NAME_APPROVAL_DOMAIN]: { kind: "Approval of the name", tab: "name", auditNoun: "name approval" },
  [TENDERING_APPROVAL_DOMAIN]: { kind: "Approval for tendering", tab: "documents", auditNoun: "approval for tendering" },
  [WINDOW_CHANGE_DOMAIN]: { kind: "Change to the invitation window", tab: "invitation", auditNoun: "window change" },
};

/// The label of an exercise route of any domain. A domain the product does not know
/// reads as an approval on the exercise and opens the exercise itself.
export function exerciseRouteMatter(domain: string): { kind: string; tab: string | null; auditNoun: string } {
  return isExerciseDomain(domain) ? EXERCISE_ROUTE_MATTER[domain] : { kind: "Approval on the exercise", tab: null, auditNoun: "approval" };
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

export type NameRequestFault = "NAME_EXERCISE_CANCELLED" | "NAME_NOT_ASKED" | "NAME_ALREADY_REQUESTED" | "NAME_REJECTION_UNRESOLVED" | "TIME_ZONE_UNSET";

/**
 * Whether the name may be sent for approval now. While the exercise is a draft or in
 * preparation (it gates invitation, not preparation — ruling on BD-4), and again after
 * a route was refused or withdrawn; never while one is open or approved.
 */
export function nameRequestFault(
  status: ExerciseStatus,
  method: Pick<Method, "requiresNameApproval"> | null,
  instances: readonly { status: string; rejectionApplied?: string | null; rejectionChoices?: readonly string[] }[],
  today: string | null,
): Finding<NameRequestFault> | null {
  if (status === "CANCELLED") return { code: "NAME_EXERCISE_CANCELLED", level: "block" };
  if (!method?.requiresNameApproval) return { code: "NAME_NOT_ASKED", level: "block" };
  if (today == null) return { code: "TIME_ZONE_UNSET", level: "block" };
  if (instances.some((i) => i.status === "PENDING" || i.status === "APPROVED")) return { code: "NAME_ALREADY_REQUESTED", level: "block" };
  // A refusal whose destination is the officer's choice is answered first (FR-APR-016,
  // ruling CO-5): asking again would choose "back to the originator" without saying so.
  if (instances.some((i) => i.status === "REJECTED" && !i.rejectionApplied && (i.rejectionChoices?.length ?? 0) > 0)) return { code: "NAME_REJECTION_UNRESOLVED", level: "block" };
  return null;
}

/// Whether the requester holds an office, and who else is able to act for it, from
/// 6.1's holder lookup for the requisition's unit on the day: holders and live
/// delegates within their ceiling, available (FR-APR-008, ruling R1). The request
/// action and the page both ask it.
export function requesterHolding(
  holdersOf: (roleCode: string) => Holders,
  requesterId: string,
  value: Sen,
  available: (personId: string) => boolean,
): RequesterOnName {
  return {
    id: requesterId,
    holds: (code: string) => holdersOf(code).holderIds.includes(requesterId),
    ableToAct: (code: string) => ableToAct(holdersOf(code), requesterId, value, available),
  };
}

export interface RequesterOnName {
  id: string;
  holds: (roleCode: string) => boolean;
  ableToAct: (roleCode: string) => AbleToAct;
}

/**
 * The name's route with the requester in mind (6.1's rule, reused). Where the
 * requisition's requester holds the approving office, the engine's self-approval rule
 * escalates it; with nowhere to escalate, the route is refused naming the setting.
 * Any other step only the requester is able to act for is refused too, naming the way
 * out (FR-APR-008, ruling R1: it was a warning; a route nobody can move is not opened).
 */
export function nameRouteForRequester(
  ctx: FunderContext,
  method: Method,
  value: number,
  requester: RequesterOnName,
): (AppointmentPreview & { nameState: NameApprovalState }) & { refusal: string | null } {
  const r = resolveNameApproval(ctx, method, value);
  if (r.nameState !== "RESOLVED") return { ...r, refusal: null };
  return { ...r, ...withRequester(ctx, NAME_APPROVAL_DOMAIN, method, value, r, requester, "the name") };
}

/**
 * An exercise route of `domain`, resolved, with the requester in mind (FR-APR-008):
 * self-approval escalates or is refused naming the setting; a step only the requester
 * could act for is refused naming the way out. `what` is what the approving office
 * approves, in the refusal's words ("the name", "tendering").
 */
export function withRequester(
  ctx: FunderContext,
  domain: string,
  method: Method,
  value: number,
  resolved: AppointmentPreview,
  requester: RequesterOnName,
  what: string,
): Pick<AppointmentPreview, "approverCode" | "chain" | "warnings"> & { refusal: string | null } {
  let r: Pick<AppointmentPreview, "approverCode" | "chain" | "warnings" | "source"> = resolved;
  if (r.approverCode && requester.holds(r.approverCode)) {
    const self = r.approverCode;
    const q = { domain, method: method.authorityMethodKey, value, actorRoleCode: self };
    const e = resolveUnderFunder(ctx, q);
    const refused = e.warnings.find((w) => w.code === "SELF_APPROVAL" && w.level === "err");
    if (refused || !e.resolution.approverCode) {
      const name = ctx.dal.roles[self]?.nameEn ?? "the approving office";
      return { approverCode: r.approverCode, chain: r.chain, warnings: r.warnings, refusal: `The requisition's requester holds the office that approves ${what} (${name}), and no office is set to approve in its place. Set where self-approval escalates to for that office under Users & roles, then request again.` };
    }
    r = { ...r, approverCode: e.resolution.approverCode, chain: e.resolution.chain, warnings: e.warnings };
  }
  const roles = r.source === "OVERRIDE" && ctx.override ? ctx.override.matrix.roles : ctx.dal.roles;
  const only = requesterOnlySteps(r.chain, requester.id, requester.ableToAct);
  const refusal = only.length > 0 ? only.map((s) => requesterOnlyText(s, roles[s.roleCode]?.nameEn ?? ctx.dal.roles[s.roleCode]?.nameEn ?? "an office no longer configured", "requisition", ctx.dal.policy.clauses?.selfApproval)).join(" ") : null;
  return { approverCode: r.approverCode, chain: r.chain, warnings: r.warnings, refusal };
}
