-- CreateEnum
CREATE TYPE "VotingRule" AS ENUM ('SIMPLE_MAJORITY', 'UNANIMOUS');

-- CreateEnum
CREATE TYPE "NotApprovedKind" AS ENUM ('LOOP', 'TERMINAL');

-- CreateEnum
CREATE TYPE "MatterKind" AS ENUM ('REQUISITION', 'EXERCISE', 'LATE_TENDER', 'CONTRACT', 'VARIATION');

-- AlterTable
ALTER TABLE "Committee" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "retiredOn" TIMESTAMP(3),
ADD COLUMN     "secretariatRoleCode" TEXT,
ADD COLUMN     "votingRule" "VotingRule",
ADD COLUMN     "votingRuleProvenance" "Provenance";

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "dependsOnDecisionId" TEXT,
ADD COLUMN     "matterKind" "MatterKind",
ADD COLUMN     "notApprovedOutcomeId" TEXT,
ADD COLUMN     "outcomeNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "presentVoters" INTEGER,
ADD COLUMN     "quorumRequired" INTEGER,
ADD COLUMN     "recusedCount" INTEGER,
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tabledAt" TIMESTAMP(3),
ADD COLUMN     "tabledByPersonId" TEXT,
ADD COLUMN     "votingRule" "VotingRule",
ADD COLUMN     "votingRuleProvenance" "Provenance";

-- AlterTable
ALTER TABLE "CommitteeMember" ADD COLUMN     "alternateForId" TEXT;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "cancelledReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "minutedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MeetingAttendance" ADD COLUMN     "standingInForSeatId" TEXT;

-- AlterTable
ALTER TABLE "Vote" ADD COLUMN     "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "DecisionRecusal" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRecusal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotApprovedOutcome" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "kind" "NotApprovedKind" NOT NULL,
    "returnsToStage" TEXT,
    "committeeId" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "NotApprovedOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRecusal_decisionId_personId_key" ON "DecisionRecusal"("decisionId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "NotApprovedOutcome_organisationId_code_key" ON "NotApprovedOutcome"("organisationId", "code");

-- AddForeignKey
ALTER TABLE "CommitteeMember" ADD CONSTRAINT "CommitteeMember_alternateForId_fkey" FOREIGN KEY ("alternateForId") REFERENCES "CommitteeMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_standingInForSeatId_fkey" FOREIGN KEY ("standingInForSeatId") REFERENCES "CommitteeMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_tabledByPersonId_fkey" FOREIGN KEY ("tabledByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_dependsOnDecisionId_fkey" FOREIGN KEY ("dependsOnDecisionId") REFERENCES "CommitteeDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_notApprovedOutcomeId_fkey" FOREIGN KEY ("notApprovedOutcomeId") REFERENCES "NotApprovedOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRecusal" ADD CONSTRAINT "DecisionRecusal_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "CommitteeDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRecusal" ADD CONSTRAINT "DecisionRecusal_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotApprovedOutcome" ADD CONSTRAINT "NotApprovedOutcome_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotApprovedOutcome" ADD CONSTRAINT "NotApprovedOutcome_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
