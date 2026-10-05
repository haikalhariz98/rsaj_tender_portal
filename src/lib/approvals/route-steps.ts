import type { StepperStep } from "@/lib/ui/steps";

/// One approval step as the step tracker needs it. Days are passed already written for the screen.
export interface RouteStepIn {
  id: string;
  /// The office or committee that decides it.
  label: string;
  decision: "PENDING" | "DONE" | "REJECTED";
  committee: boolean;
  /// Who decided it, and when, where it is decided.
  decidedBy: string | null;
  decidedOn: string | null;
}

/**
 * An approval route as a flow of steps (founder, 2026-10-05): "Submitted", each office or
 * committee in order, then the outcome. The first undecided step of an open route is the one
 * waiting now; the ones after it are not reached yet. A rejected step and a rejected route read
 * as rejected; a recalled route leaves its undecided steps not reached and its outcome
 * "Recalled".
 */
export function routeSteps(route: {
  status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED";
  openedOn: string;
  steps: readonly RouteStepIn[];
}): StepperStep[] {
  const open = route.status === "PENDING";
  const firstPending = route.steps.findIndex((s) => s.decision === "PENDING");
  const out: StepperStep[] = [{ key: "submitted", label: "Submitted", sub: route.openedOn, state: "done" }];
  route.steps.forEach((s, i) => {
    if (s.decision === "DONE") {
      out.push({ key: s.id, label: s.label, sub: [s.decidedBy, s.decidedOn].filter(Boolean).join(" · ") || undefined, state: "done" });
    } else if (s.decision === "REJECTED") {
      out.push({ key: s.id, label: s.label, sub: [s.decidedBy, s.decidedOn].filter(Boolean).join(" · ") || undefined, state: "rejected" });
    } else if (open && i === firstPending) {
      out.push({ key: s.id, label: s.label, sub: s.committee ? "Awaiting the committee" : "Awaiting decision", state: "current" });
    } else {
      out.push({ key: s.id, label: s.label, state: "waiting" });
    }
  });
  const outcome: Record<typeof route.status, StepperStep> = {
    PENDING: { key: "outcome", label: "Approved", state: "waiting" },
    APPROVED: { key: "outcome", label: "Approved", state: "done" },
    REJECTED: { key: "outcome", label: "Rejected", state: "rejected" },
    RECALLED: { key: "outcome", label: "Recalled", state: "rejected" },
  };
  out.push(outcome[route.status]);
  return out;
}
