/**
 * The one primary action of a requisition's header (plan 6.3): chosen by its status and by what the viewer may do, so nobody is shown a
 * button they could never use. Pure. It only chooses; every server check behind the action is unchanged. Everything else the page
 * offers goes into the "..." menu.
 */
export type PrimaryKind = "endorse" | "check" | "submit" | "approve" | "recall" | "reopen" | "choose" | "source" | "exercise";

export interface PrimaryFacts {
  status: string;
  /// The first undecided step of the open route, when there is one.
  step: { committee: boolean } | null;
  /// The viewer holds that step's office (or a delegation of it) and nothing bars them.
  viewerDecides: boolean;
  /// The viewer sent the approval or raised the request, and nothing at present refuses the recall.
  viewerMayRecall: boolean;
  /// Before submission: no budget check yet, or the last one is stale.
  budgetCheckNeeded: boolean;
  /// A rejection waits for the officer to say where it goes.
  awaitingChoice: boolean;
  /// Approved, and a sourcing exercise may be opened.
  canSource: boolean;
  /// Exercises not cancelled.
  liveExercises: number;
}

const PRE_SUBMIT = ["ENDORSED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET"];

export function primaryAction(f: PrimaryFacts): PrimaryKind | null {
  if (f.status === "DRAFT") return "endorse";
  if (PRE_SUBMIT.includes(f.status)) return f.budgetCheckNeeded ? "check" : "submit";
  if (f.status === "PENDING_APPROVAL") {
    const plain = f.step != null && !f.step.committee;
    if (plain && f.viewerDecides) return "approve";
    if (f.viewerMayRecall) return "recall";
    return null;
  }
  if (f.status === "RETURNED" || f.status === "RECALLED") return "reopen";
  if (f.status === "REJECTED") return f.awaitingChoice ? "choose" : null;
  if (f.status === "APPROVED" || f.status === "SOURCING") return f.liveExercises > 0 ? "exercise" : f.canSource ? "source" : null;
  return null;
}

/**
 * Which secondary entries of the header menu this viewer is shown (review B1). Recording a decision for the office holder from paper is for those the
 * organisation lets (`acts.recordOnBehalf`), when the organisation allows paper signatures at all, and never for whoever raised the request (the server
 * bars them as recorder: RECORDER_IS_REQUESTER). Recall is drawn only where it can be used. The server checks behind both are unchanged.
 */
export interface MenuFacts {
  kind: PrimaryKind | null;
  /// The first undecided step is one a person decides (not a committee's).
  plainStep: boolean;
  viewerMayRecordForOthers: boolean;
  paperSignaturesAllowed: boolean;
  viewerRaisedIt: boolean;
  viewerIsOriginator: boolean;
  recallUsable: boolean;
}

export function headerMenu(f: MenuFacts): { record: boolean; recall: boolean } {
  return {
    record: f.plainStep && f.kind !== "approve" && f.viewerMayRecordForOthers && f.paperSignaturesAllowed && !f.viewerRaisedIt,
    recall: f.viewerIsOriginator && f.kind !== "recall" && f.recallUsable,
  };
}
