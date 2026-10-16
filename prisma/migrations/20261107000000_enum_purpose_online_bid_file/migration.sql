-- Wave 3b step 15 (SR-13, ADR 0036 D10): the purpose of an online bid file once the mover has filed it. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "AttachmentPurpose" ADD VALUE 'ONLINE_BID_FILE';
