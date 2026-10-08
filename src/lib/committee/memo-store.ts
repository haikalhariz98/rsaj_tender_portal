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
import { memoPlan, type MemoState } from "./memo";

/**
 * Called inside the transaction that records a NOT_CARRIED outcome, after the outcome is written. Writes the notices and `CommitteeDecision.memoState`.
 * Nothing here can refuse the outcome: a memo that cannot be issued is a state, not an error.
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
    /// The matter's unit (the requisition's section or requesting unit), or null where it has none: the organisation-wide holders are then the only ones found.
    unitCode: string | null;
    exerciseId: string | null;
    href: string;
    today: string | null;
  },
): Promise<MemoState> {
  const rule = await tx.notificationRule.findFirst({ where: { organisationId: actor.organisationId, eventKey: NOT_CARRIED_EVENT_KEY }, select: { isActive: true, recipientRoleCodes: true } });
  const holders = new Map<string, string[]>();
  if (rule?.isActive) {
    for (const code of new Set(rule.recipientRoleCodes)) holders.set(code, await deciderIdsOfStep(tx, actor, { unitCode: i.unitCode, today: i.today, roleCode: code, actingRoleCode: null }));
  }
  const plan = memoPlan(rule, (code) => holders.get(code) ?? []);
  if (plan.state === "ISSUED") {
    await writeNotices(
      tx,
      actor.organisationId,
      actor.system ? null : actor.personId,
      matterNotCarriedMemo({ decisionId: i.decisionId, matterLabel: i.subject, committeeLabel: i.committeeLabel, outcomeLabel: i.outcomeLabel, note: i.note, recipients: plan.recipientIds, href: i.href, exerciseId: i.exerciseId }),
    );
  }
  await tx.committeeDecision.update({ where: { id: i.decisionId }, data: { memoState: plan.state } });
  return plan.state;
}

