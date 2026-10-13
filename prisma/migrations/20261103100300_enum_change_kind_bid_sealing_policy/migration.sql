-- Wave 3b (SR-13, ADR 0036 D1): a two-person change of the bid sealing policy. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "ConfigurationChangeKind" ADD VALUE 'BID_SEALING_POLICY';
