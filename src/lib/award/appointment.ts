/**
 * The appointment's route at award (FR-AWD-001, FR-APR-010; 6.3 BD-3 carry-over).
 *
 * Re-resolved when the award is submitted, for the awarded value, under the issue in
 * force, through 6.3's funder-aware resolver — never read from the exercise's preview.
 * FR-APR-010's escalation is the engine's: an approving office with nobody available to
 * act reverts upward, and where the requisition's requester holds it, the self-approval
 * rule escalates it; both are recorded on the route. What cannot be resolved is refused
 * and says so: no method key, no rule (escalate to the indicated authority's superior
 * and record a rule or a known gap), or any error the engine raises. A known-gap rule
 * resolves, and its warning stays on the route (AGENTS rule 2).
 */

import { requesterOnlySteps, requesterOnlyText, type AbleToAct } from "@/lib/authority/requester-only";
import type { ApprovalStep, CoreChainRecord, ResolutionWarning } from "@/lib/authority/types";
import { invitationFault, resolveUnderFunder, type FunderContext } from "@/lib/method/approval";
import { dossierFault } from "@/lib/method/justification";
import { APPOINTMENT_DOMAIN, type Method, type PackKind } from "@/lib/method/types";

import type { WindowGate } from "@/lib/window/gate";

import { awardableStatus, bidGateFindings, exerciseOpenForAward, type BidGateFacts, type BidGateFault } from "./gate";
import type { Finding } from "./types";

export type RouteFault = "DEPENDS_ON_METHOD" | "NO_METHOD_KEY" | "NO_RULE" | "ROUTE_ERROR" | "REQUESTER_ONLY";

export type AppointmentRoute =
  | {
      ok: true;
      ruleKey: string;
      ruleLabel: string;
      clause: string;
      isGap: boolean;
      chain: ApprovalStep[];
      approverCode: string | null;
      source: "DAL" | "OVERRIDE";
      overrideIssue: { id: string; label: string } | null;
      warnings: ResolutionWarning[];
      /// The core routing behind the chain, for the route's snapshot (FR-APR-004).
      core?: CoreChainRecord;
    }
  | { ok: false; fault: RouteFault; ruleKey: string | null; ruleLabel: string | null; messages: string[] };

export interface RoutePeople {
  /// Offices with nobody able to act on the day for the requisition's unit.
  absentRoleCodes: readonly string[];
  /// Whether the requisition's requester holds an office for its unit on the day.
  requesterHolds: (roleCode: string) => boolean;
  /// The requisition's requester, and who is able to act for an office on the day
  /// (FR-APR-008, ruling R1). Given at submission; left out only where the route is
  /// resolved for its rule alone (opening the award), never to excuse the check.
  requesterId?: string | null;
  ableToAct?: (roleCode: string) => AbleToAct;
}

export function appointmentRoute(ctx: FunderContext, method: Method | null, value: number, people: RoutePeople): AppointmentRoute {
  const fail = (fault: RouteFault, messages: string[] = [], rule: { ruleKey: string; labelEn: string } | null = null): AppointmentRoute => ({ ok: false, fault, ruleKey: rule?.ruleKey ?? null, ruleLabel: rule?.labelEn ?? null, messages });
  if (!method) return fail("DEPENDS_ON_METHOD");
  if (!method.authorityMethodKey) return fail("NO_METHOD_KEY");
  const q = { domain: APPOINTMENT_DOMAIN, method: method.authorityMethodKey, value, absentRoleCodes: [...people.absentRoleCodes] };
  let r = resolveUnderFunder(ctx, q);
  if (!r.resolution.rule) return fail("NO_RULE", r.warnings.filter((w) => w.level === "err").map((w) => w.messageEn));
  // Nobody approves their own matter: the requester holding the approving office
  // escalates it by the engine's own rule, or is refused where nowhere is set.
  const approver = r.resolution.approverCode;
  if (approver && people.requesterHolds(approver)) r = resolveUnderFunder(ctx, { ...q, actorRoleCode: approver });
  const rule = r.resolution.rule!;
  const errors = r.warnings.filter((w) => w.level === "err");
  if (errors.length > 0 || !r.resolution.approverCode) return fail("ROUTE_ERROR", errors.map((w) => w.messageEn), rule);
  // FR-APR-008 (ruling R1): a step only the requisition's requester could act for.
  if (people.ableToAct && people.requesterId) {
    const only = requesterOnlySteps(r.resolution.chain, people.requesterId, people.ableToAct);
    if (only.length > 0) {
      const roles = r.source === "OVERRIDE" && ctx.override ? ctx.override.matrix.roles : ctx.dal.roles;
      const office = (c: string) => roles[c]?.nameEn ?? ctx.dal.roles[c]?.nameEn ?? "an office no longer configured";
      return fail("REQUESTER_ONLY", only.map((s) => requesterOnlyText(s, office(s.roleCode), "requisition", ctx.dal.policy.clauses?.selfApproval)), rule);
    }
  }
  return {
    ok: true,
    ruleKey: rule.ruleKey,
    ruleLabel: rule.labelEn,
    clause: rule.clause,
    isGap: rule.isGap,
    chain: r.resolution.chain,
    approverCode: r.resolution.approverCode,
    source: r.source,
    overrideIssue: r.overrideIssue,
    warnings: r.warnings,
    core: r.resolution.core,
  };
}

