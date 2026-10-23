-- Audit batch C (scale): three indexes the worklist, the dashboard and the inbox read by, and the day a SULIT list read is logged for.
-- Down (by hand): DROP INDEX "SulitAccessEvent_list_read_once_a_day", "StaffNotice_recipientPersonId_raisedAt_idx", "CommitteeDecision_outcome_idx", "ApprovalInstance_organisationId_status_idx", then ALTER TABLE "SulitAccessEvent" DROP COLUMN "listDay"

-- AlterTable
ALTER TABLE "SulitAccessEvent" ADD COLUMN     "listDay" DATE;

-- CreateIndex
CREATE INDEX "ApprovalInstance_organisationId_status_idx" ON "ApprovalInstance"("organisationId", "status");

-- CreateIndex
CREATE INDEX "CommitteeDecision_outcome_idx" ON "CommitteeDecision"("outcome");

-- CreateIndex
CREATE INDEX "StaffNotice_recipientPersonId_raisedAt_idx" ON "StaffNotice"("recipientPersonId", "raisedAt");

-- A list read is logged once for each person, record, kind and day. Partial, so every row written before this (listDay null) is untouched and no row ever needs deleting.
CREATE UNIQUE INDEX "SulitAccessEvent_list_read_once_a_day" ON "SulitAccessEvent"("actorPersonId", "scope", "entity", "entityId", "fields", "outcome", "basis", "listDay") WHERE "listDay" IS NOT NULL;
