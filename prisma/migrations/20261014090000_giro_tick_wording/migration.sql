-- AlterTable
-- The GIRO tick is made on step 4 and counts only for the wording it was made on. A draft ticked before this column existed holds no hash, so its tick is void and the supplier ticks again
-- (a tick that cannot say which wording it was made on cannot be trusted to be about the wording now in force).
ALTER TABLE "RegistrationDraft" ADD COLUMN     "giroTextSha256" CHAR(64);
