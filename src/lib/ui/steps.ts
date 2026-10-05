/// Where one step of a flow stands. `current` is the step waiting now; `rejected` ends the flow.
export type StepState = "done" | "current" | "waiting" | "rejected";

/// One step of a flow, as the shared Stepper draws it.
export interface StepperStep {
  key: string;
  label: string;
  /// A short second line: who decided it and when, or what it waits for.
  sub?: string;
  state: StepState;
  /// What a screen reader is told of the state where the default word would mislead: a returned
  /// route is "sent back for amendment", never "rejected" (Q-3, §7.3.2); a cancelled exercise is "cancelled".
  stateText?: string;
  /// How a `rejected` step is drawn where red would say too much: a return is amber, as it is elsewhere.
  tone?: "warn";
}