-- AlterTable
ALTER TABLE "RegistrationDeclaration" ALTER COLUMN "applicationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SupplierDocument" ADD COLUMN     "answersItemId" TEXT;

-- CreateIndex
CREATE INDEX "SupplierDocument_answersItemId_idx" ON "SupplierDocument"("answersItemId");

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_answersItemId_fkey" FOREIGN KEY ("answersItemId") REFERENCES "ResubmissionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 4c. A declaration signed to change the bank details after registration belongs to the profile it authorises and to no application. Every declaration belongs to at least one of the two.
-- Every row so far names an application, so the CHECK holds for them.
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_has_subject" CHECK (("applicationId" IS NOT NULL OR "creditorProfileId" IS NOT NULL) IS TRUE);

-- One declaration of a kind per profile (the unique index on the application cannot hold it where there is none: NULLs are distinct).
CREATE UNIQUE INDEX "RegistrationDeclaration_one_per_profile_kind" ON "RegistrationDeclaration"("creditorProfileId", "kind") WHERE "creditorProfileId" IS NOT NULL;
