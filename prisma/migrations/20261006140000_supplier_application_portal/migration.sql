-- A public application has no officer behind it: the channel names the portal, and the recorder is optional.
-- AlterEnum
ALTER TYPE "ApplicationChannel" ADD VALUE 'PORTAL';

-- AlterTable
ALTER TABLE "SupplierApplication" ALTER COLUMN "recordedByPersonId" DROP NOT NULL;
