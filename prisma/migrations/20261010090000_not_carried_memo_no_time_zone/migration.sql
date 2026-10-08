-- Phase 3c review fix (FR-CTE-009): a fifth state of the not-approved memo. NO_TIME_ZONE is recorded where the notification rule names offices but the organisation's
-- time zone is not set, so who holds them could not be worked out. It is not "nobody holds them" (NO_ONE_HOLDS), which the panel would state as a fact.
-- Additive: the CHECK is replaced by one that admits the old four values and the new one, so no existing row can violate it.
-- The list of states is the closed list in src/lib/committee/memo.ts (MEMO_STATES), and a source test holds the latest migration that names it to that list.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line
--   UPDATE "CommitteeDecision" SET "memoState" = NULL WHERE "memoState" = 'NO_TIME_ZONE'
--   ALTER TABLE "CommitteeDecision" DROP CONSTRAINT "CommitteeDecision_memo_state_known"
--   ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_memo_state_known" CHECK (("memoState" IS NULL OR "memoState" IN ('ISSUED', 'NO_RULE', 'RULE_OFF', 'NO_ONE_HOLDS')) IS TRUE)

ALTER TABLE "CommitteeDecision" DROP CONSTRAINT "CommitteeDecision_memo_state_known";

ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_memo_state_known" CHECK (("memoState" IS NULL OR "memoState" IN ('ISSUED', 'NO_RULE', 'RULE_OFF', 'NO_ONE_HOLDS', 'NO_TIME_ZONE')) IS TRUE);
