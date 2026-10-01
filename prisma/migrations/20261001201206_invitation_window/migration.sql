-- CreateEnum
CREATE TYPE "WindowPath" AS ENUM ('ADVERTISED', 'INVITED');

-- CreateEnum
CREATE TYPE "FeeCostKind" AS ENUM ('PAPER_A4', 'PAPER_A3', 'PAPER_A1', 'PAPER_A0', 'COPYING', 'BINDING', 'ADMIN', 'OTHER');

-- CreateEnum
CREATE TYPE "SiteEventKind" AS ENUM ('BRIEFING', 'SITE_VISIT');

-- CreateEnum
CREATE TYPE "CertSighted" AS ENUM ('ORIGINAL', 'CERTIFIED_COPY', 'NOT_SHOWN');

-- CreateEnum
CREATE TYPE "CheckState" AS ENUM ('NOT_CHECKED', 'CLEAR', 'FAILED');

-- CreateEnum
CREATE TYPE "PartySource" AS ENUM ('PROPOSED_INVITEE', 'ATTENDEE', 'PURCHASER');

-- CreateEnum
CREATE TYPE "AdvertisementDayRule" AS ENUM ('LATEST_REQUIRED_CHANNEL', 'NAMED_CHANNEL');

-- CreateEnum
CREATE TYPE "ClosingChangeKind" AS ENUM ('CORRECTION', 'EXTENSION');

-- CreateEnum
CREATE TYPE "AddendumStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

-- AlterTable
ALTER TABLE "SourcingExercise" ADD COLUMN     "replacesExerciseId" TEXT;

