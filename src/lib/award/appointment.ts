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

import type { ApprovalStep, ResolutionWarning } from "@/lib/authority/types";
import { resolveUnderFunder, type FunderContext } from "@/lib/method/approval";
import { dossierFault } from "@/lib/method/justification";
import { APPOINTMENT_DOMAIN, type Method } from "@/lib/method/types";

import type { Finding } from "./types";

export type RouteFault = "DEPENDS_ON_METHOD" | "NO_METHOD_KEY" | "NO_RULE" | "ROUTE_ERROR";

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
    }
  | { ok: false; fault: RouteFault; ruleKey: string | null; ruleLabel: string | null; messages: string[] };

export interface RoutePeople {
  /// Offices with nobody able to act on the day for the requisition's unit.
  absentRoleCodes: readonly string[];
  /// Whether the requisition's requester holds an office for its unit on the day.
  requesterHolds: (roleCode: string) => boolean;
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
  };
}

/**
 * Which offices on a chain have nobody able to act: every holder for the unit is away
 * or has left, and nobody holds a delegation of the office. Authority then reverts
 * upward (FR-APR-010, DAL §1.6) — the engine does it, the route records it.
 */
export function absentOffices(
  codes: readonly string[],
  holdersOf: (code: string) => { holderIds: readonly string[]; delegates: readonly { personId: string }[] },
  available: (personId: string) => boolean,
): string[] {
  return codes.filter((c) => {
    const h = holdersOf(c);
    if (h.holderIds.length === 0) return false; // vacant is not absent: the route says who, and deciding waits for a holder
    return !h.holderIds.some(available) && !h.delegates.some((d) => available(d.personId));
  });
}

export type SubmitFault = "NOT_DRAFT" | "TIME_ZONE_UNSET" | "EXERCISE_NOT_IN_PREPARATION" | "ANOTHER_ROUTE_OPEN" | RouteFault | "REASON_REQUIRED" | "DOSSIER_UNNUMBERED" | "EVIDENCE_NOT_ATTACHED";

/**
 * Whether an award may be sent for the appointment's approval. The awarded value's own
 * faults (`awardValueFaults`) and the instrument's are added by the caller; the
 * dossier a direct appointment keeps must pass `dossierFault` (FR-MTD-009), which with
 * no document storage it cannot yet (build decision BD-4).
 */
export function submitFaults(i: {
  status: string;
  today: string | null;
  exerciseStatus: string;
  openRoute: boolean;
  method: Pick<Method, "requiresDossier"> | null;
  dossier: { justificationReasonCode: string | null; dossierReference: string | null; evidenceAttachments: number };
  route: AppointmentRoute;
}): Finding<SubmitFault>[] {
  const f = (code: SubmitFault, data?: Finding["data"]): Finding<SubmitFault> => ({ code, level: "block", ...(data ? { data } : {}) });
  if (i.status !== "DRAFT") return [f("NOT_DRAFT")];
  const out: Finding<SubmitFault>[] = [];
  if (i.today == null) out.push(f("TIME_ZONE_UNSET"));
  if (i.exerciseStatus !== "DOCUMENTS_IN_PREPARATION") out.push(f("EXERCISE_NOT_IN_PREPARATION"));
  if (i.openRoute) out.push(f("ANOTHER_ROUTE_OPEN"));
  if (i.method) for (const d of dossierFault(i.method, i.dossier)) out.push(f(d.code as SubmitFault));
  if (!i.route.ok) out.push(f(i.route.fault, { rule: i.route.ruleLabel, messages: i.route.messages.join(" ") || null }));
  return out;
}

/// The offices a route treated as absent, from its recorded warnings (BD-2): each
/// absence the engine reverted upward from, or could not.
export function absentFrom(warnings: readonly { code?: string; from?: string }[] | null | undefined): string[] {
  return [...new Set((warnings ?? []).filter((w) => w.code === "ABSENCE" && w.from).map((w) => w.from!))];
}
