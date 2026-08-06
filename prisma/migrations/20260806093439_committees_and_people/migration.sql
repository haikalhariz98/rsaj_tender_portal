-- CreateEnum
CREATE TYPE "Provenance" AS ENUM ('STATED', 'OBSERVED', 'ASSUMED');

-- CreateEnum
CREATE TYPE "CommitteeAction" AS ENUM ('APPROVES', 'RECOMMENDS', 'CONSENTS', 'DECIDES');

-- CreateEnum
CREATE TYPE "CommitteePosition" AS ENUM ('CHAIRMAN', 'DEPUTY_CHAIRMAN', 'MEMBER', 'SECRETARY');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'MINUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('SETUJU', 'TIDAK_SETUJU', 'ABSTAIN');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('PENDING', 'CARRIED', 'NOT_CARRIED', 'DEFERRED');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "staffNo" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "jobTitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "scope" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Committee" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "mandate" TEXT NOT NULL,
    "governingSource" TEXT NOT NULL,
    "action" "CommitteeAction" NOT NULL DEFAULT 'RECOMMENDS',
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "quorum" INTEGER,
    "quorumProvenance" "Provenance",
    "compositionProvenance" "Provenance",
    "valueScopeMin" DECIMAL(18,2),
    "valueScopeMax" DECIMAL(18,2),
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Committee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteeMember" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "personId" TEXT,
    "seatRoleCode" TEXT,
    "seatLabel" TEXT,
    "position" "CommitteePosition" NOT NULL DEFAULT 'MEMBER',
    "isAlternate" BOOLEAN NOT NULL DEFAULT false,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "appointmentRef" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "CommitteeMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "agenda" TEXT NOT NULL DEFAULT '',
    "minutes" TEXT NOT NULL DEFAULT '',
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "standingInFor" TEXT,

    CONSTRAINT "MeetingAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteeDecision" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "matterRef" TEXT,
    "amount" DECIMAL(18,2),
    "act" "AuthorityAct" NOT NULL DEFAULT 'R',
    "dalRuleKey" TEXT,
    "outcome" "DecisionOutcome" NOT NULL DEFAULT 'PENDING',
    "decisionDate" TIMESTAMP(3),

    CONSTRAINT "CommitteeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_organisationId_name_idx" ON "Person"("organisationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Person_organisationId_staffNo_key" ON "Person"("organisationId", "staffNo");

-- CreateIndex
CREATE INDEX "RoleAssignment_roleCode_effectiveFrom_idx" ON "RoleAssignment"("roleCode", "effectiveFrom");

-- CreateIndex
CREATE INDEX "RoleAssignment_personId_idx" ON "RoleAssignment"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Committee_organisationId_code_key" ON "Committee"("organisationId", "code");

-- CreateIndex
CREATE INDEX "CommitteeMember_committeeId_effectiveFrom_idx" ON "CommitteeMember"("committeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CommitteeMember_personId_idx" ON "CommitteeMember"("personId");

-- CreateIndex
CREATE INDEX "Meeting_committeeId_meetingDate_idx" ON "Meeting"("committeeId", "meetingDate");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_committeeId_reference_key" ON "Meeting"("committeeId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendance_meetingId_personId_key" ON "MeetingAttendance"("meetingId", "personId");

-- CreateIndex
CREATE INDEX "CommitteeDecision_meetingId_idx" ON "CommitteeDecision"("meetingId");

-- CreateIndex
CREATE INDEX "Vote_decisionId_idx" ON "Vote"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_decisionId_personId_key" ON "Vote"("decisionId", "personId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Committee" ADD CONSTRAINT "Committee_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeMember" ADD CONSTRAINT "CommitteeMember_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeMember" ADD CONSTRAINT "CommitteeMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "CommitteeDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
