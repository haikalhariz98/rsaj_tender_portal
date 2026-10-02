-- AlterTable
ALTER TABLE "StandingRequest" ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnByPersonId" TEXT,
ADD COLUMN     "withdrawnReason" TEXT NOT NULL DEFAULT '';

-- AddForeignKey
ALTER TABLE "StandingRequest" ADD CONSTRAINT "StandingRequest_withdrawnByPersonId_fkey" FOREIGN KEY ("withdrawnByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6.15a fix R-7: a withdrawal names who withdrew it, when, and why, all three or none.
ALTER TABLE "StandingRequest" ADD CONSTRAINT "StandingRequest_withdrawal"
  CHECK ((("withdrawnAt" IS NULL) = ("withdrawnByPersonId" IS NULL))
    AND ("withdrawnAt" IS NULL OR length(btrim("withdrawnReason")) > 0));
