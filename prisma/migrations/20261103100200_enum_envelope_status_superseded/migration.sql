-- Wave 3b (SR-13, ADR 0036 D7): an online envelope whose submission was replaced before the closing. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "EnvelopeStatus" ADD VALUE 'SUPERSEDED';
