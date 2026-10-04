-- 6.13 Part B Run 0 fix round (M-1, BD-613-108 and BD-613-109): a registration cancelled names the registration it
-- cancels (the supplier's registeredOn when it was recorded). A new registration moves registeredOn on and ends the
-- cancellation (the standing rule), so a later cancellation cancels the new registration: the next migration allows
-- one live cancellation per registration.

-- Pre-check: every REGISTRATION_CANCELLED row's supplier has a registration day to backfill from (the product records
-- one only for a registered supplier, and every registered supplier has its day).
SELECT CAST((SELECT 'Pre-check failed: a StandingEvent of kind REGISTRATION_CANCELLED belongs to a supplier with no registeredOn, so the registration it cancels cannot be named. Record the supplier''s registration day first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "StandingEvent" e JOIN "Supplier" s ON s."id" = e."supplierId" WHERE e."kind" = 'REGISTRATION_CANCELLED' AND s."registeredOn" IS NULL)) AS INTEGER);

-- AlterTable
ALTER TABLE "StandingEvent" ADD COLUMN     "cancelsRegistrationOn" TIMESTAMP(3);

-- Backfill: each cancellation recorded so far cancelled the registration the supplier has now (none has been ended yet).
UPDATE "StandingEvent" e SET "cancelsRegistrationOn" = s."registeredOn" FROM "Supplier" s WHERE s."id" = e."supplierId" AND e."kind" = 'REGISTRATION_CANCELLED';

-- A registration cancelled names the registration it cancels, and only it does.
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_cancels_registration"
  CHECK (("kind" = 'REGISTRATION_CANCELLED') = ("cancelsRegistrationOn" IS NOT NULL));
