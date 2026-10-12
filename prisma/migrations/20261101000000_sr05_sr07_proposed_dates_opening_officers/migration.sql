-- Sourcing Requirements v2, step 2a: SR-05 (ruling 8) and SR-07 (ruling 11).
--
-- SR-05: the dates proposed for the tendering window are entered on Scope and estimate before the documents are submitted, so they are
-- columns of the exercise. Both are nullable: null is not entered. No backfill: an exercise already submitted keeps its proposal on the
-- pack, which the key dates still read when the exercise holds none.
--
-- SR-07: the officers who will open a sourcing exercise are named on it. An exercise made before this migration keeps its present behaviour
-- (its panel is picked when the opening starts, ruling G1), so the new column is added with false and only then given the default true,
-- which is what an exercise made from now on is pinned to.

-- AlterTable
ALTER TABLE "SourcingExercise" ADD COLUMN     "openingRosterRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proposedClosingAt" TIMESTAMP(3),
ADD COLUMN     "proposedStartOn" TIMESTAMP(3);

ALTER TABLE "SourcingExercise" ALTER COLUMN "openingRosterRequired" SET DEFAULT true;

-- CreateTable
CREATE TABLE "ExerciseOpeningOfficer" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "committeeMemberId" TEXT,
    "seatLabelSnapshot" TEXT NOT NULL,
    "namedAt" TIMESTAMP(3) NOT NULL,
    "namedByPersonId" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedByPersonId" TEXT,
    "endedAuthority" TEXT NOT NULL DEFAULT '',
    "endedReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ExerciseOpeningOfficer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExerciseOpeningOfficer_exerciseId_idx" ON "ExerciseOpeningOfficer"("exerciseId");

-- CreateIndex
CREATE INDEX "ExerciseOpeningOfficer_personId_idx" ON "ExerciseOpeningOfficer"("personId");

-- One live seat per person per exercise: a person who has been taken off may be named again, but is never named twice at once.
CREATE UNIQUE INDEX "ExerciseOpeningOfficer_one_live_per_person" ON "ExerciseOpeningOfficer"("exerciseId", "personId") WHERE "endedAt" IS NULL;

-- A row that has ended says who ended it, and one that has not ended says nobody did.
ALTER TABLE "ExerciseOpeningOfficer" ADD CONSTRAINT "ExerciseOpeningOfficer_ended_together" CHECK (("endedAt" IS NULL) = ("endedByPersonId" IS NULL));

-- AddForeignKey
ALTER TABLE "ExerciseOpeningOfficer" ADD CONSTRAINT "ExerciseOpeningOfficer_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseOpeningOfficer" ADD CONSTRAINT "ExerciseOpeningOfficer_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseOpeningOfficer" ADD CONSTRAINT "ExerciseOpeningOfficer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseOpeningOfficer" ADD CONSTRAINT "ExerciseOpeningOfficer_committeeMemberId_fkey" FOREIGN KEY ("committeeMemberId") REFERENCES "CommitteeMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseOpeningOfficer" ADD CONSTRAINT "ExerciseOpeningOfficer_namedByPersonId_fkey" FOREIGN KEY ("namedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseOpeningOfficer" ADD CONSTRAINT "ExerciseOpeningOfficer_endedByPersonId_fkey" FOREIGN KEY ("endedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
