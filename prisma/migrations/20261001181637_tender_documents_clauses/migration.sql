-- CreateEnum
CREATE TYPE "AssuranceKind" AS ENUM ('NO_AMBIGUITY', 'DRAWINGS_COORDINATED');

-- AlterTable
ALTER TABLE "SourcingExercise" ADD COLUMN     "regulatedActivity" BOOLEAN,
ADD COLUMN     "regulatorPermitCode" TEXT,
ADD COLUMN     "restrictedTender" BOOLEAN;

-- AlterTable
ALTER TABLE "TenderDocumentPolicy" ADD COLUMN     "assuranceProvenance" "Provenance",
ADD COLUMN     "restrictionLabelEn" TEXT,
ADD COLUMN     "restrictionProvenance" "Provenance";

-- AlterTable
ALTER TABLE "TenderPack" ADD COLUMN     "conditionsSnapshot" JSONB;

-- CreateTable
CREATE TABLE "RegistrationBody" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "qualifierLabelEn" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "RegistrationBody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseRegistrationRequirement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "bodyCode" TEXT NOT NULL,
    "bodyLabelSnapshot" TEXT NOT NULL,
    "qualifierLabelSnapshot" TEXT,
    "qualifiers" TEXT NOT NULL DEFAULT '',
    "alternativeGroup" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseRegistrationRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClauseText" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleMs" TEXT,
    "bodyEn" TEXT NOT NULL,
    "bodyMs" TEXT,
    "bodyVersion" INTEGER NOT NULL DEFAULT 1,
    "mandatoryInAgreements" BOOLEAN,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClauseText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClauseOverride" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "clauseCode" TEXT NOT NULL,
    "clauseTitleSnapshot" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClauseOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackAssurance" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "kind" "AssuranceKind" NOT NULL,
    "personId" TEXT NOT NULL,
    "confirmedOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackAssurance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationBody_organisationId_code_key" ON "RegistrationBody"("organisationId", "code");

-- CreateIndex
CREATE INDEX "ExerciseRegistrationRequirement_exerciseId_idx" ON "ExerciseRegistrationRequirement"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "ClauseText_organisationId_code_key" ON "ClauseText"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ClauseOverride_packId_clauseCode_key" ON "ClauseOverride"("packId", "clauseCode");

-- CreateIndex
CREATE UNIQUE INDEX "PackAssurance_packId_kind_key" ON "PackAssurance"("packId", "kind");

-- AddForeignKey
ALTER TABLE "RegistrationBody" ADD CONSTRAINT "RegistrationBody_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRegistrationRequirement" ADD CONSTRAINT "ExerciseRegistrationRequirement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRegistrationRequirement" ADD CONSTRAINT "ExerciseRegistrationRequirement_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClauseText" ADD CONSTRAINT "ClauseText_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClauseOverride" ADD CONSTRAINT "ClauseOverride_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClauseOverride" ADD CONSTRAINT "ClauseOverride_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TenderPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClauseOverride" ADD CONSTRAINT "ClauseOverride_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackAssurance" ADD CONSTRAINT "PackAssurance_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackAssurance" ADD CONSTRAINT "PackAssurance_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TenderPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackAssurance" ADD CONSTRAINT "PackAssurance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (6.4 increment 2). Prisma does not model CHECK constraints, so they live here
-- and in the lib rules they back.

-- FR-DOC-006: a permit type is recorded only where the works are the regulated activity.
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_permit_only_when_regulated"
  CHECK ("regulatorPermitCode" IS NULL OR "regulatedActivity" = TRUE);

-- FR-DOC-005: alternatives are grouped from 1, and a requirement names its body.
ALTER TABLE "ExerciseRegistrationRequirement" ADD CONSTRAINT "ExerciseRegistrationRequirement_group_positive"
  CHECK ("alternativeGroup" >= 1 AND "bodyCode" <> '' AND "bodyLabelSnapshot" <> '');

-- FR-DOC-011: a clause has words, and its text version counts from 1.
ALTER TABLE "ClauseText" ADD CONSTRAINT "ClauseText_body_and_version"
  CHECK ("bodyVersion" >= 1 AND btrim("bodyEn") <> '' AND btrim("titleEn") <> '');

-- FR-DOC-011: a legal-endorsement override always says why.
ALTER TABLE "ClauseOverride" ADD CONSTRAINT "ClauseOverride_reason_given"
  CHECK (btrim("reason") <> '');
