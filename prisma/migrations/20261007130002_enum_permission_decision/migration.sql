-- Phase 2a (ADR 0034 D8): a role's decision on a product permission. No row is undecided, so there is no UNDECIDED value.

-- CreateEnum
CREATE TYPE "PermissionDecision" AS ENUM ('GRANTED', 'WITHHELD');
