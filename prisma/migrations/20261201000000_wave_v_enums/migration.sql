-- ADR 0045 (wave V plan step V1, migration A of two): the new enum values and the new enum, alone. A value added by ALTER TYPE cannot be used in the
-- transaction that adds it, so the CHECKs and triggers that name them are in the next folder (20261201000100_wave_v_tables). Additive only.
-- No down for the three values: Postgres cannot drop an enum value. The down of this folder is DROP TYPE "PaymentRoute" alone.

-- ADR 0045 D5: how a contract type is paid.
CREATE TYPE "PaymentRoute" AS ENUM ('CERTIFIED_CLAIM', 'DELIVERY_ORDER_INVOICE');

-- ADR 0045 D6 (WV-11): a supply claim's delivery order and invoice, files of its version.
ALTER TYPE "AttachmentPurpose" ADD VALUE 'DELIVERY_ORDER';
ALTER TYPE "AttachmentPurpose" ADD VALUE 'SUPPLY_INVOICE';

-- ADR 0045 D6: the seventh kind, a supply contract's delivery order and invoice.
ALTER TYPE "ContractorSubmissionKind" ADD VALUE 'SUPPLY_CLAIM';
