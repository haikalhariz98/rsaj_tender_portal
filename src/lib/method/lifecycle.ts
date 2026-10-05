/**
 * The exercise's process flow at a glance (founder, 2026-10-05: the Overview opens on where the
 * exercise stands, as a row of steps). Pure: the status, the pack it assembles, the window's phase,
 * its routes and awards, and the days already written for the screen go in; the shared Stepper's
 * steps come out. No clock: "closed" is the window's phase, derived by the caller (ADR 0014).
 *
 * Two shapes:
 * - With a tender or quotation pack: Set up → Documents → Approval for tendering → Advertised or
 *   Invited → Opening → Evaluation → Award.
 * - With no pack (a method that appoints without tenderers, or an exercise prepared before document
 *   assembly, X-9): Set up → Documents → Award, as `awardableStatus` opens its award in preparation.
 *
 * Name approval is never a stage: it gates invitation, it is not a step of the exercise. A
 * cancelled exercise shows only the stages its records prove, then "Cancelled".
 */

import { AWARD_STATUS_LABEL } from "@/lib/award/labels";
import type { AwardStatus } from "@/lib/award/types";
import type { RouteStatus } from "@/lib/approvals/route-steps";
import { formatDate } from "@/lib/format";
import type { StepperStep } from "@/lib/ui/steps";
import { closingVerb, type WindowPhase } from "@/lib/window/phase";
import type { WindowPath } from "@/lib/window/types";

import { latestFirst, tenderingRoutesOf } from "./approval";
import { TENDERING_STATE_LABEL } from "./labels";
import type { ExerciseStatus, PackKind } from "./types";

export type FlowStage = "SETUP" | "DOCUMENTS" | "TENDERING" | "MARKET" | "OPENING" | "EVALUATION" | "AWARD";

export const FLOW_STAGE_LABEL: Readonly<Record<Exclude<FlowStage, "MARKET">, string>> = {
  SETUP: "Set up",
  DOCUMENTS: "Documents",
  TENDERING: "Approval for tendering",
  OPENING: "Opening",
  EVALUATION: "Evaluation",
  AWARD: "Award",
};
/// The market stage is named by its path; before the path is known it is neither.
export const MARKET_LABEL: Readonly<Record<WindowPath | "UNKNOWN", string>> = { ADVERTISED: "Advertised", INVITED: "Invited", UNKNOWN: "In the market" };
export const CANCELLED_LABEL = "Cancelled";

/// What the documents stage says where there is no pack to prepare.
export const NO_PACK_TEXT = "No document pack";
export const BEFORE_ASSEMBLY_TEXT = "Prepared before document assembly";
/// A draft whose method does not say which documents it needs: the rest of the flow is not known yet.
export const PACK_NOT_SET_TEXT = "Which documents: not set for the method";

/// The exercise's routes as loaded, of any domain: only its own tendering routes are read.
export interface FlowRoute {
  id?: string;
  domain: string;
  awardId?: string | null;
  status: RouteStatus;
  /// A stored day: written with formatDate.
  openedAt: Date;
  createdAt?: Date | null;
  steps?: readonly { roleLabel: string; decision: "PENDING" | "DONE" | "REJECTED" }[];
}

export interface ExerciseFlowInput {
  status: ExerciseStatus;
  /// The pack the exercise assembles: the kind written on the move into preparation, or, while it is
  /// still a draft, the method's configured kind. Null on a draft: the method does not say (not set).
  /// Null past the draft: prepared before document assembly, which keeps the no-pack path (X-9).
  packKind: PackKind | null;
  /// Advertised or invited: the window's path, else the method's. Null where neither says.
  path: WindowPath | null;
  /// The window's phase now (`windowPhase`). Null where not derived: never read as closed.
  windowPhase: WindowPhase | null;
  routes: readonly FlowRoute[];
  /// The exercise's awards, in any order. A cancelled award is ignored.
  awards: readonly { status: AwardStatus; reference: string }[];
  /// Days and instants already written for the screen; null or absent where not on record.
  on?: {
    /// The move into preparation (`preparedAt`).
    prepared?: string | null;
    approvedForTendering?: string | null;
    /// The advertisement or invitation.
    published?: string | null;
    /// The window's closing, with its time.
    closing?: string | null;
    /// The main opening finalised.
    opened?: string | null;
    /// The evaluation report issued.
    reportIssued?: string | null;
    /// The cancellation. The exercise has no column for it: the caller reads it from the trail.
    cancelled?: string | null;
  };
}

