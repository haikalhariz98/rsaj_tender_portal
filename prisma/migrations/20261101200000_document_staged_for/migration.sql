-- AlterTable
-- What a file was uploaded for where that decides what it may later be used as (a template file for a tender document part, review S7).
ALTER TABLE "Document" ADD COLUMN     "stagedFor" TEXT;
