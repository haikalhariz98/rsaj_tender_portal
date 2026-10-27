-- Phase 2 close-out stage B (plan closeout-plan.md sections 4.3, 5): two more staff notice kinds, the defects liability period ending
-- and a defect line the contractor reported rectified. From 20261201000100, with the two added last.
-- The kinds are in STAFF_NOTICE_KINDS (src/lib/inbox/kinds.ts) and a source test holds this, the latest definition, to that list.
ALTER TABLE "StaffNotice" DROP CONSTRAINT "StaffNotice_kind_known";
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_kind_known" CHECK (("kind" IN ('STEP_ESCALATED', 'STEP_MOVED_ON_ABSENCE', 'HOLDER_MARKED_ABSENT', 'ROUTE_RECALLED', 'DELEGATION_RECEIVED', 'MATTER_NOT_CARRIED_MEMO', 'CONTRACTOR_SUBMISSION', 'BACKDATE_TO_CONFIRM', 'INDENT_EXPIRED', 'COMMENCEMENT_LATE', 'PROJECT_DOCUMENT_TO_APPROVE', 'PROJECT_DOCUMENT_FROM_CONTRACTOR', 'PROJECT_DOCUMENT_REQUESTED', 'AWARD_RETURN_LODGED', 'AWARD_QUERY_RAISED', 'DLP_ENDING', 'DEFECT_RECTIFIED')) IS TRUE);