type Shape = "PACK" | "NO_PACK" | "NOT_SET";

/// Statuses only a pack's exercise reaches: whatever the pack kind says, the status proves a pack.
const TENDERING_STATUSES: ReadonlySet<ExerciseStatus> = new Set(["PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING", "ADVERTISED", "INVITED", "OPENING_IN_PROGRESS", "OPENED", "UNDER_EVALUATION", "EVALUATED"]);

/**
 * Which shape the flow takes. A pack kind of TENDER or QUOTATION, or a status only a pack reaches,
 * is the pack's. NONE is the no-pack path. Null is "not set" on a draft (the snapshot is written only
 * on the move into preparation), and the Phase 1 no-pack path once prepared (X-9, as `awardableStatus`).
 * A cancelled exercise with no pack kind that was never prepared was cancelled as a draft: not set.
 */
export function flowShape(status: ExerciseStatus, packKind: PackKind | null, prepared: boolean): Shape {
  if (TENDERING_STATUSES.has(status) || packKind === "TENDER" || packKind === "QUOTATION") return "PACK";
  if (packKind === "NONE") return "NO_PACK";
  if (status === "DRAFT") return "NOT_SET";
  if (status === "CANCELLED") return prepared ? "NO_PACK" : "NOT_SET";
  return "NO_PACK";
}

const AWARD_RANK: Readonly<Record<AwardStatus, number>> = { CANCELLED: -1, DRAFT: 0, PENDING_APPROVAL: 1, APPROVED: 2, ISSUED: 3, ACCEPTED: 4 };
const AWARD_DONE: ReadonlySet<AwardStatus> = new Set(["APPROVED", "ISSUED", "ACCEPTED"]);

/// The award that stands: the furthest along of those not cancelled. Null where none stands.
export function standingAward<A extends { status: AwardStatus }>(awards: readonly A[]): A | null {
  let best: A | null = null;
  for (const a of awards) if (a.status !== "CANCELLED" && (!best || AWARD_RANK[a.status] > AWARD_RANK[best.status])) best = a;
  return best;
}

interface Stage {
  key: FlowStage;
  label: string;
  /// The second line once the stage is done, and while it is the current one.
  doneSub?: string;
  currentSub?: string;
  /// The second line while not reached, where there is something to say before it.
  waitingSub?: string;
}

const s = (key: FlowStage, label: string, doneSub?: string | null, currentSub?: string | null, waitingSub?: string | null): Stage => ({
  key,
  label,
  doneSub: doneSub ?? undefined,
  currentSub: currentSub ?? undefined,
  waitingSub: waitingSub ?? undefined,
});

/// The index of the stage the status stands at, on the pack's shape; 7 is past the last.
function packReach(status: ExerciseStatus, closed: boolean): number {
  switch (status) {
    case "DRAFT":
      return 0;
    case "DOCUMENTS_IN_PREPARATION":
      return 1;
    case "PENDING_APPROVAL_FOR_TENDERING":
      return 2;
    case "APPROVED_FOR_TENDERING":
      return 3;
    case "ADVERTISED":
    case "INVITED":
      // The window's phase, not the status, says it has closed (ADR 0014).
      return closed ? 4 : 3;
    case "OPENING_IN_PROGRESS":
      return 4;
    case "OPENED":
    case "UNDER_EVALUATION":
      return 5;
    case "EVALUATED":
      return 6;
    case "CANCELLED":
      return 0;
    default: {
      const never: never = status;
      return never;
    }
  }
}

