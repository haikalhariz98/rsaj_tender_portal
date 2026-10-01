-- 6.5 and X-6: an addendum's signed copy arrives in its own migration, before the owner column and the
-- rebuilt owner CHECKs that use it. Placed after TENDER_PART, as the schema and the document store's
-- purpose list order it.
ALTER TYPE "AttachmentPurpose" ADD VALUE 'ADDENDUM_SIGNED' AFTER 'TENDER_PART';
