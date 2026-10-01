-- 6.4 and X-6: the tender pack part's purpose arrives in its own migration, before the owner
-- column and the rebuilt owner CHECKs that use it. Placed after BQ_IMPORT_SOURCE, as the
-- schema and the document store's purpose list order it.
ALTER TYPE "AttachmentPurpose" ADD VALUE 'TENDER_PART' AFTER 'BQ_IMPORT_SOURCE';
