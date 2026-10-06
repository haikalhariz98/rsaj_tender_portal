-- Product owner, 2026-10-06 (ruling 5b): an application with no recorder is allowed only on the PORTAL channel.
-- The one such row is DEMO/SUP/0008, a test record made by the superseded direct portal path, kept and rejected
-- rather than deleted. No code path writes a null recorder now (src/lib/suppliers/recorder-required.test.ts),
-- and this CHECK refuses one on every paper channel. recordedByPersonId stays nullable for that kept row.

-- Pre-check (the SELECT CAST pattern): no paper application lacks a recorder, so the CHECK holds for every row.
SELECT CAST((SELECT 'Pre-check failed: an application on a paper channel (counter, post or email) has no recorder, but every paper write names one. Find where it came from first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "SupplierApplication" WHERE "recordedByPersonId" IS NULL AND "channel" <> 'PORTAL')) AS INTEGER);

ALTER TABLE "SupplierApplication" ADD CONSTRAINT "SupplierApplication_recorder_portal_only"
  CHECK ("recordedByPersonId" IS NOT NULL OR "channel" = 'PORTAL');
