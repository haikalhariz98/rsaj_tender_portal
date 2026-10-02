-- 6.14 increment 1 (rulings condition, ADR 0023): the pre-award routing sheet over the award's appointment route. A header row per award (its type and DATE (1)) and the award as a second owner of a recorded check. Award's own columns are unchanged.
-- AlterTable
ALTER TABLE "RoutingCheck" ADD COLUMN     "awardId" TEXT;

-- CreateTable
CREATE TABLE "AwardRoutingSheet" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "typeSnapshot" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "receivedOn" TIMESTAMP(3),
    "receivedRecordedAt" TIMESTAMP(3),

    CONSTRAINT "AwardRoutingSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AwardRoutingSheet_awardId_key" ON "AwardRoutingSheet"("awardId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingCheck_awardId_iteration_defOrder_key" ON "RoutingCheck"("awardId", "iteration", "defOrder");

-- AddForeignKey
ALTER TABLE "RoutingCheck" ADD CONSTRAINT "RoutingCheck_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardRoutingSheet" ADD CONSTRAINT "AwardRoutingSheet_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardRoutingSheet" ADD CONSTRAINT "AwardRoutingSheet_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardRoutingSheet" ADD CONSTRAINT "AwardRoutingSheet_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "RoutingSheetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A recorded check has exactly one owner: a certificate or an award. The CHECK is rebuilt from the full owner list.
ALTER TABLE "RoutingCheck" DROP CONSTRAINT "RoutingCheck_one_owner";
ALTER TABLE "RoutingCheck" ADD CONSTRAINT "RoutingCheck_one_owner"
  CHECK (num_nonnulls("certificateId", "awardId") = 1);

-- FR-CRT-008: DATE (1) is recorded with the moment it was recorded.
ALTER TABLE "AwardRoutingSheet" ADD CONSTRAINT "AwardRoutingSheet_received"
  CHECK (("receivedOn" IS NULL) = ("receivedRecordedAt" IS NULL));
