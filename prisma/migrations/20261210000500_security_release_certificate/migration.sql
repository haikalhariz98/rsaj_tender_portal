-- Code review of close-out stage B (Consider item): a security returned at making good names the certificate that authorised it (ruling 16),
-- so a MAKING_GOOD return without one is refused by the database as well as by the act. Pre-checked: no stored row breaks it.

-- by hand: CHECK
ALTER TABLE "SecurityRelease" ADD CONSTRAINT "SecurityRelease_making_good_certificate" CHECK ("trigger" <> 'MAKING_GOOD' OR "certificateId" IS NOT NULL);
