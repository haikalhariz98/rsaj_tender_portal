/**
 * Recall of an approval by the originator (FR-APR-017): before the first decision is recorded, and recorded.
 *
 * The rule is one for every route that can be recalled (a requisition's, the name's, the appointment's):
 *
 * - the route is still open;
 * - no step has been decided, and none of its decisions has been taken at a sitting: a step with a committee decision tabled and awaiting its vote is on the
 *   committee's agenda, and is withdrawn from it first (it is not the originator's to pull from under the committee); and a matter the committee has already
 *   decided since the route opened (carried or not carried) is a decision recorded, even if no step has yet been discharged by citing it (an earlier step may still be
 *   pending, and the vote is cited by hand later): recalling then would make the committee's answer vanish and let the matter go round again;
 * - the person recalling is the originator: whoever sent the route, or (for a requisition) the officer who raised it;
 * - a route sent before the sender was recorded has no originator on record, so nobody is shown to be one, and the recall is refused and says so;
 * - a reason is given.
 *
 * Pure.
 */

export type RecallFault =
  | "REASON_REQUIRED"
  | "ROUTE_NOT_OPEN"
  | "DECISION_RECORDED"
  | "COMMITTEE_DECIDED"
  | "ON_COMMITTEE_AGENDA"
  | "ORIGINATOR_NOT_RECORDED"
  | "NOT_THE_ORIGINATOR";

export interface RecallFacts {
  routeStatus: string;
  steps: readonly { decision: string }[];
  /// Committee decisions on the route's matter that are tabled, not withdrawn and not yet decided.
  tabledAwaitingDecision: number;
  /// Committee decisions on the route's matter, tabled while this route was open, that the committee has decided (carried or not carried) and not withdrawn: a decision recorded though no step cites it yet.
  committeeDecided: number;
  /// Who counts as the originator: those the sender and the matter's raiser are recorded as. Empty: nobody is on record.
  originatorIds: readonly string[];
  /// Whoever is recalling: the signed-in person.
  actorPersonId: string;
  reason: string;
}

/// The first reason the recall is refused, or null. Said in the order an officer would meet them: whether it can be done at all, then whether they may do it.
export function recallFault(f: RecallFacts): RecallFault | null {
  if (f.routeStatus !== "PENDING") return "ROUTE_NOT_OPEN";
  if (f.steps.some((s) => s.decision !== "PENDING")) return "DECISION_RECORDED";
  if (f.committeeDecided > 0) return "COMMITTEE_DECIDED";
  if (f.tabledAwaitingDecision > 0) return "ON_COMMITTEE_AGENDA";
  if (f.originatorIds.length === 0) return "ORIGINATOR_NOT_RECORDED";
  if (!f.originatorIds.includes(f.actorPersonId)) return "NOT_THE_ORIGINATOR";
  if (!f.reason.trim()) return "REASON_REQUIRED";
  return null;
}

export const RECALL_FAULT_TEXT: Readonly<Record<RecallFault, string>> = {
  REASON_REQUIRED: "Say why it is recalled.",
  ROUTE_NOT_OPEN: "There is no open approval to recall.",
  DECISION_RECORDED: "A decision has already been recorded on this approval, so it can no longer be recalled. It can be refused or sent on, not pulled back.",
  COMMITTEE_DECIDED: "A committee has already decided this matter since the approval was sent, so it can no longer be recalled. The decision is to be cited on the approval's committee step; the approval can be refused or sent on, not pulled back.",
  ON_COMMITTEE_AGENDA: "The matter is on a committee's agenda. Withdraw it from the agenda first; a matter waiting for a vote is not recalled from under the committee.",
  ORIGINATOR_NOT_RECORDED: "Nobody is recorded as having sent this approval (it was sent before the sender was recorded), so no one can be shown to be its originator. It is not recalled here.",
  NOT_THE_ORIGINATOR: "Only the person who sent this approval, or raised the request, can recall it.",
};
