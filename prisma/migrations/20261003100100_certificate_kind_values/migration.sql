-- 6.14 increment 1 (ADR 0022): the certificate kinds 6.13 Part A raises, created alone before any table uses them (X-6)
CREATE TYPE "CertificateKind" AS ENUM ('DELEGATION_LETTER', 'DELEGATION_NOTICE', 'INTERIM_PAYMENT', 'ADVANCE_PAYMENT', 'LAD_WARNING', 'NON_COMPLETION', 'VARIATION_APPLICATION', 'SO_INSTRUCTION', 'VARIATION', 'SUM_ADJUSTMENT');