export function exerciseFlow(input: ExerciseFlowInput): StepperStep[] {
  const on = input.on ?? {};
  const cancelled = input.status === "CANCELLED";
  const shape = flowShape(input.status, input.packKind, !!on.prepared);
  const tendering = latestFirst(tenderingRoutesOf(input.routes));
  const latest = tendering[0] ?? null;
  const award = cancelled ? null : standingAward(input.awards);
  const awardSub = award ? `${award.reference} · ${AWARD_STATUS_LABEL[award.status]}` : null;
  const awardDone = !!award && AWARD_DONE.has(award.status);

  let stages: Stage[];
  let reach: number;

  if (shape === "PACK") {
    const closed = input.windowPhase === "CLOSED";
    const published = input.status === "ADVERTISED" || input.status === "INVITED";
    const marketPath: WindowPath | "UNKNOWN" = published ? (input.status as WindowPath) : (input.path ?? "UNKNOWN");
    const notYet = marketPath === "ADVERTISED" ? "Not yet advertised" : marketPath === "INVITED" ? "Not yet invited" : "Not yet published";
    const returned = input.status === "DOCUMENTS_IN_PREPARATION" && latest?.status === "REJECTED";
    const waitingOn = latest?.status === "PENDING" ? latest.steps?.find((x) => x.decision === "PENDING")?.roleLabel : undefined;
    const closingDone = on.closing ? `${closingVerb("CLOSED")} ${on.closing}` : closingVerb("CLOSED");
    stages = [
      s("SETUP", FLOW_STAGE_LABEL.SETUP, on.prepared),
      // A returned route puts the documents back in hand: the stage is current again, never rejected.
      s("DOCUMENTS", FLOW_STAGE_LABEL.DOCUMENTS, latest ? `Submitted ${formatDate(latest.openedAt)}` : null, returned ? TENDERING_STATE_LABEL.RETURNED : null),
      s("TENDERING", FLOW_STAGE_LABEL.TENDERING, on.approvedForTendering, waitingOn ? `Awaiting ${waitingOn}` : "Awaiting approval"),
      s(
        "MARKET",
        MARKET_LABEL[marketPath],
        cancelled ? (on.published ?? null) : closingDone,
        input.status === "APPROVED_FOR_TENDERING" ? notYet : on.closing ? `${closingVerb(input.windowPhase ?? "UNKNOWN")} ${on.closing}` : null,
      ),
      s("OPENING", FLOW_STAGE_LABEL.OPENING, on.opened, input.status === "OPENING_IN_PROGRESS" ? "Under way" : "Awaiting the opening"),
      s("EVALUATION", FLOW_STAGE_LABEL.EVALUATION, on.reportIssued ? `Report issued ${on.reportIssued}` : null, input.status === "UNDER_EVALUATION" ? "Under way" : "Not started"),
      // A draft award opened before the evaluation is done waits on the stage before it; it says so.
      s("AWARD", FLOW_STAGE_LABEL.AWARD, awardSub, awardSub ?? "Not opened yet", awardSub),
    ];
    if (cancelled) {
      // Only what the records prove: each later proof proves the stages before it.
      const proofs = [!!on.prepared, tendering.length > 0, !!on.approvedForTendering, !!on.published, !!on.opened, !!on.reportIssued];
      reach = proofs.lastIndexOf(true) + 1;
    } else {
      reach = packReach(input.status, closed);
    }
  } else if (shape === "NO_PACK") {
    const docs = input.packKind === "NONE" ? NO_PACK_TEXT : BEFORE_ASSEMBLY_TEXT;
    stages = [s("SETUP", FLOW_STAGE_LABEL.SETUP, on.prepared), s("DOCUMENTS", FLOW_STAGE_LABEL.DOCUMENTS, docs, docs), s("AWARD", FLOW_STAGE_LABEL.AWARD, awardSub, awardSub)];
    // In preparation the award is opened from the documents stage: a standing award moves the flow on.
    reach = cancelled ? (on.prepared ? 1 : 0) : input.status === "DRAFT" ? 0 : award ? 2 : 1;
  } else {
    stages = [s("SETUP", FLOW_STAGE_LABEL.SETUP, on.prepared), s("DOCUMENTS", FLOW_STAGE_LABEL.DOCUMENTS, null, null, PACK_NOT_SET_TEXT), s("AWARD", FLOW_STAGE_LABEL.AWARD)];
    reach = cancelled && on.prepared ? 1 : 0;
  }

  if (cancelled) {
    const proven: StepperStep[] = stages.slice(0, reach).map((x) => ({ key: x.key, label: x.label, sub: x.doneSub, state: "done" }));
    return [...proven, { key: "CANCELLED", label: CANCELLED_LABEL, sub: on.cancelled ?? undefined, state: "rejected", stateText: "cancelled" }];
  }

  const awardAt = stages.length - 1;
  if (awardDone) {
    // An award approved, issued or accepted ends the flow. Stages the status never reached (an award
    // made under an earlier gate) are left not reached rather than claimed done.
    return stages.map((x, i): StepperStep => (i === awardAt || i < reach ? { key: x.key, label: x.label, sub: x.doneSub, state: "done" } : { key: x.key, label: x.label, state: "waiting" }));
  }
  return stages.map((x, i): StepperStep => {
    if (i < reach) return { key: x.key, label: x.label, sub: x.doneSub, state: "done" };
    if (i === reach) return { key: x.key, label: x.label, sub: x.currentSub, state: "current" };
    return { key: x.key, label: x.label, sub: x.waitingSub, state: "waiting" };
  });
}
