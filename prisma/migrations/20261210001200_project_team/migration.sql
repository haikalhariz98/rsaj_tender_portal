-- Workspace 3b (plan workspace-3b-build-plan.md section 3.1, migration 2, ADR 0049 D4, B-12): the Project team card, four fixed roles per contract.
-- Roles route work and notices and never carry authority. Additive: a new enum and a new table, and nothing existing changes. Removal is an audited delete
-- (the WorkItemLink precedent), so the table has no append-only trigger.

-- CreateEnum
CREATE TYPE "ProjectTeamRole" AS ENUM ('PROJECT_MANAGER', 'SITE_ENGINEER', 'CONTRACT_ADMINISTRATOR', 'CONSULTANT');

-- CreateTable
CREATE TABLE "ProjectTeamMember" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "role" "ProjectTeamRole" NOT NULL,
    "personId" TEXT NOT NULL,
    "addedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectTeamMember_personId_idx" ON "ProjectTeamMember"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTeamMember_contractId_role_personId_key" ON "ProjectTeamMember"("contractId", "role", "personId");

-- AddForeignKey
ALTER TABLE "ProjectTeamMember" ADD CONSTRAINT "ProjectTeamMember_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTeamMember" ADD CONSTRAINT "ProjectTeamMember_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTeamMember" ADD CONSTRAINT "ProjectTeamMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTeamMember" ADD CONSTRAINT "ProjectTeamMember_addedByPersonId_fkey" FOREIGN KEY ("addedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One Project manager per contract (B-12). Partial, so Prisma's schema does not model it. The act refuses a second first, and this is the backstop.
CREATE UNIQUE INDEX "ProjectTeamMember_one_manager" ON "ProjectTeamMember"("contractId") WHERE "role" = 'PROJECT_MANAGER';
