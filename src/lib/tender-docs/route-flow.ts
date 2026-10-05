/**
 * The Approval for Tendering route as a flow of steps (founder, 2026-10-05: once submitted, the
 * route reads like the requisition's approval, "Submitted → each approver → Approved for
 * tendering"). One helper feeds both the Overview's read-only stepper and the Tender documents
 * card, so the two never word the route differently.
 */

import { routeSteps, type RouteStatus } from "@/lib/approvals/route-steps";
import { formatDate } from "@/lib/format";
import { TENDERING_STATE_LABEL } from "@/lib/method/labels";
import type { StepperStep } from "@/lib/ui/steps";

import { tenderingRouteLabel } from "./labels";

/// The route row as `loadExercise` reads it: only what the steps need.
export interface TenderingRouteForSteps {
  status: RouteStatus;
  /// The route's own notes; a recalled route on a cancelled exercise reads as withdrawn from them.
  warnings: unknown;
  /// A stored day (the organisation's day at midnight UTC): written with formatDate, never as an instant.
  openedAt: Date;
  steps: readonly {
    id: string;
    roleLabel: string;
    decision: "PENDING" | "DONE" | "REJECTED";
    committeeCode: string | null;
    decidedByName: string | null;
    decidedOn: Date | null;
  }[];
}

/**
 * Submitted, each office or committee in order with who decided it and when, then the outcome in
 * the route's own words: "Approved for tendering" (still to come while the route is open),
 * "Returned for amendment" for a rejection (Q-3, §7.3.2), or as an exercise route reads otherwise.
 */
export function tenderingStepperSteps(inst: TenderingRouteForSteps): StepperStep[] {
  return routeSteps(
    {
      status: inst.status,
      openedOn: formatDate(inst.openedAt),
      steps: inst.steps.map((s) => ({
        id: s.id,
        label: s.roleLabel,
        decision: s.decision,
        committee: !!s.committeeCode,
        decidedBy: s.decidedByName,
        decidedOn: s.decidedOn ? formatDate(s.decidedOn) : null,
      })),
    },
    (status) => (status === "PENDING" ? TENDERING_STATE_LABEL.APPROVED : tenderingRouteLabel(status, inst.warnings)),
  );
}
