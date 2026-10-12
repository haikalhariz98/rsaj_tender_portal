-- Sourcing Requirements v2, wave 3a: SR-10 (rulings 16 and 17, G1, G2).
--
-- How the tender documents are sold (at the counter, or online through the supplier portal) is the customer's policy
-- (WindowPolicy.documentSaleMode, two-person path, ships unset) and is pinned on each exercise when it is created (G1). The exercise's column is
-- nullable with no default, so an exercise made while the setting is unset pins "not set", and publication refuses in words until the officer takes
-- the organisation's setting. Every exercise that exists now is backfilled to its present behaviour, COUNTER, so nothing in flight changes its gates.
--
-- The payment simulator (the founder's amendment of ruling 17, 2026-10-09) has its own nullable switch and the list of methods it offers, both on
-- the window policy and so on the two-person path. Neither ships set.

-- CreateEnum
CREATE TYPE "SaleMode" AS ENUM ('COUNTER', 'ONLINE');

-- AlterTable
ALTER TABLE "SourcingExercise" ADD COLUMN     "saleMode" "SaleMode";

-- Backfill (G1): an exercise that exists keeps its present behaviour.
UPDATE "SourcingExercise" SET "saleMode" = 'COUNTER';

-- AlterTable
ALTER TABLE "WindowPolicy" ADD COLUMN     "documentSaleMode" "SaleMode",
ADD COLUMN     "paymentSimulatorOn" BOOLEAN,
ADD COLUMN     "simulatedPaymentMethods" TEXT[] DEFAULT ARRAY[]::TEXT[];
