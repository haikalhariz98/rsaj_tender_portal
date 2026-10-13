-- Wave 3b (SR-13, ADR 0036 D5, D12): an envelope submitted through the supplier portal. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "EnvelopeChannel" ADD VALUE 'ONLINE';
