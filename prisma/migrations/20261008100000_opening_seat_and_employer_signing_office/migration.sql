-- Product owner's ruling of 2026-10-07 (NFR-SIG-001, a Must): a signature records the capacity it was made in.
--
-- 1. OpeningAuthorisation and OpeningSignature each name the opening-panel seat (the opening's own OpeningPanelMember row) the member acted in. Nullable, no backfill:
--    a row made before the seat was kept reads "seat not recorded" (ADR 0034 D12, old acts need no backfill). The seat is derivable for old rows, but a written value
--    would claim a record that was not kept.
-- 2. ContractPolicy gets a nullable setting for which office signs a reconciliation amendment for the employer. Unset by default and it does not refuse.
--
-- Only nullable columns and foreign keys on them are added, so no existing row can violate anything and no pre-check is needed.

-- AlterTable
ALTER TABLE "ContractPolicy" ADD COLUMN     "employerSigningRoleCode" TEXT;

-- AlterTable
ALTER TABLE "OpeningAuthorisation" ADD COLUMN     "panelMemberId" TEXT;

-- AlterTable
ALTER TABLE "OpeningSignature" ADD COLUMN     "panelMemberId" TEXT;

-- AddForeignKey
ALTER TABLE "OpeningAuthorisation" ADD CONSTRAINT "OpeningAuthorisation_panelMemberId_fkey" FOREIGN KEY ("panelMemberId") REFERENCES "OpeningPanelMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningSignature" ADD CONSTRAINT "OpeningSignature_panelMemberId_fkey" FOREIGN KEY ("panelMemberId") REFERENCES "OpeningPanelMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
