-- 6.13 Part B Run 0 fix round (consider, adapted to M-1 as BD-613-109): one live registration cancelled per registration.
-- A cancellation not withdrawn is unique for its supplier and the registration it cancels, so two records made at once
-- cannot both stand, while a supplier registered again (M-1) can have its new registration cancelled later.

-- Pre-check: no two live cancellations of one supplier name the same registration already.
SELECT CAST((SELECT 'Pre-check failed: two StandingEvent rows of kind REGISTRATION_CANCELLED, not withdrawn, cancel the same registration of one supplier. Withdraw the one recorded in error first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "StandingEvent" WHERE "kind" = 'REGISTRATION_CANCELLED' AND "withdrawnAt" IS NULL GROUP BY "supplierId", "cancelsRegistrationOn" HAVING count(*) > 1)) AS INTEGER);

-- CreateIndex (partial: Prisma does not model it, as the other partial unique indexes)
CREATE UNIQUE INDEX "StandingEvent_one_live_cancellation" ON "StandingEvent"("supplierId", "cancelsRegistrationOn") WHERE "kind" = 'REGISTRATION_CANCELLED' AND "withdrawnAt" IS NULL;
