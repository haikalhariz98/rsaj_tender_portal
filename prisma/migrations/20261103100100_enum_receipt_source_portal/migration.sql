-- Wave 3b (SR-13, ADR 0036 D5, H2): a receipt stamped by the database clock at the supplier's submission. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "ReceiptSource" ADD VALUE 'PORTAL';
