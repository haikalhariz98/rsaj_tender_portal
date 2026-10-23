/**
 * The Overview's process flow, as the founder's document lays it out (Sourcing Requirements v2,
 * section 3, ruling 7 / GAP-F1): Requisition raised, Requisition approved, Exercise drafted, Scope
 * and estimate, Tender documents, Approval for tendering, Published, Bids received, Opening, Jadual
 * Tawaran, Evaluation, Award. Each step is derived from recorded state and from nothing else.
 *
 * The seven-stage derivation in `exerciseFlow` stays the engine (statuses, routes, window phase,
 * awards, the no-pack and not-set shapes, the cancelled proofs); this puts the requisition in front
 * of it and gives the stages the document's names, splitting two of them:
 * - the market stage is Published (the advertisement or invitation) then Bids received (the window
 *   open, then closed);
 * - the opening stage is Opening, then the Jadual Tawaran, which is made from the opened bids and
 *   so follows the opening. No separate record of it exists until the opening checklist (SR-14,
 *   SR-15) is built, and this does not claim one.
 *
 * "Each step must be complete before the next one opens" is held by the server, not here: an
 * exercise is created only from an approved requisition, and each handover (submission, approval,
 * publication, closing, the opening's finalising, the evaluation's start, the report) is refused in
 * words by `transitionFault`. The flow shows where the exercise stands; it opens nothing.
 */

import type { RequisitionStatus } from "@/lib/requisition/types";
import type { StepperStep } from "@/lib/ui/steps";

import { exerciseFlow, MARKET_LABEL, type ExerciseFlowInput } from "./lifecycle";

/// The requisition's states from which it has been approved, and the exercise may stand on it.
const APPROVED_REQUISITION: ReadonlySet<RequisitionStatus> = new Set(["APPROVED", "SOURCING", "PARTIALLY_FULFILLED", "FULFILLED"]);

export interface SourcingFlowInput extends ExerciseFlowInput {
  requisition: {
    status: RequisitionStatus;
    /// Its reference, as the officers know it.
    reference: string;
    /// The status in words, for a requisition not yet approved.
    statusLabel: string;
  };
}

export const FLOW_LABEL = {
  PR_RAISED: "Requisition raised",
  PR_APPROVED: "Requisition approved",
  DRAFT: "Exercise drafted",
  SETUP: "Scope and estimate",
  DOCUMENTS: "Tender documents",
  PUBLISHED: "Published",
  RECEIVED: "Bids received",
  JADUAL: "Schedule of tenders",
} as const;

export const FLOW_JADUAL_SUB = "Follows the opening";

