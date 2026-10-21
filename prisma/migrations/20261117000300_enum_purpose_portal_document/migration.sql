-- ADR 0041 D2: a certificate held on an online application. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "AttachmentPurpose" ADD VALUE 'PORTAL_APPLICATION_DOCUMENT';
