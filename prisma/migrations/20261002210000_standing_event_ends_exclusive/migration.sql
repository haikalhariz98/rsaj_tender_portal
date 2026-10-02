-- 6.15a fix S-1: a first-offence blacklisting's endsOn is exclusive, the day the supplier is free from, as every period in the project (budget periods, effective-dated rows).
-- Rows written before this fix held the last blacklisted day (inclusive): each moves to the day after, so every reading is unchanged.
UPDATE "StandingEvent" SET "endsOn" = "endsOn" + INTERVAL '1 day' WHERE "endsOn" IS NOT NULL;

-- An exclusive end is after the day it takes effect.
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_ends_after_start"
  CHECK ("endsOn" IS NULL OR "endsOn" > "effectiveOn");
