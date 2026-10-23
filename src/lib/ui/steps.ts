/// Where one step of a flow stands. `current` is the step waiting now; `rejected` ends the flow;
/// `parked` is a step set aside for now (greyed out, dashed). Several steps may be `current` at once.
export type StepState = "done" | "current" | "waiting" | "rejected" | "parked";

/// One step of a flow, as the shared Stepper draws it.
export interface StepperStep {
  key: string;
  label: string;
  /// The role that owns the step, shown under the label ("Procurement officer"): a flow of role-owned steps reads as who does what.
  owner?: string;
  /// A short second line: who decided it and when, or what it waits for.
  sub?: string;
  state: StepState;
  /// What a screen reader is told of the state where the default word would mislead: a returned
  /// route is "sent back for amendment", never "rejected" (Q-3, §7.3.2); a cancelled exercise is "cancelled".
  stateText?: string;
  /// How a `rejected` step is drawn where red would say too much: a return is amber, as it is elsewhere.
  tone?: "warn";
  /// A step that is also a link (the case page's stage switch). The Stepper draws the label as the link.
  href?: string;
  /// A step the page moves to itself, without a navigation (the public registration form returns to a step already done). The Stepper draws the label as a button.
  onSelect?: () => void;
}
