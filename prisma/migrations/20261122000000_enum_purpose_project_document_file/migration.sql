-- ADR 0042 D1 (PW-31): a file of a Project workspace document's version. Each new enum value is its own migration (BD-613-112), before the migration that names it.

ALTER TYPE "AttachmentPurpose" ADD VALUE 'PROJECT_DOCUMENT_FILE';
