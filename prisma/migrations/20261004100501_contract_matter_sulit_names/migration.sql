-- 6.13 Part B Run 1a fix round (review S4): a contract matter's amount and exact ratio take names of their own, so the
-- SULIT registry (src/lib/sulit-fields.ts, matched as whole words) can register them. No act writes them before run 1b.

-- Pre-check (the SELECT CAST pattern): no contract matter holds a routed value or a ratio yet, so the rename moves no
-- data that a reader could already show. Fails with the message as the error, and nothing is changed, if one does.
SELECT CAST((SELECT 'Pre-check failed: a contract matter already holds a routed value or a ratio, so its columns are not renamed. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "ContractMatter" WHERE "routedValue" IS NOT NULL OR "ratioNum" IS NOT NULL OR "ratioDen" IS NOT NULL)) AS INTEGER);

-- RenameColumns
ALTER TABLE "ContractMatter" RENAME COLUMN "routedValue" TO "matterRoutedValue";
ALTER TABLE "ContractMatter" RENAME COLUMN "ratioNum" TO "matterRatioNum";
ALTER TABLE "ContractMatter" RENAME COLUMN "ratioDen" TO "matterRatioDen";

-- The shape CHECK, restated under the new names (Postgres follows a rename by itself, this keeps the text readable).
ALTER TABLE "ContractMatter" DROP CONSTRAINT "ContractMatter_shape";
ALTER TABLE "ContractMatter" ADD CONSTRAINT "ContractMatter_shape" CHECK (
  ("matterRoutedValue" IS NULL OR "matterRoutedValue" >= 0)
  AND (("matterRatioNum" IS NULL) = ("matterRatioDen" IS NULL))
  AND ("matterRatioDen" IS NULL OR "matterRatioDen" > 0)
  AND ("matterRatioNum" IS NULL OR "matterRatioNum" >= 0)
  AND ("closedAt" IS NULL OR "closeReason" <> '')
);
