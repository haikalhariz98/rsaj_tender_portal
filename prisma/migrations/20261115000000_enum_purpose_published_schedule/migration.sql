-- Go-live R4 (founder 2026-10-20): the purpose of the schedule of tenders the procurement office publishes on Results, kept on the exercise. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "AttachmentPurpose" ADD VALUE 'PUBLISHED_SCHEDULE';
