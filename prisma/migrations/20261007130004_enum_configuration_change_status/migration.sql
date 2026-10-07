-- Phase 2a (ADR 0034 D15): where a two-person configuration change stands.

-- CreateEnum
CREATE TYPE "ConfigurationChangeStatus" AS ENUM ('PROPOSED', 'APPLIED', 'DECLINED', 'WITHDRAWN', 'STALE');
