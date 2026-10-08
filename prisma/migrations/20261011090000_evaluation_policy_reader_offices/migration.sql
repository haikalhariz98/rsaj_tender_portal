-- Phase 3 rulings applied (product owner, 2026-10-08, decisions log line 1735, FR-EVL-014): the evaluation is open to the Secretariat and to Internal Audit, and which office
-- plays each is customer policy, so each is a nullable office setting with its provenance and no default. Additive: four nullable columns on the evaluation policy, no row judged.
-- Null means not set: it reads "not set" on the configuration screen and grants nothing. These are not the estimate-audit office (ScopePolicy.estimateAuditRoleCode), which means
-- custody of the company estimate.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement:
--   ALTER TABLE "EvaluationPolicy" DROP COLUMN "internalAuditRoleCode", DROP COLUMN "internalAuditRoleProvenance", DROP COLUMN "secretariatRoleCode", DROP COLUMN "secretariatRoleProvenance"

-- AlterTable
ALTER TABLE "EvaluationPolicy" ADD COLUMN     "internalAuditRoleCode" TEXT,
ADD COLUMN     "internalAuditRoleProvenance" "Provenance",
ADD COLUMN     "secretariatRoleCode" TEXT,
ADD COLUMN     "secretariatRoleProvenance" "Provenance";