/// Which offices have nobody able to act: `authority/absence.ts`, shared with requisitions.
export { absentOffices } from "@/lib/authority/absence";

export type SubmitFault =
  | "NOT_DRAFT"
  | "TIME_ZONE_UNSET"
  | "EXERCISE_NOT_IN_PREPARATION"
  | "EXERCISE_NOT_APPROVED_FOR_TENDERING"
  | "EXERCISE_WINDOW_NOT_CLOSED"
  | "WINDOW_CHANGE_PENDING"
  | "ANOTHER_ROUTE_OPEN"
  | RouteFault
  | "REASON_REQUIRED"
  | "DOSSIER_UNNUMBERED"
  | "EVIDENCE_NOT_ATTACHED"
  | "NAME_NOT_REQUESTED"
  | "NAME_NOT_APPROVED"
  | "NAME_REJECTED"
  | BidGateFault;

/**
 * Whether an award may be sent for the appointment's approval. The awarded value's own
 * faults (`awardValueFaults`) and the instrument's are added by the caller; the
 * dossier a direct appointment keeps must pass `dossierFault` (FR-MTD-009), which with
 * no document storage it cannot yet (build decision BD-4).
 *
 * Until 6.5 enforces it at invitation, a method that asks for approval of the name is
 * not sent for the appointment's approval without an approved, non-withdrawn name route
 * (close-out ruling CO-8, `invitationFault`). Routes not given are none: never a pass.
 */
export function submitFaults(i: {
  status: string;
  today: string | null;
  exerciseStatus: string;
  /// X-9: the exercise's pack kind as recorded on the move into preparation; null before document assembly.
  exercisePackKind: PackKind | null;
  /// 6.5 (X-9): the window's phase and pending change. Not given: not judged, so not open.
  exerciseWindow?: WindowGate | null;
  openRoute: boolean;
  method: (Pick<Method, "requiresDossier"> & Partial<Pick<Method, "requiresNameApproval">>) | null;
  dossier: { justificationReasonCode: string | null; dossierReference: string | null; evidenceAttachments: number };
  route: AppointmentRoute;
  /// The exercise's name-approval routes (its own, not an award's).
  nameRoutes?: readonly ({ status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED"; openedAt: Date; createdAt?: Date | null; id?: string })[];
  /// 6.6 (X-9, flagged): late admission and the bids' validity. Not given: nothing asked.
  bids?: BidGateFacts | null;
}): Finding<SubmitFault>[] {
  const f = (code: SubmitFault, data?: Finding["data"]): Finding<SubmitFault> => ({ code, level: "block", ...(data ? { data } : {}) });
  if (i.status !== "DRAFT") return [f("NOT_DRAFT")];
  const out: Finding<SubmitFault>[] = [];
  if (i.today == null) out.push(f("TIME_ZONE_UNSET"));
  if (!exerciseOpenForAward(i.exerciseStatus, i.exercisePackKind, i.exerciseWindow ?? null)) {
    if (awardableStatus(i.exercisePackKind) === "DOCUMENTS_IN_PREPARATION") out.push(f("EXERCISE_NOT_IN_PREPARATION"));
    else out.push(f(i.exerciseWindow?.changePending && (i.exerciseStatus === "ADVERTISED" || i.exerciseStatus === "INVITED") ? "WINDOW_CHANGE_PENDING" : "EXERCISE_WINDOW_NOT_CLOSED"));
  }
  if (i.openRoute) out.push(f("ANOTHER_ROUTE_OPEN"));
  if (i.method) for (const d of dossierFault(i.method, i.dossier)) out.push(f(d.code as SubmitFault));
  if (i.method?.requiresNameApproval) {
    const name = invitationFault({ requiresNameApproval: true }, i.nameRoutes ?? []);
    if (name) out.push(f(name.code));
  }
  if (!i.route.ok) out.push(f(i.route.fault, { rule: i.route.ruleLabel, messages: i.route.messages.join(" ") || null }));
  // 6.6: an award is not sent for approval while a late envelope waits or the bids' validity has lapsed.
  out.push(...(bidGateFindings(i.bids) as Finding<SubmitFault>[]));
  return out;
}

/// The offices a route treated as absent, from its recorded warnings (BD-2): each
/// absence the engine reverted upward from, or could not.
export function absentFrom(warnings: readonly { code?: string; from?: string }[] | null | undefined): string[] {
  return [...new Set((warnings ?? []).filter((w) => w.code === "ABSENCE" && w.from).map((w) => w.from!))];
}
