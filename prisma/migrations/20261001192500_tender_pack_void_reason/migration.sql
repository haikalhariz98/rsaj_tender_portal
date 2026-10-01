-- A pack that was voided says why: the cancel act and a name refusal that ends the exercise
-- both give a reason, and the rule is held here as well as in the acts. No pack was voided
-- without one, so nothing needs backfilling.
ALTER TABLE "TenderPack" ADD CONSTRAINT "TenderPack_void_reason"
  CHECK ("status" <> 'VOID' OR btrim("voidReason") <> '');
