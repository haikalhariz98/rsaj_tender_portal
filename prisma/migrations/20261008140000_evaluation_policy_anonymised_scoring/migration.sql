-- Phase 3b (FR-EVL-020): anonymised technical scoring is customer policy, so it is a nullable switch with no default. Additive: two nullable columns on the evaluation policy.
-- Null means not decided: scoring shows the bidders' names as it always has, and the configuration screen says the setting is not set. The setting is frozen onto an
-- evaluation version when it starts (in its policy snapshot), so a later change never reveals or hides a version already under way.

-- AlterTable
ALTER TABLE "EvaluationPolicy" ADD COLUMN     "anonymisedScoring" BOOLEAN,
ADD COLUMN     "anonymisedScoringProvenance" "Provenance";
