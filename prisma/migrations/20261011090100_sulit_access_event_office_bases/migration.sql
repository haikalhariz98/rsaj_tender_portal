-- Phase 3 rulings applied (product owner, 2026-10-08, decisions log lines 1735 and 1736): a holder of the Secretariat or the Internal Audit office for evaluations reads the
-- evaluation, and the company estimate once it is disclosed, and the access log says which office let them. Two granting bases are added to the closed list the table's CHECK
-- holds: SECRETARIAT_OFFICE and INTERNAL_AUDIT_OFFICE. The list stays the code's (SULIT_GRANT_BASES in src/lib/auth/sulit-access.ts), and a source test holds this file to it.
-- The CHECK is rebuilt wider, so no existing row can break it and no pre-check is needed. The table is append-only (rows are never updated), and a constraint is not a row.
-- Written, as the first, so that an unknown value refuses rather than passes (IS TRUE).
--
-- To reverse (run as the owner, after deleting any row that carries a new basis, then delete this migration's row from _prisma_migrations), two statements:
--   ALTER TABLE "SulitAccessEvent" DROP CONSTRAINT "SulitAccessEvent_basis_matches_outcome"
--   then add the constraint back as migration 20261008110100 wrote it.

ALTER TABLE "SulitAccessEvent" DROP CONSTRAINT "SulitAccessEvent_basis_matches_outcome";

ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_basis_matches_outcome" CHECK ((("outcome" = 'GRANTED' AND "basis" IN ('NAMED_ON_RECORD', 'ORGANISATION_PERMISSION', 'IN_CUSTODY', 'SECRETARIAT_OFFICE', 'INTERNAL_AUDIT_OFFICE')) OR ("outcome" = 'WITHHELD' AND "basis" IN ('ADMINISTRATOR', 'NOT_A_PERSON', 'RESTRICTED_NOT_NAMED', 'NOT_NAMED_PERMISSION_UNDECIDED', 'NOT_NAMED_PERMISSION_WITHHELD', 'NOT_NAMED_PERMISSION_SCOPED', 'NOT_NAMED_PERMISSION_NOT_HELD', 'FIELD_NOT_FOR_THIS_RECORD', 'SEALED', 'CUSTODY_NOT_SET', 'NOT_IN_CUSTODY', 'CUSTODY_DAY_UNKNOWN'))) IS TRUE);
