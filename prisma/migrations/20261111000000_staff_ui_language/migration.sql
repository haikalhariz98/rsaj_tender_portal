-- The language a staff member reads the screens in. Nullable: null means never chosen. No backfill.

CREATE TYPE "UiLanguage" AS ENUM ('EN', 'MS');

ALTER TABLE "StaffAccount" ADD COLUMN     "uiLanguage" "UiLanguage";
