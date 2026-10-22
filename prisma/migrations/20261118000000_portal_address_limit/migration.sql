-- RSEC-1 (security audit H2): the per-address limit on the public registration, set per organisation through the two-person path. Unset: the register stays closed.
-- AlterTable
ALTER TABLE "SupplierPolicy" ADD COLUMN     "portalAddressAttempts" INTEGER,
ADD COLUMN     "portalAddressMinutes" INTEGER,
ADD COLUMN     "portalAddressProvenance" "Provenance";
