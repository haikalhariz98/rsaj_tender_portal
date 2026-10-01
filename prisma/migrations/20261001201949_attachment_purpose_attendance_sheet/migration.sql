-- 6.5 and X-6: a briefing's or site visit's signed attendance sheet arrives in its own migration, before the owner column and the
-- rebuilt owner CHECKs that use it. Placed after PUBLICATION_PROOF, as the schema and the document store's
-- purpose list order it.
ALTER TYPE "AttachmentPurpose" ADD VALUE 'ATTENDANCE_SHEET' AFTER 'PUBLICATION_PROOF';
