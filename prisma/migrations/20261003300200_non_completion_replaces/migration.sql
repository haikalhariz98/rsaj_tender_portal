-- Code review run 2 item 6: one live non-completion decision a contract, a later one replacing it explicitly.
-- Pre-check: the unique index is on a new column, so no existing row can collide. Nothing to refuse.

-- AlterTable
ALTER TABLE "NonCompletion" ADD COLUMN     "replaceReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "replacesId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "NonCompletion_replacesId_key" ON "NonCompletion"("replacesId");

-- AddForeignKey
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "NonCompletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A replacement names another decision and says why (hand CHECKs).
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_replaces_other_check" CHECK ("replacesId" IS NULL OR "replacesId" <> "id");
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_replace_reason_check" CHECK (("replacesId" IS NULL AND "replaceReason" = '') OR ("replacesId" IS NOT NULL AND length(btrim("replaceReason")) > 0));
