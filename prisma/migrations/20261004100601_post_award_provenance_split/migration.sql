-- 6.13 Part B Run 1a fix round (review S7): each switch and ceiling records its own provenance. The two release
-- switches shared releaseProvenance, and the nominated bond rate, quotation ceiling and letters' switch shared
-- nominatedProvenance. Each gets a nullable column of its own, shipped unset, and the shared ones go.

-- Pre-check (the SELECT CAST pattern): no post-award policy records either shared provenance yet (no editor sets them
-- before runs 2 and 3), so dropping them loses nothing. Fails with the message as the error, and nothing is changed,
-- if one does.
SELECT CAST((SELECT 'Pre-check failed: a post-award policy already records the provenance of its releases or its nominated settings, so the shared columns are not dropped. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "PostAwardPolicy" WHERE "releaseProvenance" IS NOT NULL OR "nominatedProvenance" IS NOT NULL)) AS INTEGER);

-- AlterTable
ALTER TABLE "PostAwardPolicy" DROP COLUMN "nominatedProvenance",
DROP COLUMN "releaseProvenance",
ADD COLUMN     "nominatedBondProvenance" "Provenance",
ADD COLUMN     "nominatedQuotationCeilingProvenance" "Provenance",
ADD COLUMN     "nominationLetterFormsProvenance" "Provenance",
ADD COLUMN     "performanceBondReleaseProvenance" "Provenance",
ADD COLUMN     "retentionBalanceReleaseProvenance" "Provenance";
