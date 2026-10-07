-- Phase 3a (ADR 0034 D14): whether a SULIT value was shown or withheld, on the access log. A new enum has its own migration, as the Phase 2a ones did.

-- CreateEnum
CREATE TYPE "SulitOutcome" AS ENUM ('GRANTED', 'WITHHELD');
