-- Workspace 3a (plan workspace-3a-build-plan.md section 3.1): a file of a work item. Each new enum value is its own migration (BD-613-112), before the migration that names it.

ALTER TYPE "AttachmentPurpose" ADD VALUE 'WORK_ITEM_FILE';
