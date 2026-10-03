-- 6.14 increment 2: printed-form fidelity (the form's page count and its printed fields with their label pairs), typing corrections (FR-CRT-010) and terms with their aliases (FR-CRT-011). Additive: one nullable column on DocumentTemplate, and new tables that ship empty. No pre-check: the column is new (every row null) and every unique index is on a new, empty table.
-- AlterTable
ALTER TABLE "DocumentTemplate" ADD COLUMN     "pageCount" INTEGER;

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "bound" BOOLEAN NOT NULL,
    "computedKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextCorrection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fromText" TEXT NOT NULL,
    "toText" TEXT NOT NULL,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TextCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextCorrectionForm" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "correctionId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "TextCorrectionForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "canonicalEn" TEXT,
    "canonicalMs" TEXT,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermAlias" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "TermAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormField_templateId_key_key" ON "FormField"("templateId", "key");

-- CreateIndex
CREATE INDEX "TextCorrection_organisationId_idx" ON "TextCorrection"("organisationId");

-- CreateIndex
CREATE INDEX "TextCorrectionForm_templateId_idx" ON "TextCorrectionForm"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TextCorrectionForm_correctionId_templateId_key" ON "TextCorrectionForm"("correctionId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Term_organisationId_code_key" ON "Term"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TermAlias_termId_alias_key" ON "TermAlias"("termId", "alias");

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextCorrection" ADD CONSTRAINT "TextCorrection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextCorrectionForm" ADD CONSTRAINT "TextCorrectionForm_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextCorrectionForm" ADD CONSTRAINT "TextCorrectionForm_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "TextCorrection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextCorrectionForm" ADD CONSTRAINT "TextCorrectionForm_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermAlias" ADD CONSTRAINT "TermAlias_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermAlias" ADD CONSTRAINT "TermAlias_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- FR-CRT-001: a page count is a whole number of pages from 1 (null: not recorded).
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_page_count"
  CHECK ("pageCount" IS NULL OR ("pageCount" >= 1 AND "pageCount" <= 999));

-- FR-CRT-002: a printed field is bound exactly when it names the value it prints, and has a label.
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_binding"
  CHECK ("bound" = ("computedKey" IS NOT NULL) AND btrim("labelEn") <> '' AND "sortOrder" >= 0);

-- FR-CRT-010: a correction changes some words into other words.
ALTER TABLE "TextCorrection" ADD CONSTRAINT "TextCorrection_words"
  CHECK (btrim("fromText") <> '' AND btrim("toText") <> '' AND "fromText" <> "toText");

-- FR-CRT-011: a term has a wording in at least one language, and an alias is not blank.
ALTER TABLE "Term" ADD CONSTRAINT "Term_wording"
  CHECK (coalesce(btrim("canonicalEn"), '') <> '' OR coalesce(btrim("canonicalMs"), '') <> '');

ALTER TABLE "TermAlias" ADD CONSTRAINT "TermAlias_not_blank"
  CHECK (btrim("alias") <> '');
