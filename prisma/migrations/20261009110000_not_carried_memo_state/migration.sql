-- Phase 3c (FR-CTE-009): what became of the not-approved memo when a matter was not carried. Additive: one nullable column, no existing row judged. Null means
-- nothing is recorded: a matter decided before the memo was issued in the portal, or one that was not a NOT_CARRIED outcome.
-- The list of states is the closed list in src/lib/committee/memo.ts (MEMO_STATES), and a source test holds this file to it. The CHECK is wrapped in "IS TRUE"
-- so that an unknown value refuses rather than passes.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line
--   ALTER TABLE "CommitteeDecision" DROP COLUMN "memoState"

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "memoState" TEXT;

ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_memo_state_known" CHECK (("memoState" IS NULL OR "memoState" IN ('ISSUED', 'NO_RULE', 'RULE_OFF', 'NO_ONE_HOLDS')) IS TRUE);

-- The memo belongs to a matter that was not carried, and to no other outcome.
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_memo_only_when_not_carried" CHECK (("memoState" IS NULL OR "outcome" = 'NOT_CARRIED') IS TRUE);
