-- FR-AWD-006 and FR-AWD-009 (design note 0004 C13): two more kinds of staff notice, the indent's expiry and the late commencement of an issued award. The kinds are in
-- STAFF_NOTICE_KINDS (src/lib/inbox/kinds.ts) and a source test holds the latest definition of this CHECK to that list. The CHECK is replaced whole: a kind not listed is refused as before.
ALTER TABLE "StaffNotice" DROP CONSTRAINT "StaffNotice_kind_known";
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_kind_known" CHECK (("kind" IN ('STEP_ESCALATED', 'STEP_MOVED_ON_ABSENCE', 'HOLDER_MARKED_ABSENT', 'ROUTE_RECALLED', 'DELEGATION_RECEIVED', 'MATTER_NOT_CARRIED_MEMO', 'CONTRACTOR_SUBMISSION', 'BACKDATE_TO_CONFIRM', 'INDENT_EXPIRED', 'COMMENCEMENT_LATE')) IS TRUE);
