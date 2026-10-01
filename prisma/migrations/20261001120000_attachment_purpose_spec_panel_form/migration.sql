-- 6.2 Q-1 and X-6: the new attachment purpose arrives in its own migration, before any
-- constraint or row uses it (Postgres refuses a new enum value in the transaction that adds it).
ALTER TYPE "AttachmentPurpose" ADD VALUE 'SPEC_PANEL_FORM' AFTER 'SIGNED_MINUTES';
