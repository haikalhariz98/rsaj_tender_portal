-- 6.2 Q-3 and X-6: the imported bill's purpose arrives in its own migration, before the
-- owner column and the rebuilt owner CHECKs that use it. Placed after SPEC_PANEL_FORM, as the
-- schema and the document store's purpose list order it.
ALTER TYPE "AttachmentPurpose" ADD VALUE 'BQ_IMPORT_SOURCE' AFTER 'SPEC_PANEL_FORM';
