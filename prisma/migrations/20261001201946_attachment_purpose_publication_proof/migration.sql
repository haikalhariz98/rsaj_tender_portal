-- 6.5 and X-6: the proof of an advertisement's publication arrives in its own migration, before the owner column and the
-- rebuilt owner CHECKs that use it. Placed after COORDINATION_SCOPE, as the schema and the document store's
-- purpose list order it.
ALTER TYPE "AttachmentPurpose" ADD VALUE 'PUBLICATION_PROOF' AFTER 'COORDINATION_SCOPE';
