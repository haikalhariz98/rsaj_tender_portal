-- Phase 2a (ADR 0034 D15): what a two-person configuration change changes. Phase 5 adds kinds, each in its own migration.

-- CreateEnum
CREATE TYPE "ConfigurationChangeKind" AS ENUM ('SECURITY_POLICY', 'PERMISSION_GRANT', 'ADMINISTRATOR_GRANT', 'ADMINISTRATOR_REVOKE', 'ACCOUNT_CODE');
