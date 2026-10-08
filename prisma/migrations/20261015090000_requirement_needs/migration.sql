-- AlterTable
ALTER TABLE "ExerciseRegistrationRequirement" ADD COLUMN     "qualifiersFromNeeds" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ExerciseRequirementNeed" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "registrationValueId" TEXT NOT NULL,
    "kind" "RegistrationValueKind" NOT NULL,
    "codeSnapshot" TEXT NOT NULL,
    "labelSnapshot" TEXT NOT NULL,

    CONSTRAINT "ExerciseRequirementNeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExerciseRequirementNeed_requirementId_idx" ON "ExerciseRequirementNeed"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseRequirementNeed_requirementId_registrationValueId_key" ON "ExerciseRequirementNeed"("requirementId", "registrationValueId");

-- AddForeignKey
ALTER TABLE "ExerciseRequirementNeed" ADD CONSTRAINT "ExerciseRequirementNeed_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRequirementNeed" ADD CONSTRAINT "ExerciseRequirementNeed_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "ExerciseRegistrationRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRequirementNeed" ADD CONSTRAINT "ExerciseRequirementNeed_registrationValueId_fkey" FOREIGN KEY ("registrationValueId") REFERENCES "RegistrationValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 4c (615-C1). A need is one of five kinds. A class is not a need in this version, and an unknown kind is refused rather than passed.
ALTER TABLE "ExerciseRequirementNeed" ADD CONSTRAINT "ExerciseRequirementNeed_kind_known" CHECK ("kind" IN ('GRADE', 'CATEGORY', 'SPECIALISATION', 'FIELD_CODE', 'PERMIT_TYPE'));

-- A requirement states one minimum grade, never two: the comparison is by rank against the lowest accepted.
CREATE UNIQUE INDEX "ExerciseRequirementNeed_one_grade" ON "ExerciseRequirementNeed"("requirementId") WHERE "kind" = 'GRADE';
