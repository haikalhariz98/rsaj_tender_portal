/**
 * A route the requester alone could move (FR-APR-008, ruling R1).
 *
 * Nobody decides a step of a matter they raised. Where the requester is the only
 * person able to act for a person step on the day — the office's holders, and for a
 * step that may be delegated its live delegates — that step could never be decided, and
 * the route would open only to stall. So submission is refused, with the way out:
 *
 * - a mandatory act (MR, MJR, MA), or a step marked not delegable, can be neither
 *   delegated nor skipped: another officer must raise the matter;
 * - any other step: record a delegation of that office to another officer, or have
 *   another officer raise it.
 *
 * Escalating past the requester's own step is not done: it would skip a step the
 * limits require (ruling R1; a question to the customer). The approving step is not
 * judged here when the requester holds it: the engine's self-approval rule has already
 * moved it upward before this runs.
 *
 * Pure: who is able to act is passed in, read by the caller on the submission day.
 */

import { ACT_LABEL } from "@/lib/labels";

import { MANDATORY_ACTS, type ApprovalStep } from "./types";

/// The people able to act for an office on the day: holders, and live delegates whose
/// delegation reaches the matter's value. The requester counts if they hold it.
export interface AbleToAct {
  holderIds: readonly string[];
  delegateIds: readonly string[];
}

export type RequesterOnlyKind = "MANDATORY" | "NOT_DELEGABLE" | "DELEGABLE";

export interface RequesterOnlyStep {
  kind: RequesterOnlyKind;
  /// 1-based position of the step on the chain.
  sequence: number;
  roleCode: string;
  act: ApprovalStep["act"];
}

export function requesterOnlySteps(
  chain: readonly ApprovalStep[],
  requesterId: string | null,
  ableToAct: (roleCode: string) => AbleToAct,
): RequesterOnlyStep[] {
  if (!requesterId) return [];
  const out: RequesterOnlyStep[] = [];
  chain.forEach((step, i) => {
    // A committee's step is discharged by its decision, not by a person.
    if (step.committeeCode) return;
    const kind: RequesterOnlyKind = MANDATORY_ACTS.has(step.act) ? "MANDATORY" : step.nonDelegable ? "NOT_DELEGABLE" : "DELEGABLE";
    const able = ableToAct(step.roleCode);
    // A delegate cannot act on a step that may not be delegated.
    const people = new Set([...able.holderIds, ...(kind === "DELEGABLE" ? able.delegateIds : [])]);
    if (people.has(requesterId) && people.size === 1) out.push({ kind, sequence: i + 1, roleCode: step.roleCode, act: step.act });
  });
  return out;
}

/**
 * The refusal, in words, naming the office and the exits. `matter` is what the
 * requester raised; `clause` is the customer's citation for the rule, where recorded.
 */
export function requesterOnlyText(s: RequesterOnlyStep, officeName: string, matter = "requisition", clause?: string | null): string {
  const act = ACT_LABEL[s.act]?.toLowerCase() ?? "a decision";
  const cite = clause ? ` (${clause})` : "";
  const who = `The ${matter}'s requester is the only officer able to act as ${officeName} on this route (step ${s.sequence}, ${act}), and nobody decides a step of a matter they raised${cite}.`;
  if (s.kind === "MANDATORY") return `${who} A mandatory act can be neither delegated nor skipped: another officer must raise the ${matter}.`;
  if (s.kind === "NOT_DELEGABLE") return `${who} This step may not be delegated: another officer must raise the ${matter}.`;
  return `${who} Record a delegation of the ${officeName} office to another officer under Users & roles, or have another officer raise the ${matter}.`;
}
