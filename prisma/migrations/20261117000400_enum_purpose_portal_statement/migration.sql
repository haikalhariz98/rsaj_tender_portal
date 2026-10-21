-- ADR 0041 D2: the bank statement held with an online application's bank details, SULIT from receipt. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "AttachmentPurpose" ADD VALUE 'PORTAL_APPLICATION_BANK_STATEMENT';