export function sourcingFlow(input: SourcingFlowInput): StepperStep[] {
  const { requisition: req } = input;
  const base = exerciseFlow(input);
  const cancelled = input.status === "CANCELLED";
  // An exercise past its draft could only have been created from an approved requisition (the creation gate).
  const approved = APPROVED_REQUISITION.has(req.status) || input.status !== "DRAFT";
  const out: StepperStep[] = [
    { key: "PR_RAISED", label: FLOW_LABEL.PR_RAISED, sub: req.reference, state: "done" },
    approved
      ? { key: "PR_APPROVED", label: FLOW_LABEL.PR_APPROVED, state: "done" }
      : { key: "PR_APPROVED", label: FLOW_LABEL.PR_APPROVED, sub: req.statusLabel, state: "current" },
    { key: "DRAFT", label: FLOW_LABEL.DRAFT, state: "done" },
  ];
  const has = (key: string) => base.some((x) => x.key === key);
  for (const step of base) {
    switch (step.key) {
      case "SETUP":
        out.push({ ...step, label: FLOW_LABEL.SETUP });
        break;
      case "DOCUMENTS":
        out.push({ ...step, label: FLOW_LABEL.DOCUMENTS });
        break;
      case "MARKET": {
        const pathWord = input.status === "ADVERTISED" || input.status === "INVITED" ? MARKET_LABEL[input.status] : input.path ? MARKET_LABEL[input.path] : null;
        const publishedSub = input.on?.published ? `${pathWord ?? "Published"} ${input.on.published}` : (pathWord ?? undefined);
        if (step.state === "done") {
          out.push({ key: "PUBLISHED", label: FLOW_LABEL.PUBLISHED, sub: publishedSub, state: "done" });
          // A cancelled exercise shows the window as received only when the opening proves it closed.
          if (!cancelled || has("OPENING")) out.push({ key: "RECEIVED", label: FLOW_LABEL.RECEIVED, sub: step.sub, state: "done" });
        } else if (step.state === "current") {
          // Approved but not yet published: Published is the step in hand. Published and open: the bids are.
          if (input.status === "APPROVED_FOR_TENDERING") {
            out.push({ key: "PUBLISHED", label: FLOW_LABEL.PUBLISHED, sub: step.sub, state: "current" }, { key: "RECEIVED", label: FLOW_LABEL.RECEIVED, state: "waiting" });
          } else {
            out.push({ key: "PUBLISHED", label: FLOW_LABEL.PUBLISHED, sub: publishedSub, state: "done" }, { key: "RECEIVED", label: FLOW_LABEL.RECEIVED, sub: step.sub, state: "current" });
          }
        } else {
          out.push({ key: "PUBLISHED", label: FLOW_LABEL.PUBLISHED, sub: step.sub, state: "waiting" }, { key: "RECEIVED", label: FLOW_LABEL.RECEIVED, state: "waiting" });
        }
        break;
      }
      case "OPENING":
        out.push(step);
        out.push(step.state === "done" ? { key: "JADUAL", label: FLOW_LABEL.JADUAL, sub: FLOW_JADUAL_SUB, state: "done" } : { key: "JADUAL", label: FLOW_LABEL.JADUAL, state: "waiting" });
        break;
      default:
        out.push(step);
    }
  }
  if (approved) return out;
  // The requisition is the step in hand: nothing after it is also "current".
  return out.map((x, i) => (i > 1 && x.state === "current" ? { key: x.key, label: x.label, state: "waiting" } : x));
}

export type SourcingPhaseKey = "PREPARE" | "PUBLISH" | "BIDS" | "EVALUATE" | "AWARD";

/// The five phases the Overview shows (SP-14), each with the steps of `sourcingFlow` it folds and the role that owns it. The owners are display defaults.
export const SOURCING_PHASES: readonly { key: SourcingPhaseKey; label: string; owner: string; steps: readonly string[] }[] = [
  { key: "PREPARE", label: "Prepare", owner: "Secretariat", steps: ["PR_RAISED", "PR_APPROVED", "DRAFT", "SETUP", "DOCUMENTS"] },
  { key: "PUBLISH", label: "Publish", owner: "Secretariat", steps: ["TENDERING", "PUBLISHED"] },
  { key: "BIDS", label: "Bids", owner: "Opening committee", steps: ["RECEIVED", "OPENING", "JADUAL"] },
  { key: "EVALUATE", label: "Evaluate", owner: "Evaluation committee", steps: ["EVALUATION"] },
  { key: "AWARD", label: "Award", owner: "Tender Board", steps: ["AWARD"] },
];

/**
 * `sourcingFlow` folded into five phases (SP-14). It wraps the flow and replaces nothing: the server gates are untouched. A phase is done when all
 * its steps are, current when any is, and the current one says "Step n of m: <name>". A phase with none of its steps in the flow (a method with no
 * pack has no window) is left out. A cancelled exercise keeps the phases its records prove, ending on Cancelled; a phase only part proven is not done.
 */
export function sourcingPhases(input: SourcingFlowInput, owners: Partial<Record<SourcingPhaseKey, string>> = {}): StepperStep[] {
  const steps = sourcingFlow(input);
  const out: StepperStep[] = [];
  for (const p of SOURCING_PHASES) {
    const own = steps.filter((x) => p.steps.includes(x.key));
    if (own.length === 0) continue;
    const owner = owners[p.key] ?? p.owner;
    const current = own.find((x) => x.state === "current");
    if (current) out.push({ key: p.key, label: p.label, owner, sub: `Step ${steps.indexOf(current) + 1} of ${steps.length}: ${current.label}`, state: "current" });
    else if (own.every((x) => x.state === "done") && (input.status !== "CANCELLED" || own.length === p.steps.length)) out.push({ key: p.key, label: p.label, owner, state: "done" });
    else out.push({ key: p.key, label: p.label, owner, state: "waiting" });
  }
  const stop = steps.find((x) => x.key === "CANCELLED");
  return stop ? [...out, stop] : out;
}