-- CreateTable
CREATE TABLE "WindowPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "minAdvertisementDays" INTEGER,
    "targetAdvertisementDays" INTEGER,
    "newspaperWarnDays" INTEGER,
    "purchaseCutoffDays" INTEGER,
    "dateRulesProvenance" "Provenance",
    "defaultClosingTime" TEXT,
    "closingTimeProvenance" "Provenance",
    "advertisementDayRule" "AdvertisementDayRule",
    "advertisementChannelId" TEXT,
    "dayRuleProvenance" "Provenance",
    "calendarId" TEXT,
    "mandatoryAttendancePermitted" BOOLEAN,
    "attendanceProvenance" "Provenance",
    "noticeTemplateId" TEXT,
    "invitationTemplateId" TEXT,
    "addendumTemplateId" TEXT,
    "dateRuleSource" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WindowPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationChannel" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "requiredWhenAdvertised" BOOLEAN,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "PublicationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFeeFloor" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "minimum" DECIMAL(18,2) NOT NULL,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DocumentFeeFloor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayCalendar" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekendDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "weekendProvenance" "Provenance",
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "HolidayCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayCalendarYear" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',

    CONSTRAINT "HolidayCalendarYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "gazetteRef" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseWindow" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "path" "WindowPath" NOT NULL,
    "closingTimeReason" TEXT NOT NULL DEFAULT '',
    "purchaseFromDay" TIMESTAMP(3),
    "purchaseCloseDay" TIMESTAMP(3),
    "inspectionPlace" TEXT NOT NULL DEFAULT '',
    "purchasePlace" TEXT NOT NULL DEFAULT '',
    "inspectionHours" TEXT NOT NULL DEFAULT '',
    "feeAmount" DECIMAL(18,2),
    "feePaymentMethods" TEXT NOT NULL DEFAULT '',
    "submissionPlace" TEXT NOT NULL DEFAULT '',
    "advertisementDay" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "policySnapshot" JSONB,
    "noticeText" TEXT,
    "noticeTemplateCode" TEXT,
    "noticeTemplateBodyVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WindowFeeLine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "kind" "FeeCostKind" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,3),
    "unitCost" DECIMAL(18,2),
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WindowFeeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosingChange" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "kind" "ClosingChangeKind" NOT NULL,
    "fromClosingAt" TIMESTAMP(3) NOT NULL,
    "toClosingAt" TIMESTAMP(3) NOT NULL,
    "fromPurchaseCloseDay" TIMESTAMP(3),
    "toPurchaseCloseDay" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "approvalInstanceId" TEXT,
    "requestedOn" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "refusedAt" TIMESTAMP(3),
    "refusedReason" TEXT NOT NULL DEFAULT '',
    "faultsSnapshot" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClosingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WindowCancellation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "feeRefund" BOOLEAN NOT NULL,
    "approvalInstanceId" TEXT,
    "requestedOn" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "refusedAt" TIMESTAMP(3),
    "refusedReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WindowCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationRecord" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "publishedOn" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "recordedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseParty" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "source" "PartySource" NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "fax" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NameRouteInvitee" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NameRouteInvitee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationLetter" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "nameRouteId" TEXT,
    "method" "DeliveryMethod",
    "consignmentRef" TEXT NOT NULL DEFAULT '',
    "despatchedOn" TIMESTAMP(3),
    "acknowledgedOn" TIMESTAMP(3),
    "templateId" TEXT,
    "templateCode" TEXT NOT NULL,
    "templateBodyVersion" INTEGER NOT NULL,
    "language" "DocumentLanguage" NOT NULL,
    "fields" JSONB NOT NULL,
    "renderedText" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvitationLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSale" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "soldOn" TIMESTAMP(3) NOT NULL,
    "collectedBy" TEXT NOT NULL,
    "authoritySighted" BOOLEAN NOT NULL,
    "restrictionCertSighted" "CertSighted",
    "restrictionCertValidUntil" TIMESTAMP(3),
    "registrationCheck" "CheckState" NOT NULL DEFAULT 'NOT_CHECKED',
    "suspensionCheck" "CheckState" NOT NULL DEFAULT 'NOT_CHECKED',
    "checkNote" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "financeReceiptNo" TEXT,
    "receiptRecordedOn" TIMESTAMP(3),
    "issuedByPersonId" TEXT NOT NULL,
    "annotation" JSONB NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "kind" "SiteEventKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "place" TEXT NOT NULL,
    "mandatory" BOOLEAN,
    "heldOn" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteEventAttendance" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "representative" TEXT NOT NULL,
    "recordedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEventAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Addendum" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "number" INTEGER,
    "title" TEXT NOT NULL,
    "whatChanged" TEXT NOT NULL,
    "status" "AddendumStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedOn" TIMESTAMP(3),
    "closingChangeId" TEXT,
    "renderedText" TEXT,
    "templateCode" TEXT,
    "templateBodyVersion" INTEGER,
    "frozenAt" TIMESTAMP(3),
    "voidReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Addendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddendumRecipient" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "addendumId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "withDocuments" BOOLEAN NOT NULL DEFAULT false,
    "method" "DeliveryMethod",
    "consignmentRef" TEXT NOT NULL DEFAULT '',
    "despatchedOn" TIMESTAMP(3),
    "acknowledgedOn" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AddendumRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WindowNotice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "closingChangeId" TEXT,
    "cancellationId" TEXT,
    "partyId" TEXT NOT NULL,
    "method" "DeliveryMethod",
    "consignmentRef" TEXT NOT NULL DEFAULT '',
    "despatchedOn" TIMESTAMP(3),
    "acknowledgedOn" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "WindowNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WindowPolicy_organisationId_key" ON "WindowPolicy"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationChannel_organisationId_code_key" ON "PublicationChannel"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFeeFloor_organisationId_regime_key" ON "DocumentFeeFloor"("organisationId", "regime");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayCalendar_organisationId_code_key" ON "HolidayCalendar"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayCalendarYear_calendarId_year_key" ON "HolidayCalendarYear"("calendarId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_calendarId_day_key" ON "PublicHoliday"("calendarId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseWindow_exerciseId_key" ON "ExerciseWindow"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "ClosingChange_approvalInstanceId_key" ON "ClosingChange"("approvalInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "WindowCancellation_approvalInstanceId_key" ON "WindowCancellation"("approvalInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationRecord_windowId_channelId_key" ON "PublicationRecord"("windowId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseParty_exerciseId_registrationNo_key" ON "ExerciseParty"("exerciseId", "registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "NameRouteInvitee_approvalInstanceId_registrationNo_key" ON "NameRouteInvitee"("approvalInstanceId", "registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "InvitationLetter_windowId_partyId_key" ON "InvitationLetter"("windowId", "partyId");

-- CreateIndex
CREATE INDEX "DocumentSale_windowId_idx" ON "DocumentSale"("windowId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSale_organisationId_financeReceiptNo_key" ON "DocumentSale"("organisationId", "financeReceiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "SiteEventAttendance_eventId_partyId_key" ON "SiteEventAttendance"("eventId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "Addendum_windowId_number_key" ON "Addendum"("windowId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "AddendumRecipient_addendumId_partyId_key" ON "AddendumRecipient"("addendumId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "WindowNotice_closingChangeId_partyId_key" ON "WindowNotice"("closingChangeId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "WindowNotice_cancellationId_partyId_key" ON "WindowNotice"("cancellationId", "partyId");

-- AddForeignKey
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_replacesExerciseId_fkey" FOREIGN KEY ("replacesExerciseId") REFERENCES "SourcingExercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowPolicy" ADD CONSTRAINT "WindowPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowPolicy" ADD CONSTRAINT "WindowPolicy_advertisementChannelId_fkey" FOREIGN KEY ("advertisementChannelId") REFERENCES "PublicationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowPolicy" ADD CONSTRAINT "WindowPolicy_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "HolidayCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowPolicy" ADD CONSTRAINT "WindowPolicy_noticeTemplateId_fkey" FOREIGN KEY ("noticeTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowPolicy" ADD CONSTRAINT "WindowPolicy_invitationTemplateId_fkey" FOREIGN KEY ("invitationTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowPolicy" ADD CONSTRAINT "WindowPolicy_addendumTemplateId_fkey" FOREIGN KEY ("addendumTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationChannel" ADD CONSTRAINT "PublicationChannel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFeeFloor" ADD CONSTRAINT "DocumentFeeFloor_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayCalendarYear" ADD CONSTRAINT "HolidayCalendarYear_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayCalendarYear" ADD CONSTRAINT "HolidayCalendarYear_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "HolidayCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHoliday" ADD CONSTRAINT "PublicHoliday_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHoliday" ADD CONSTRAINT "PublicHoliday_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "HolidayCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseWindow" ADD CONSTRAINT "ExerciseWindow_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseWindow" ADD CONSTRAINT "ExerciseWindow_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowFeeLine" ADD CONSTRAINT "WindowFeeLine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowFeeLine" ADD CONSTRAINT "WindowFeeLine_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingChange" ADD CONSTRAINT "ClosingChange_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingChange" ADD CONSTRAINT "ClosingChange_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingChange" ADD CONSTRAINT "ClosingChange_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowCancellation" ADD CONSTRAINT "WindowCancellation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowCancellation" ADD CONSTRAINT "WindowCancellation_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowCancellation" ADD CONSTRAINT "WindowCancellation_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationRecord" ADD CONSTRAINT "PublicationRecord_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationRecord" ADD CONSTRAINT "PublicationRecord_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationRecord" ADD CONSTRAINT "PublicationRecord_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PublicationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationRecord" ADD CONSTRAINT "PublicationRecord_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseParty" ADD CONSTRAINT "ExerciseParty_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseParty" ADD CONSTRAINT "ExerciseParty_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NameRouteInvitee" ADD CONSTRAINT "NameRouteInvitee_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NameRouteInvitee" ADD CONSTRAINT "NameRouteInvitee_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationLetter" ADD CONSTRAINT "InvitationLetter_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationLetter" ADD CONSTRAINT "InvitationLetter_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationLetter" ADD CONSTRAINT "InvitationLetter_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationLetter" ADD CONSTRAINT "InvitationLetter_nameRouteId_fkey" FOREIGN KEY ("nameRouteId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationLetter" ADD CONSTRAINT "InvitationLetter_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_issuedByPersonId_fkey" FOREIGN KEY ("issuedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEventAttendance" ADD CONSTRAINT "SiteEventAttendance_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEventAttendance" ADD CONSTRAINT "SiteEventAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SiteEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEventAttendance" ADD CONSTRAINT "SiteEventAttendance_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEventAttendance" ADD CONSTRAINT "SiteEventAttendance_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Addendum" ADD CONSTRAINT "Addendum_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Addendum" ADD CONSTRAINT "Addendum_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Addendum" ADD CONSTRAINT "Addendum_closingChangeId_fkey" FOREIGN KEY ("closingChangeId") REFERENCES "ClosingChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddendumRecipient" ADD CONSTRAINT "AddendumRecipient_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddendumRecipient" ADD CONSTRAINT "AddendumRecipient_addendumId_fkey" FOREIGN KEY ("addendumId") REFERENCES "Addendum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddendumRecipient" ADD CONSTRAINT "AddendumRecipient_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowNotice" ADD CONSTRAINT "WindowNotice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowNotice" ADD CONSTRAINT "WindowNotice_closingChangeId_fkey" FOREIGN KEY ("closingChangeId") REFERENCES "ClosingChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowNotice" ADD CONSTRAINT "WindowNotice_cancellationId_fkey" FOREIGN KEY ("cancellationId") REFERENCES "WindowCancellation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowNotice" ADD CONSTRAINT "WindowNotice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (6.5). Prisma does not model CHECK constraints or partial indexes, so they live
-- here and are confirmed in pg_constraint and pg_indexes after a rebuild.

-- The policy's figures are counts of days, and the default time is a clock time.
ALTER TABLE "WindowPolicy" ADD CONSTRAINT "WindowPolicy_days_not_negative"
  CHECK (COALESCE("minAdvertisementDays", 0) >= 0 AND COALESCE("targetAdvertisementDays", 0) >= 0
    AND COALESCE("newspaperWarnDays", 0) >= 0 AND COALESCE("purchaseCutoffDays", 0) >= 0);
ALTER TABLE "WindowPolicy" ADD CONSTRAINT "WindowPolicy_closing_time"
  CHECK ("defaultClosingTime" IS NULL OR "defaultClosingTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
-- A rule that names a channel names one, and only that rule does.
ALTER TABLE "WindowPolicy" ADD CONSTRAINT "WindowPolicy_named_channel"
  CHECK (("advertisementDayRule" = 'NAMED_CHANNEL') = ("advertisementChannelId" IS NOT NULL));

ALTER TABLE "DocumentFeeFloor" ADD CONSTRAINT "DocumentFeeFloor_minimum_not_negative" CHECK ("minimum" >= 0);

-- ISO weekdays only, 1 Monday to 7 Sunday.
ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_weekend_days"
  CHECK ("weekendDays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]);

-- The documents are sold from a day to a day, in order.
ALTER TABLE "ExerciseWindow" ADD CONSTRAINT "ExerciseWindow_purchase_days"
  CHECK ("purchaseFromDay" IS NULL OR "purchaseCloseDay" IS NULL OR "purchaseFromDay" <= "purchaseCloseDay");
ALTER TABLE "ExerciseWindow" ADD CONSTRAINT "ExerciseWindow_fee_not_negative" CHECK (COALESCE("feeAmount", 0) >= 0);
-- A published window keeps the day it was advertised and what it was judged under.
ALTER TABLE "ExerciseWindow" ADD CONSTRAINT "ExerciseWindow_published"
  CHECK ("publishedAt" IS NULL OR ("advertisementDay" IS NOT NULL AND "policySnapshot" IS NOT NULL));

ALTER TABLE "WindowFeeLine" ADD CONSTRAINT "WindowFeeLine_amounts"
  CHECK ("amount" >= 0 AND COALESCE("unitCost", 0) >= 0 AND COALESCE("quantity", 1) > 0);

-- A change is applied or refused, never both, and a refusal says why.
ALTER TABLE "ClosingChange" ADD CONSTRAINT "ClosingChange_one_outcome"
  CHECK (NOT ("appliedAt" IS NOT NULL AND "refusedAt" IS NOT NULL) AND ("refusedAt" IS NULL OR btrim("refusedReason") <> ''));
ALTER TABLE "ClosingChange" ADD CONSTRAINT "ClosingChange_reason" CHECK (btrim("reason") <> '');
ALTER TABLE "WindowCancellation" ADD CONSTRAINT "WindowCancellation_one_outcome"
  CHECK (NOT ("appliedAt" IS NOT NULL AND "refusedAt" IS NOT NULL) AND ("refusedAt" IS NULL OR btrim("refusedReason") <> ''));
ALTER TABLE "WindowCancellation" ADD CONSTRAINT "WindowCancellation_reason" CHECK (btrim("reason") <> '');

-- A voided sale says why, and a fee is never negative.
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_void_reason" CHECK ("voidedAt" IS NULL OR btrim("voidReason") <> '');
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_amount_not_negative" CHECK ("amount" >= 0);
-- One live sale per party: a backstop behind the rule the sale action judges under the window's lock.
CREATE UNIQUE INDEX "DocumentSale_one_live_per_party" ON "DocumentSale"("windowId", "partyId") WHERE "voidedAt" IS NULL;

ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_cancel_reason" CHECK ("cancelledAt" IS NULL OR btrim("cancelReason") <> '');

-- An issued addendum has its number, its day and its frozen text, and a voided draft says why.
ALTER TABLE "Addendum" ADD CONSTRAINT "Addendum_issued"
  CHECK ("status" <> 'ISSUED' OR ("number" IS NOT NULL AND "issuedOn" IS NOT NULL AND "renderedText" IS NOT NULL AND "frozenAt" IS NOT NULL));
ALTER TABLE "Addendum" ADD CONSTRAINT "Addendum_void_reason" CHECK ("status" <> 'VOID' OR btrim("voidReason") <> '');
ALTER TABLE "Addendum" ADD CONSTRAINT "Addendum_number_positive" CHECK ("number" IS NULL OR "number" >= 1);

-- A notice belongs to a closing change or to the cancellation, exactly one.
ALTER TABLE "WindowNotice" ADD CONSTRAINT "WindowNotice_one_parent" CHECK (num_nonnulls("closingChangeId", "cancellationId") = 1);
