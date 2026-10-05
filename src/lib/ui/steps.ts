/// Where one step of a flow stands. `current` is the step waiting now; `rejected` ends the flow.
export type StepState = "done" | "current" | "waiting" | "rejected";

/// One step of a flow, as the shared Stepper draws it.
export interface StepperStep {
  key: string;
  label: string;
  /// A short second line: who decided it and when, or what it waits for.
  sub?: string;
  state: StepState;
}