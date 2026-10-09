-- AlterTable
-- Decisions log 2026-10-09, ruling on 1928(3): whether a supplier's contact may sign for the contractor's company from the portal. Nullable with no default: not decided refuses, and an officer sets it.
ALTER TABLE "SupplierContact" ADD COLUMN     "authorisedToSignForContractor" BOOLEAN;
