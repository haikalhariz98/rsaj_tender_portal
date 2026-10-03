-- BD-613-47: the signed rounding on the damages line is less than RM1.00 either way.
-- Pre-check, before the CHECK below: fails with the message as the error if any damages rounding row is RM1.00 or more either way. Nothing is changed then.
SELECT CAST((SELECT 'Pre-check failed: a damages rounding row is RM1.00 or more either way, so ValuationDeduction_lad_rounding_range cannot be added. Correct it first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "ValuationDeduction" WHERE "kind" = 'LAD_ROUNDING' AND ("amount" <= -1 OR "amount" >= 1))) AS INTEGER);

ALTER TABLE "ValuationDeduction" ADD CONSTRAINT "ValuationDeduction_lad_rounding_range" CHECK ("kind" <> 'LAD_ROUNDING' OR ("amount" > -1 AND "amount" < 1));
