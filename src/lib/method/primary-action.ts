/**
 * The one primary action of an exercise's header (plan 6.4): the next step of the flow, chosen from the exercise's status alone, so that no sibling
 * tab is read to choose it. Pure. It only chooses; whether the viewer may do the step is still judged by the server where it is done, and a step
 * done on another tab is a link to that tab.
 */
export type ExercisePrimary =
  | { kind: "submit_proposal" }
  | { kind: "review_proposal" }
  | { kind: "move_to_preparation" }
  | { kind: "link"; label: string; tab: string; section?: string };

export interface ExercisePrimaryFacts {
  status: string;
  /// The window's phase code, where there is one.
  windowPhase: string | null;
  requiresProposal: boolean;
  proposalState: string | null;
  /// A method with no tender documents: no window, so preparation leads to the award.
  noPack: boolean;
  /// An award that is not cancelled stands on the exercise.
  liveAward: boolean;
}

export function exercisePrimary(f: ExercisePrimaryFacts): ExercisePrimary | null {
  if (f.liveAward) return null;
  switch (f.status) {
    case "DRAFT":
      if (f.requiresProposal && f.proposalState === "DRAFT") return { kind: "submit_proposal" };
      if (f.requiresProposal && f.proposalState === "SUBMITTED") return { kind: "review_proposal" };
      return { kind: "move_to_preparation" };
    case "DOCUMENTS_IN_PREPARATION":
      return f.noPack ? { kind: "link", label: "Open the award", tab: "award" } : { kind: "link", label: "Finish the tender documents", tab: "documents" };
    case "PENDING_APPROVAL_FOR_TENDERING":
      return { kind: "link", label: "See the approval", tab: "documents" };
    case "APPROVED_FOR_TENDERING":
      return { kind: "link", label: "Publish", tab: "documents", section: "publishing" };
    case "ADVERTISED":
    case "INVITED":
      return f.windowPhase === "CLOSED" ? { kind: "link", label: "Open the bids", tab: "bids", section: "opening" } : { kind: "link", label: "See the bids", tab: "bids" };
    case "OPENING_IN_PROGRESS":
      return { kind: "link", label: "Continue the opening", tab: "bids", section: "opening" };
    case "OPENED":
      return { kind: "link", label: "Start the evaluation", tab: "evaluation" };
    case "UNDER_EVALUATION":
      return { kind: "link", label: "Continue the evaluation", tab: "evaluation" };
    case "EVALUATED":
      return { kind: "link", label: "Open the award", tab: "award" };
    default:
      return null;
  }
}
