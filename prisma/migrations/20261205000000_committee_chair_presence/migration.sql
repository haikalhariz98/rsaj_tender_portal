-- CreateEnum
CREATE TYPE "ChairPresence" AS ENUM ('CHAIR_REQUIRED', 'CHAIR_OR_APPOINTED');

-- AlterTable
ALTER TABLE "Committee" ADD COLUMN     "chairPresence" "ChairPresence",
ADD COLUMN     "chairPresenceProvenance" "Provenance";

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "chairAppointment" TEXT NOT NULL DEFAULT '';

