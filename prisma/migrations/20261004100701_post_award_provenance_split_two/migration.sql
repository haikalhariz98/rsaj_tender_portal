-- 6.13 Part B Run 1a residual round (BD-613-124): each switch and ceiling records its own provenance. The re-tender
-- cap and the cost-of-loss days' composition shared terminationProvenance, and the design guarantee bond's rate and
-- years shared designBondProvenance. Each gets a nullable column of its own, shipped unset, and the shared ones go.

-- Pre-check (the SELECT CAST pattern): no post-award policy records either shared provenance yet (no editor sets them
-- before runs 2 and 4), so dropping them loses nothing. Fails with the message as the error, and nothing is changed,
-- if one does.
SELECT CAST((SELECT 'Pre-check failed: a post-award policy already records the provenance of its termination settings or its design guarantee bond, so the shared columns are not dropped. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "PostAwardPolicy" WHERE "terminationProvenance" IS NOT NULL OR "designBondProvenance" IS NOT NULL)) AS INTEGER);

-- AlterTable
ALTER TABLE "PostAwardPolicy" DROP COLUMN "designBondProvenance",
DROP COLUMN "terminationProvenance",
ADD COLUMN     "designBondPctProvenance" "Provenance",
ADD COLUMN     "designBondYearsProvenance" "Provenance",
ADD COLUMN     "lossDaysCompositionProvenance" "Provenance",
ADD COLUMN     "retenderCapProvenance" "Provenance";
