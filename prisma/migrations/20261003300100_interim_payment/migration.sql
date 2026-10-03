-- CreateEnum
CREATE TYPE "ValuationTrigger" AS ENUM ('VALUATION_DATE', 'CLAIM');

-- CreateEnum
CREATE TYPE "ContractorAnswer" AS ENUM ('AGREED', 'DISSENT');

-- CreateEnum
CREATE TYPE "ValuationStatus" AS ENUM ('OPEN', 'RAISED', 'HELD', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "KeyedDeductionKind" AS ENUM ('PREMIUMS_PERKESO', 'WAGES', 'NON_COMPLIANCE', 'OTHER', 'LAD_ROUNDING');

-- CreateEnum
CREATE TYPE "RetentionReleaseKind" AS ENUM ('RELEASED_FIRST', 'RELEASED_BALANCE');

-- CreateEnum
CREATE TYPE "AdvanceParty" AS ENUM ('MAIN', 'NSC');

-- CreateEnum
CREATE TYPE "PaymentRouteFigure" AS ENUM ('RECOMMENDED', 'GROSS_THIS_PERIOD');

-- CreateEnum
CREATE TYPE "WaterfallRemainder" AS ENUM ('LARGEST_REMAINDER', 'FIRST_PARTY');

-- CreateEnum
CREATE TYPE "NonCompletionOutcome" AS ENUM ('LAD_APPLIES', 'EXCUSED_OR_PENDING');

-- CreateEnum
CREATE TYPE "NonCompletionScope" AS ENUM ('WHOLE', 'SECTION');

-- CreateEnum
CREATE TYPE "ContractClock" AS ENUM ('ORAL_CONFIRM', 'ORAL_OBJECTION', 'DAYWORK_SUBSTANTIATION', 'LAD_WARNING_RESPONSE', 'CERT_ISSUE');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "submittedByPersonId" TEXT;

-- AlterTable
ALTER TABLE "PendingDeduction" ADD COLUMN     "valuationId" TEXT;

-- AlterTable
ALTER TABLE "PostAwardPolicy" ADD COLUMN     "firstReleasePct" DECIMAL(9,4),
ADD COLUMN     "firstReleaseProvenance" "Provenance",
ADD COLUMN     "paymentRouteFigure" "PaymentRouteFigure",
ADD COLUMN     "paymentRouteProvenance" "Provenance",
ADD COLUMN     "preExecutionInterimLimit" INTEGER,
ADD COLUMN     "preExecutionProvenance" "Provenance",
ADD COLUMN     "unfixedMaterialsDefaultPct" DECIMAL(9,4),
ADD COLUMN     "unfixedMaterialsProvenance" "Provenance",
ADD COLUMN     "waterfallProvenance" "Provenance",
ADD COLUMN     "waterfallRemainder" "WaterfallRemainder";

-- CreateTable
CREATE TABLE "CertificateKindSetting" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" "CertificateKind" NOT NULL,
    "templateId" TEXT,
    "routingTypeId" TEXT,
    "provenance" "Provenance" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CertificateKindSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractClockRule" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clock" "ContractClock" NOT NULL,
    "length" INTEGER NOT NULL,
    "unit" "PeriodUnit" NOT NULL,
    "provenance" "Provenance" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ContractClockRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCalendar" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "agreedOn" TIMESTAMP(3) NOT NULL,
    "agreedWith" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterimValuation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "trigger" "ValuationTrigger" NOT NULL,
    "triggerDate" TIMESTAMP(3),
    "valuationDate" TIMESTAMP(3) NOT NULL,
    "status" "ValuationStatus" NOT NULL DEFAULT 'OPEN',
    "mainWorks" DECIMAL(18,2),
    "mainWorksNote" TEXT NOT NULL DEFAULT '',
    "jointOn" TIMESTAMP(3),
    "participants" TEXT[],
    "method" TEXT NOT NULL DEFAULT '',
    "contractorAnswer" "ContractorAnswer",
    "dissent" TEXT NOT NULL DEFAULT '',
    "personId" TEXT NOT NULL,
    "certificateId" TEXT,
    "judgedUnder" JSONB,
    "closeReason" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterimValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialLine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "valuationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "protectedOnSite" BOOLEAN,
    "notTooEarly" BOOLEAN,
    "formsPartOfWorks" BOOLEAN,
    "temporary" BOOLEAN NOT NULL,
    "submittedOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyLine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "valuationId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "value" DECIMAL(18,2),
    "due" DECIMAL(18,2) NOT NULL,
    "submittedOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartyLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationDeduction" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "valuationId" TEXT NOT NULL,
    "kind" "KeyedDeductionKind" NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValuationDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRelease" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "RetentionReleaseKind" NOT NULL,
    "main" DECIMAL(18,2) NOT NULL,
    "nsc" DECIMAL(18,2) NOT NULL,
    "ns" DECIMAL(18,2) NOT NULL,
    "heldMain" DECIMAL(18,2) NOT NULL,
    "heldNsc" DECIMAL(18,2) NOT NULL,
    "heldNs" DECIMAL(18,2) NOT NULL,
    "pct" DECIMAL(9,4),
    "pctProvenance" "Provenance",
    "basisCertificateId" TEXT NOT NULL,
    "handoverId" TEXT,
    "releasedOn" TIMESTAMP(3) NOT NULL,
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvancePayment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "party" "AdvanceParty" NOT NULL,
    "partyId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "securityId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "appliedOn" TIMESTAMP(3) NOT NULL,
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "judgedUnder" JSONB NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvancePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvanceRecoupmentRow" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "AdvanceRecoupmentRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePayment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LadWarning" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "eotClause" TEXT NOT NULL,
    "ladClause" TEXT NOT NULL,
    "extendedCompletion" TIMESTAMP(3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "responseClock" JSONB,
    "consignmentRef" TEXT NOT NULL DEFAULT '',
    "postedOn" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LadWarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonCompletion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "outcome" "NonCompletionOutcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" "NonCompletionScope",
    "sectionRef" TEXT,
    "certificateId" TEXT,
    "warningId" TEXT,
    "eotClause" TEXT NOT NULL DEFAULT '',
    "ladClause" TEXT NOT NULL DEFAULT '',
    "dateForCompletion" TIMESTAMP(3) NOT NULL,
    "rate" DECIMAL(18,2),
    "insuranceExpiry" TIMESTAMP(3),
    "expectedCompletion" TIMESTAMP(3),
    "windowFrom" TIMESTAMP(3),
    "windowUntil" TIMESTAMP(3),
    "windowClosedAt" TIMESTAMP(3),
    "pack" JSONB NOT NULL,
    "decidedOn" TIMESTAMP(3) NOT NULL,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CertificateKindSetting_organisationId_kind_key" ON "CertificateKindSetting"("organisationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ContractClockRule_organisationId_clock_key" ON "ContractClockRule"("organisationId", "clock");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCalendar_contractId_key" ON "PaymentCalendar"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "InterimValuation_certificateId_key" ON "InterimValuation"("certificateId");

-- CreateIndex
CREATE INDEX "InterimValuation_contractId_idx" ON "InterimValuation"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyLine_valuationId_partyId_key" ON "PartyLine"("valuationId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionRelease_contractId_kind_key" ON "RetentionRelease"("contractId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AdvancePayment_certificateId_key" ON "AdvancePayment"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvanceRecoupmentRow_advanceId_sequence_key" ON "AdvanceRecoupmentRow"("advanceId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePayment_certificateId_key" ON "FinancePayment"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "LadWarning_certificateId_key" ON "LadWarning"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "NonCompletion_certificateId_key" ON "NonCompletion"("certificateId");

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_submittedByPersonId_fkey" FOREIGN KEY ("submittedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDeduction" ADD CONSTRAINT "PendingDeduction_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "InterimValuation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateKindSetting" ADD CONSTRAINT "CertificateKindSetting_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateKindSetting" ADD CONSTRAINT "CertificateKindSetting_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateKindSetting" ADD CONSTRAINT "CertificateKindSetting_routingTypeId_fkey" FOREIGN KEY ("routingTypeId") REFERENCES "RoutingSheetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClockRule" ADD CONSTRAINT "ContractClockRule_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCalendar" ADD CONSTRAINT "PaymentCalendar_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCalendar" ADD CONSTRAINT "PaymentCalendar_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCalendar" ADD CONSTRAINT "PaymentCalendar_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterimValuation" ADD CONSTRAINT "InterimValuation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterimValuation" ADD CONSTRAINT "InterimValuation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterimValuation" ADD CONSTRAINT "InterimValuation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterimValuation" ADD CONSTRAINT "InterimValuation_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLine" ADD CONSTRAINT "MaterialLine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLine" ADD CONSTRAINT "MaterialLine_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "InterimValuation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyLine" ADD CONSTRAINT "PartyLine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyLine" ADD CONSTRAINT "PartyLine_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "InterimValuation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyLine" ADD CONSTRAINT "PartyLine_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ContractParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationDeduction" ADD CONSTRAINT "ValuationDeduction_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationDeduction" ADD CONSTRAINT "ValuationDeduction_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "InterimValuation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "RetentionRelease_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "RetentionRelease_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "RetentionRelease_basisCertificateId_fkey" FOREIGN KEY ("basisCertificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "RetentionRelease_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "SiteRecordsHandover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "RetentionRelease_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancePayment" ADD CONSTRAINT "AdvancePayment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancePayment" ADD CONSTRAINT "AdvancePayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancePayment" ADD CONSTRAINT "AdvancePayment_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ContractParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancePayment" ADD CONSTRAINT "AdvancePayment_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "SecurityInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancePayment" ADD CONSTRAINT "AdvancePayment_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancePayment" ADD CONSTRAINT "AdvancePayment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceRecoupmentRow" ADD CONSTRAINT "AdvanceRecoupmentRow_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceRecoupmentRow" ADD CONSTRAINT "AdvanceRecoupmentRow_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "AdvancePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadWarning" ADD CONSTRAINT "LadWarning_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadWarning" ADD CONSTRAINT "LadWarning_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadWarning" ADD CONSTRAINT "LadWarning_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadWarning" ADD CONSTRAINT "LadWarning_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_warningId_fkey" FOREIGN KEY ("warningId") REFERENCES "LadWarning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6.13 Part A step 3: CHECKs by hand (Prisma does not model them). Money never negative where it is an amount, percentages within (0, 100], a valuation's close and its certificate whole, a release once each per contract
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_materials_pct" CHECK ("unfixedMaterialsDefaultPct" IS NULL OR ("unfixedMaterialsDefaultPct" > 0 AND "unfixedMaterialsDefaultPct" <= 100));
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_first_release_pct" CHECK ("firstReleasePct" IS NULL OR ("firstReleasePct" > 0 AND "firstReleasePct" <= 100));
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_pre_execution_limit" CHECK ("preExecutionInterimLimit" IS NULL OR "preExecutionInterimLimit" >= 0);
ALTER TABLE "ContractClockRule" ADD CONSTRAINT "ContractClockRule_length" CHECK ("length" > 0);
ALTER TABLE "PaymentCalendar" ADD CONSTRAINT "PaymentCalendar_day" CHECK ("dayOfMonth" BETWEEN 1 AND 31 AND length(trim("agreedWith")) > 0);
ALTER TABLE "InterimValuation" ADD CONSTRAINT "InterimValuation_main_works" CHECK ("mainWorks" IS NULL OR "mainWorks" >= 0);
ALTER TABLE "InterimValuation" ADD CONSTRAINT "InterimValuation_claim_day" CHECK ("trigger" <> 'CLAIM' OR "triggerDate" IS NOT NULL);
ALTER TABLE "InterimValuation" ADD CONSTRAINT "InterimValuation_raised_whole" CHECK (("status" = 'RAISED') = ("certificateId" IS NOT NULL AND "judgedUnder" IS NOT NULL));
ALTER TABLE "InterimValuation" ADD CONSTRAINT "InterimValuation_closed_whole" CHECK (("status" IN ('HELD', 'WITHDRAWN')) = ("closedAt" IS NOT NULL) AND ("closedAt" IS NULL OR length(trim("closeReason")) > 0));
ALTER TABLE "InterimValuation" ADD CONSTRAINT "InterimValuation_dissent" CHECK ("contractorAnswer" IS DISTINCT FROM 'DISSENT' OR length(trim("dissent")) > 0);
ALTER TABLE "MaterialLine" ADD CONSTRAINT "MaterialLine_value" CHECK ("value" >= 0);
ALTER TABLE "PartyLine" ADD CONSTRAINT "PartyLine_amounts" CHECK (("value" IS NULL OR "value" >= 0) AND "due" >= 0);
ALTER TABLE "ValuationDeduction" ADD CONSTRAINT "ValuationDeduction_amount" CHECK ("kind" = 'LAD_ROUNDING' OR "amount" >= 0);
ALTER TABLE "ValuationDeduction" ADD CONSTRAINT "ValuationDeduction_other_label" CHECK ("kind" <> 'OTHER' OR length(trim("label")) > 0);
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "RetentionRelease_amounts" CHECK ("main" >= 0 AND "nsc" >= 0 AND "ns" >= 0 AND "main" <= "heldMain" AND "nsc" <= "heldNsc" AND "ns" <= "heldNs");
ALTER TABLE "AdvancePayment" ADD CONSTRAINT "AdvancePayment_amount" CHECK ("amount" > 0 AND ("party" <> 'NSC' OR "partyId" IS NOT NULL));
ALTER TABLE "AdvanceRecoupmentRow" ADD CONSTRAINT "AdvanceRecoupmentRow_row" CHECK ("sequence" >= 1 AND "amount" > 0);
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_batch" CHECK (length(trim("batchNo")) > 0 AND "amount" >= 0);
ALTER TABLE "LadWarning" ADD CONSTRAINT "LadWarning_rate" CHECK ("rate" > 0 AND (("postedOn" IS NULL) = (length(trim("consignmentRef")) = 0)));
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_whole" CHECK (length(trim("reason")) > 0 AND ("outcome" <> 'LAD_APPLIES' OR ("certificateId" IS NOT NULL AND "scope" IS NOT NULL AND "rate" IS NOT NULL AND "insuranceExpiry" IS NOT NULL AND "windowFrom" IS NOT NULL)) AND ("scope" IS DISTINCT FROM 'SECTION' OR "sectionRef" IS NOT NULL));
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_window" CHECK ("windowUntil" IS NULL OR ("windowFrom" IS NOT NULL AND "windowUntil" > "windowFrom"));
