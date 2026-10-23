/**
 * The one primary action of a project's header and the "Next:" line under the stepper (plan 6.6). Pure. It only chooses: the step's
 * action already carries the viewer's rights (a restricted reader, a hidden office and an ended case all arrive as null), and every
 * server check behind the action is unchanged. Everything else the stage offers goes into the "..." menu.
 */
import type { CaseAction, CaseStep, CaseStepKey } from "./case-steps";

export function primaryAction(viewing: CaseStepKey, steps: readonly CaseStep[]): CaseAction | null {
  return steps.find((s) => s.key === viewing)?.action ?? null;
}

/// What the "Next:" line says, or null when it would only repeat the status: a finished or parked step, or the Project step with
/// nothing to do (the works are on site; the tabs say the rest).
export function nextLine(step: CaseStep): string | null {
  if (step.state === "done" || step.state === "parked") return null;
  if (step.key === "project" && step.action == null && step.state === "in-progress") return null;
  return step.next;
}
