-- CreateEnum
CREATE TYPE "ExerciseStatus" AS ENUM ('DRAFT', 'DOCUMENTS_IN_PREPARATION', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliverableKind" AS ENUM ('GOODS_DELIVERED', 'MEASURED_CONSTRUCTION', 'TERM_PERFORMANCE');

-- CreateEnum
CREATE TYPE "ProposalState" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "TaxonomyPick" AS ENUM ('DERIVED', 'CHOSEN');

-- CreateEnum
CREATE TYPE "ContractTypeState" AS ENUM ('DERIVED', 'OVERRIDDEN', 'CHOSEN');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "exerciseId" TEXT;

-- AlterTable
ALTER TABLE "AuthorityMatrix" ADD COLUMN     "boundaryProvenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
ADD COLUMN     "boundarySource" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ContractType" ADD COLUMN     "administratorRoleCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "claimsApprovalCommitteeCode" TEXT,
ADD COLUMN     "completionInstrument" TEXT,
ADD COLUMN     "defectsLiabilityApplies" BOOLEAN,
ADD COLUMN     "deliverableKind" "DeliverableKind",
ADD COLUMN     "eotInstrument" TEXT,
ADD COLUMN     "interimPaymentRule" TEXT,
ADD COLUMN     "makingGoodCertificate" BOOLEAN,
ADD COLUMN     "nominationAllowed" BOOLEAN,
ADD COLUMN     "pricingBasis" TEXT,
ADD COLUMN     "registrationTest" TEXT,
ADD COLUMN     "startRequiresSecurities" BOOLEAN,
ADD COLUMN     "sumAdjustmentDrivers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SourcingMethod" ADD COLUMN     "defaultBelow" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultInQuotation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultInTender" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dossierSeriesKey" TEXT,
ADD COLUMN     "justificationPrompt" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requiresCoordinationRecord" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresDossier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresJustification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresNameApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresProposal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restrictedAccess" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TermsBand" (
    "id" TEXT NOT NULL,
    "authorityMatrixId" TEXT NOT NULL,
    "bandKey" TEXT NOT NULL,
    "minValue" DECIMAL(18,2),
    "maxValue" DECIMAL(18,2),
    "regime" TEXT,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "retentionApplies" BOOLEAN,
    "defectsLiabilityApplies" BOOLEAN,
    "insuranceNote" TEXT NOT NULL DEFAULT '',
    "followsBoundarySwitch" BOOLEAN,
    "clause" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TermsBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MethodChecklistItem" (
    "id" TEXT NOT NULL,
    "sourcingMethodId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "MethodChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JustificationReason" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sourcingMethodCode" TEXT,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "JustificationReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractBasis" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "standardFormLabel" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "ContractBasis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificationTaxonomy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "ClassificationTaxonomy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyValue" (
    "id" TEXT NOT NULL,
    "taxonomyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "TaxonomyValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyMapping" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractTypeCode" TEXT NOT NULL,
    "taxonomyCode" TEXT NOT NULL,
    "valueCode" TEXT NOT NULL,
    "whenBasisCode" TEXT,
    "whenTaxonomyCode" TEXT,
    "whenValueCode" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',

    CONSTRAINT "TaxonomyMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificationPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "dominanceSharePct" DECIMAL(9,4),
    "provenance" "Provenance",
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ClassificationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingExercise" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "estimatedValue" DECIMAL(18,2) NOT NULL,
    "status" "ExerciseStatus" NOT NULL DEFAULT 'DRAFT',
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "sourcingMethodCode" TEXT NOT NULL,
    "proposedMethodCode" TEXT,
    "methodReason" TEXT NOT NULL DEFAULT '',
    "externalRouteNote" TEXT NOT NULL DEFAULT '',
    "parentContractRef" TEXT,
    "authorityMatrixId" TEXT,
    "matrixLabel" TEXT,
    "regime" TEXT,
    "requisitionRuleKey" TEXT,
    "requisitionRuleLabel" TEXT,
    "appointmentRuleKey" TEXT,
    "appointmentState" TEXT,
    "termsBandKey" TEXT,
    "termsState" TEXT,
    "boundaryValue" DECIMAL(18,2),
    "boundaryOperator" "BoundaryOperator",
    "onBoundary" BOOLEAN NOT NULL DEFAULT false,
    "boundaryRuled" BOOLEAN,
    "boundaryProvenance" "Provenance",
    "bandSnapshot" JSONB NOT NULL DEFAULT '{}',
    "bandWarnings" JSONB NOT NULL DEFAULT '[]',
    "determinedAt" TIMESTAMP(3),
    "contractTypeCode" TEXT,
    "derivedContractTypeCode" TEXT,
    "derivationState" TEXT,
    "dominantSharePct" DECIMAL(9,4),
    "contractTypeState" "ContractTypeState",
    "contractTypeOverrideReason" TEXT NOT NULL DEFAULT '',
    "overriddenByPersonId" TEXT,
    "contractBasisCode" TEXT,
    "classificationLockedAt" TIMESTAMP(3),
    "justificationReasonCode" TEXT,
    "justificationText" TEXT NOT NULL DEFAULT '',
    "evidenceNote" TEXT NOT NULL DEFAULT '',
    "dossierReference" TEXT,
    "emergencyTrigger" TEXT NOT NULL DEFAULT '',
    "coordinationMeetingOn" TIMESTAMP(3),
    "coordinationAttendees" TEXT NOT NULL DEFAULT '',
    "coordinationScopeNote" TEXT NOT NULL DEFAULT '',
    "bqReference" TEXT,
    "proposalState" "ProposalState",
    "proposalSubmittedOn" TIMESTAMP(3),
    "proposalReviewedOn" TIMESTAMP(3),
    "proposalReviewerPersonId" TEXT,
    "proposalReviewComment" TEXT NOT NULL DEFAULT '',
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "classificationSnapshot" JSONB,
    "preparedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourcingExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseScopePart" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "deliverableKind" "DeliverableKind" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExerciseScopePart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseProposalAnswer" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseProposalAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseTaxonomyValue" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "taxonomyCode" TEXT NOT NULL,
    "valueCode" TEXT NOT NULL,
    "pick" "TaxonomyPick" NOT NULL,

    CONSTRAINT "ExerciseTaxonomyValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseParticipant" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "capacity" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ExerciseParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TermsBand_authorityMatrixId_bandKey_key" ON "TermsBand"("authorityMatrixId", "bandKey");

-- CreateIndex
CREATE UNIQUE INDEX "MethodChecklistItem_sourcingMethodId_key_key" ON "MethodChecklistItem"("sourcingMethodId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "JustificationReason_organisationId_code_key" ON "JustificationReason"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ContractBasis_organisationId_code_key" ON "ContractBasis"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ClassificationTaxonomy_organisationId_code_key" ON "ClassificationTaxonomy"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomyValue_taxonomyId_code_key" ON "TaxonomyValue"("taxonomyId", "code");

-- CreateIndex
CREATE INDEX "TaxonomyMapping_organisationId_contractTypeCode_idx" ON "TaxonomyMapping"("organisationId", "contractTypeCode");

-- CreateIndex
CREATE UNIQUE INDEX "ClassificationPolicy_organisationId_key" ON "ClassificationPolicy"("organisationId");

-- CreateIndex
CREATE INDEX "SourcingExercise_organisationId_status_idx" ON "SourcingExercise"("organisationId", "status");

-- CreateIndex
CREATE INDEX "SourcingExercise_requisitionId_idx" ON "SourcingExercise"("requisitionId");

-- CreateIndex
CREATE UNIQUE INDEX "SourcingExercise_organisationId_reference_key" ON "SourcingExercise"("organisationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "SourcingExercise_organisationId_dossierReference_key" ON "SourcingExercise"("organisationId", "dossierReference");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseProposalAnswer_exerciseId_itemKey_key" ON "ExerciseProposalAnswer"("exerciseId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseTaxonomyValue_exerciseId_taxonomyCode_key" ON "ExerciseTaxonomyValue"("exerciseId", "taxonomyCode");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseParticipant_exerciseId_personId_key" ON "ExerciseParticipant"("exerciseId", "personId");

-- CreateIndex
CREATE INDEX "ApprovalInstance_exerciseId_idx" ON "ApprovalInstance"("exerciseId");

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermsBand" ADD CONSTRAINT "TermsBand_authorityMatrixId_fkey" FOREIGN KEY ("authorityMatrixId") REFERENCES "AuthorityMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodChecklistItem" ADD CONSTRAINT "MethodChecklistItem_sourcingMethodId_fkey" FOREIGN KEY ("sourcingMethodId") REFERENCES "SourcingMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JustificationReason" ADD CONSTRAINT "JustificationReason_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractBasis" ADD CONSTRAINT "ContractBasis_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationTaxonomy" ADD CONSTRAINT "ClassificationTaxonomy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyValue" ADD CONSTRAINT "TaxonomyValue_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "ClassificationTaxonomy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyMapping" ADD CONSTRAINT "TaxonomyMapping_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationPolicy" ADD CONSTRAINT "ClassificationPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_overriddenByPersonId_fkey" FOREIGN KEY ("overriddenByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_proposalReviewerPersonId_fkey" FOREIGN KEY ("proposalReviewerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseScopePart" ADD CONSTRAINT "ExerciseScopePart_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseProposalAnswer" ADD CONSTRAINT "ExerciseProposalAnswer_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTaxonomyValue" ADD CONSTRAINT "ExerciseTaxonomyValue_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseParticipant" ADD CONSTRAINT "ExerciseParticipant_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseParticipant" ADD CONSTRAINT "ExerciseParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
