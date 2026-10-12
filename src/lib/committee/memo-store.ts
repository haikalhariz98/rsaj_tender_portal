/**
 * Issuing the not-approved memo (FR-CTE-009), the I/O around `memo.ts`: read the organisation's notification rule for the event, find who holds the offices it
 * names for the matter's unit, write a notice to each in the outcome's own transaction, and record on the decision what became of the memo.
 */

import type { Tx } from "@/lib/audit/record";
import type { StaffActor } from "@/lib/auth/types";
import { deciderIdsOfStep } from "@/lib/approvals/recall-store";
import { matterNotCarriedMemo } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";

import { NOT_CARRIED_EVENT_KEY } from "./labels";
import { DECISION_EXERCISE_SELECT, exerciseOfDecisionRow } from "./hidden";
import { memoPlan, type MemoState } from "./memo";

const UNIT_OF_REQUISITION = { select: { sectionUnitCode: true, requestingUnitCode: true } } as const;
const REQUISITION_OF_EXERCISE = { select: { requisition: UNIT_OF_REQUISITION } } as const;
const EXERCISE_OF_CONTRACT = { select: { award: { select: { exercise: REQUISITION_OF_EXERCISE } } } } as const;

/**
 * What the memo needs of the matter, read from the decision itself and by every link it can name its matter through, so a matter never falls back to "no unit" or "no
 * exercise" only because it names them by another road:
 * - the exercise, by the four links the restricted-exercise screens follow (`exerciseOfDecisionRow`), so a restricted exercise's memo is hidden like its other notices (FR-MTD-007);
 * - the unit (the requisition's section or requesting unit), through the requisition, the exercise (by any of the four), or the contract's award for a variation or a contract matter.
 * Null for either where the matter has none (a manual matter), and the organisation-wide holders are then the only ones found.
 */
export async function matterOfDecision(tx: Tx, organisationId: string, decisionId: string): Promise<{ exerciseId: string | null; unitCode: string | null }> {
  const d = await tx.committeeDecision.findFirst({
    where: { id: decisionId, meeting: { committee: { organisationId } } },
    select: {
      ...DECISION_EXERCISE_SELECT,
      requisition: UNIT_OF_REQUISITION,
      exercise: REQUISITION_OF_EXERCISE,
      bqVersion: { select: { exerciseId: true, exercise: REQUISITION_OF_EXERCISE } },
      scopeExercise: REQUISITION_OF_EXERCISE,
      bidEnvelope: { select: { exerciseId: true, exercise: REQUISITION_OF_EXERCISE } },
      evaluationBidder: { select: { evaluation: { select: { exerciseId: true, exercise: REQUISITION_OF_EXERCISE } } } },
      variation: { select: { contract: EXERCISE_OF_CONTRACT } },
      contractMatter: { select: { contract: EXERCISE_OF_CONTRACT } },
    },
  });
  if (!d) return { exerciseId: null, unitCode: null };
  const req =
    d.requisition ??
    d.exercise?.requisition ??
    d.bqVersion?.exercise.requisition ??
    d.scopeExercise?.requisition ??
    d.bidEnvelope?.exercise.requisition ??
    d.evaluationBidder?.evaluation.exercise.requisition ??
    d.variation?.contract.award.exercise.requisition ??
    d.contractMatter?.contract.award.exercise.requisition ??
    null;
  return { exerciseId: exerciseOfDecisionRow(d), unitCode: req ? req.sectionUnitCode || req.requestingUnitCode || null : null };
}

/**
 * Called inside the transaction that records a NOT_CARRIED outcome, after the outcome is written. Writes the notices and `CommitteeDecision.memoState`.
 * Nothing here can refuse the outcome: a memo that cannot be issued is a state, not an error. The matter's unit and exercise are worked out here from the decision
 * (`matterOfDecision`), never taken from the caller: the caller cannot name the wrong exercise, and cannot leave a restricted one out.
 */
export async function issueNotCarriedMemo(
  tx: Tx,
  actor: StaffActor,
  i: {
    decisionId: string;
    subject: string;
    committeeLabel: string;
    outcomeLabel: string;
    note: string;
    href: string;
    today: string | null;
  },
): Promise<MemoState> {
  const rule = await tx.notificationRule.findFirst({ where: { organisationId: actor.organisationId, eventKey: NOT_CARRIED_EVENT_KEY }, select: { isActive: true, recipientRoleCodes: true } });
  const { exerciseId, unitCode } = await matterOfDecision(tx, actor.organisationId, i.decisionId);
  const holders = new Map<string, string[]>();
  if (rule?.isActive && i.today) {
    for (const code of new Set(rule.recipientRoleCodes)) holders.set(code, await deciderIdsOfStep(tx, actor, { unitCode, today: i.today, roleCode: code, actingRoleCode: null }));
  }
  const plan = memoPlan(rule, (code) => holders.get(code) ?? [], i.today != null);
  if (plan.state === "ISSUED") {
    await writeNotices(
      tx,
      actor.organisationId,
      actor.system ? null : actor.personId,
      matterNotCarriedMemo({ decisionId: i.decisionId, matterLabel: i.subject, committeeLabel: i.committeeLabel, outcomeLabel: i.outcomeLabel, note: i.note, recipients: plan.recipientIds, href: i.href, exerciseId }),
    );
  }
  await tx.committeeDecision.update({ where: { id: i.decisionId }, data: { memoState: plan.state } });
  return plan.state;
}
