-- Phase 2a (ADR 0034 D12): how an act is attributed. One enum, one migration.

-- CreateEnum
CREATE TYPE "ActMode" AS ENUM ('SIGNED', 'RECORDED_ON_BEHALF');
