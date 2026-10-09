-- Phase 5 (ADR 0034 D15): a kind of two-person change. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "ConfigurationChangeKind" ADD VALUE 'CLASSIFICATION_DOWNGRADE';
