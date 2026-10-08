-- Phase 4b: a supplier may take a certificate off its registration draft. The row is kept, marked removed (its files were attached to it and nothing is deleted).
-- Additive. Every existing row reads as not removed.

-- AlterTable
ALTER TABLE "RegistrationDraftDocument" ADD COLUMN     "removedAt" TIMESTAMP(3);
