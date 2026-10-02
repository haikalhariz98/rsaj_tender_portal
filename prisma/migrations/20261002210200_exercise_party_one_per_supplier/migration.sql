-- 6.15a fix R-12: one register supplier is one party on an exercise. Unlinked parties (null) are never compared.
-- The link act refuses a second party first, naming the one that holds the supplier. This index is the backstop.
-- CreateIndex
CREATE UNIQUE INDEX "ExerciseParty_exerciseId_vendorId_key" ON "ExerciseParty"("exerciseId", "vendorId");
