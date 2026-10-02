-- CreateEnum
CREATE TYPE "EvaluationRoute" AS ENUM ('TRADITIONAL', 'TWO_STAGE');

-- CreateEnum
CREATE TYPE "EvaluationStageKind" AS ENUM ('CHECKLIST', 'SHORTLIST', 'SCORED', 'ASPECTS', 'FINANCIAL_TEST', 'COMMERCIAL', 'COMPOSITE', 'COMMITTEE_DECISION', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "EvaluationSide" AS ENUM ('IMPLEMENTING_DEPARTMENT', 'CONTRACT_PROCUREMENT', 'COMMITTEE');

-- CreateEnum
CREATE TYPE "CriterionScale" AS ENUM ('ENTERED_MARKS', 'PASS_FAIL', 'BANDED');

-- CreateEnum
CREATE TYPE "ComputedInput" AS ENUM ('NONE', 'MIN_CAPITAL_RATIO', 'VARIANCE_VS_ESTIMATE', 'VARIANCE_VS_LOWEST', 'CPR_PERCENT');

-- CreateEnum
CREATE TYPE "CapitalBase" AS ENUM ('TENDER_AMOUNT', 'COMPANY_ESTIMATE');

-- CreateEnum
CREATE TYPE "ShortlistRule" AS ENUM ('COUNT_RANGE', 'DECIDED_BY_OFFICE', 'NONE');

-- CreateEnum
CREATE TYPE "EvaluationModelStatus" AS ENUM ('DRAFT', 'ISSUED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AspectKind" AS ENUM ('COMPLETENESS', 'PRICE_VS_ESTIMATE', 'COMPLETION_PERIOD', 'CAPABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "AspectVerdict" AS ENUM ('SATISFACTORY', 'NOT_SATISFACTORY');

-- CreateEnum
CREATE TYPE "BandOutcome" AS ENUM ('PASS', 'FAIL', 'NONE');

-- CreateEnum
CREATE TYPE "EvaluationMeetingKind" AS ENUM ('CLARIFICATION', 'NEGOTIATION');

-- CreateEnum
CREATE TYPE "EvaluationState" AS ENUM ('OPEN', 'ISSUED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvaluationTrigger" AS ENUM ('START', 'LOOP', 'SUPPLEMENTARY_OPENING');

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('TO_TENDERER', 'FROM_TENDERER');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('LETTER', 'EMAIL', 'FAX');

-- AlterTable
ALTER TABLE "Award" ADD COLUMN     "recPeriodDiffersReason" TEXT,
ADD COLUMN     "recValueDiffersReason" TEXT;

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "evaluationBidderId" TEXT;

-- AlterTable
ALTER TABLE "ContractBasis" ADD COLUMN     "evaluationRoute" "EvaluationRoute",
ADD COLUMN     "evaluationRouteProvenance" "Provenance";

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "evaluationBidderId" TEXT,
ADD COLUMN     "evaluationId" TEXT,
ADD COLUMN     "evaluationMeetingId" TEXT;

-- AlterTable
ALTER TABLE "SourcingExercise" ADD COLUMN     "evaluationModelId" TEXT,
ADD COLUMN     "evaluationModelPinnedAt" TIMESTAMP(3),
ADD COLUMN     "evaluationModelSnapshot" JSONB;

-- AlterTable
ALTER TABLE "SourcingMethod" ADD COLUMN     "defaultEvaluationModelCode" TEXT;

-- CreateTable
CREATE TABLE "EvaluationModel" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "route" "EvaluationRoute" NOT NULL,
    "status" "EvaluationModelStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "contentSnapshot" JSONB,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "governingSource" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationStage" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "kind" "EvaluationStageKind" NOT NULL,
    "side" "EvaluationSide" NOT NULL,
    "unlocksAfterOrder" INTEGER,
    "maxMarks" DECIMAL(9,4),
    "passMark" DECIMAL(9,4),
    "passInclusive" BOOLEAN,
    "mustPass" BOOLEAN,
    "compositeWeight" DECIMAL(9,4),
    "committeeCode" TEXT,
    "shortlistRule" "ShortlistRule",
    "shortlistMin" INTEGER,
    "shortlistMax" INTEGER,
    "shortlistOfficeCode" TEXT,
    "capitalBase" "CapitalBase",
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "governingSource" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "EvaluationStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCriterion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "maxMarks" DECIMAL(9,4),
    "scale" "CriterionScale" NOT NULL,
    "computedInput" "ComputedInput" NOT NULL DEFAULT 'NONE',
    "bandSetCode" TEXT,
    "needsNamedContractor" BOOLEAN NOT NULL DEFAULT false,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "governingSource" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "EvaluationCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationFactorOption" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "factorPct" DECIMAL(9,4) NOT NULL,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "governingSource" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "EvaluationFactorOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationBandSet" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "governingSource" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "EvaluationBandSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationBand" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "lower" DECIMAL(9,4),
    "lowerInclusive" BOOLEAN NOT NULL DEFAULT true,
    "lowerIsFloor" BOOLEAN NOT NULL DEFAULT false,
    "upper" DECIMAL(9,4),
    "upperInclusive" BOOLEAN NOT NULL DEFAULT false,
    "upperIsFloor" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "BandOutcome" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EvaluationBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationAspect" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "AspectKind" NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "requiredOnRoute" "EvaluationRoute",
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "governingSource" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "EvaluationAspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reportSeriesKey" TEXT,
    "scoreDecimals" INTEGER,
    "scoreDecimalsProvenance" "Provenance",
    "checkerRoleCode" TEXT,
    "recommenderRoleCode" TEXT,
    "reportTemplateId" TEXT,
    "proposalTemplateId" TEXT,
    "annexLabels" JSONB,
    "annexLabelsProvenance" "Provenance",
    "governingSource" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" "EvaluationState" NOT NULL,
    "trigger" "EvaluationTrigger" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "startedByPersonId" TEXT NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "loopDecisionId" TEXT,
    "loopStageKey" TEXT,
    "supplementaryOpeningId" TEXT,
    "reportReference" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedByPersonId" TEXT,
    "reportSnapshot" JSONB,
    "consentCheckSnapshot" JSONB,
    "supersededAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationTeamMember" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "side" "EvaluationSide" NOT NULL,
    "orgUnitCodeSnapshot" TEXT,
    "appointedOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationBidder" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "openedBidId" TEXT NOT NULL,
    "excludedReason" TEXT NOT NULL DEFAULT '',
    "ceilingSnapshot" JSONB,
    "correctedPrice" DECIMAL(18,2),
    "correctionReason" TEXT NOT NULL DEFAULT '',
    "correctedAt" TIMESTAMP(3),
    "correctedByPersonId" TEXT,
    "shortlisted" BOOLEAN,
    "shortlistedAt" TIMESTAMP(3),
    "shortlistedByPersonId" TEXT,
    "factorOptionCode" TEXT,
    "balanceMonth1" DECIMAL(18,2),
    "balanceMonth2" DECIMAL(18,2),
    "balanceMonth3" DECIMAL(18,2),
    "cprPercent" DECIMAL(9,4),
    "inputsRecordedAt" TIMESTAMP(3),
    "inputsRecordedByPersonId" TEXT,
    "carriedFromId" TEXT,

    CONSTRAINT "EvaluationBidder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationScore" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "stageCode" TEXT NOT NULL,
    "criterionCode" TEXT NOT NULL,
    "marks" DECIMAL(9,4),
    "passed" BOOLEAN,
    "note" TEXT NOT NULL DEFAULT '',
    "scoredByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "supersedesId" TEXT,
    "carriedFromScoreId" TEXT,

    CONSTRAINT "EvaluationScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageSubmission" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "stageCode" TEXT NOT NULL,
    "side" "EvaluationSide" NOT NULL,
    "submittedByPersonId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageResult" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "stageCode" TEXT NOT NULL,
    "percent" DECIMAL(9,4),
    "shown" DECIMAL(9,4),
    "passed" BOOLEAN,
    "bandLabel" TEXT,
    "outOfRunning" BOOLEAN NOT NULL DEFAULT false,
    "detail" JSONB,

    CONSTRAINT "StageResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AspectAssessment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "aspectCode" TEXT NOT NULL,
    "verdict" "AspectVerdict" NOT NULL,
    "narrative" TEXT NOT NULL,
    "assessedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "supersedesId" TEXT,

    CONSTRAINT "AspectAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "requestedByPersonId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NegotiationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationMeeting" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "kind" "EvaluationMeetingKind" NOT NULL,
    "round" INTEGER NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "place" TEXT NOT NULL,
    "minutes" TEXT NOT NULL DEFAULT '',
    "priceBefore" DECIMAL(18,2),
    "priceAfter" DECIMAL(18,2),
    "approvalInstanceId" TEXT,
    "openedByPersonId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedByPersonId" TEXT,

    CONSTRAINT "EvaluationMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TendererCommunication" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "direction" "CommunicationDirection" NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "sentOn" TIMESTAMP(3),
    "receivedOn" TIMESTAMP(3),
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "recordedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TendererCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "completionPeriod" INTEGER,
    "completionUnit" "PeriodUnit",
    "topRanked" BOOLEAN NOT NULL,
    "justification" TEXT NOT NULL DEFAULT '',
    "formedByPersonId" TEXT NOT NULL,
    "formedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalPaper" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "templateBodyVersion" INTEGER NOT NULL,
    "language" "DocumentLanguage" NOT NULL,
    "renderedText" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL,
    "renderedByPersonId" TEXT NOT NULL,
    "checkerRoleCode" TEXT NOT NULL,
    "recommenderRoleCode" TEXT NOT NULL,
    "checkedByPersonId" TEXT,
    "checkedOn" TIMESTAMP(3),
    "checkedRecordedAt" TIMESTAMP(3),
    "recommendedByPersonId" TEXT,
    "recommendedOn" TIMESTAMP(3),
    "recommendedRecordedAt" TIMESTAMP(3),

    CONSTRAINT "ProposalPaper_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationModel_organisationId_code_version_key" ON "EvaluationModel"("organisationId", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationStage_modelId_code_key" ON "EvaluationStage"("modelId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationStage_modelId_order_key" ON "EvaluationStage"("modelId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationCriterion_stageId_code_key" ON "EvaluationCriterion"("stageId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationFactorOption_stageId_code_key" ON "EvaluationFactorOption"("stageId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationBandSet_modelId_code_key" ON "EvaluationBandSet"("modelId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationAspect_organisationId_code_key" ON "EvaluationAspect"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationPolicy_organisationId_key" ON "EvaluationPolicy"("organisationId");

-- CreateIndex
CREATE INDEX "Evaluation_organisationId_idx" ON "Evaluation"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_exerciseId_version_key" ON "Evaluation"("exerciseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_organisationId_reportReference_key" ON "Evaluation"("organisationId", "reportReference");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationTeamMember_evaluationId_personId_key" ON "EvaluationTeamMember"("evaluationId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationBidder_evaluationId_openedBidId_key" ON "EvaluationBidder"("evaluationId", "openedBidId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationScore_supersedesId_key" ON "EvaluationScore"("supersedesId");

-- CreateIndex
CREATE INDEX "EvaluationScore_bidderId_stageCode_criterionCode_idx" ON "EvaluationScore"("bidderId", "stageCode", "criterionCode");

-- CreateIndex
CREATE UNIQUE INDEX "StageSubmission_evaluationId_stageCode_key" ON "StageSubmission"("evaluationId", "stageCode");

-- CreateIndex
CREATE INDEX "StageResult_evaluationId_idx" ON "StageResult"("evaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "StageResult_bidderId_stageCode_key" ON "StageResult"("bidderId", "stageCode");

-- CreateIndex
CREATE UNIQUE INDEX "AspectAssessment_supersedesId_key" ON "AspectAssessment"("supersedesId");

-- CreateIndex
CREATE INDEX "AspectAssessment_bidderId_aspectCode_idx" ON "AspectAssessment"("bidderId", "aspectCode");

-- CreateIndex
CREATE UNIQUE INDEX "NegotiationRequest_approvalInstanceId_key" ON "NegotiationRequest"("approvalInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationMeeting_evaluationId_bidderId_kind_round_key" ON "EvaluationMeeting"("evaluationId", "bidderId", "kind", "round");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_evaluationId_key" ON "Recommendation"("evaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalPaper_evaluationId_key" ON "ProposalPaper"("evaluationId");

-- CreateIndex
CREATE INDEX "CommitteeDecision_evaluationBidderId_idx" ON "CommitteeDecision"("evaluationBidderId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_evaluationId_idx" ON "DocumentAttachment"("evaluationId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_evaluationMeetingId_idx" ON "DocumentAttachment"("evaluationMeetingId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_evaluationBidderId_idx" ON "DocumentAttachment"("evaluationBidderId");

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_evaluationBidderId_fkey" FOREIGN KEY ("evaluationBidderId") REFERENCES "EvaluationBidder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_evaluationModelId_fkey" FOREIGN KEY ("evaluationModelId") REFERENCES "EvaluationModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_evaluationMeetingId_fkey" FOREIGN KEY ("evaluationMeetingId") REFERENCES "EvaluationMeeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_evaluationBidderId_fkey" FOREIGN KEY ("evaluationBidderId") REFERENCES "EvaluationBidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationModel" ADD CONSTRAINT "EvaluationModel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationStage" ADD CONSTRAINT "EvaluationStage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationStage" ADD CONSTRAINT "EvaluationStage_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "EvaluationModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriterion" ADD CONSTRAINT "EvaluationCriterion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriterion" ADD CONSTRAINT "EvaluationCriterion_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "EvaluationStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriterion" ADD CONSTRAINT "EvaluationCriterion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EvaluationCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationFactorOption" ADD CONSTRAINT "EvaluationFactorOption_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationFactorOption" ADD CONSTRAINT "EvaluationFactorOption_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "EvaluationStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBandSet" ADD CONSTRAINT "EvaluationBandSet_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBandSet" ADD CONSTRAINT "EvaluationBandSet_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "EvaluationModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBand" ADD CONSTRAINT "EvaluationBand_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBand" ADD CONSTRAINT "EvaluationBand_setId_fkey" FOREIGN KEY ("setId") REFERENCES "EvaluationBandSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAspect" ADD CONSTRAINT "EvaluationAspect_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationPolicy" ADD CONSTRAINT "EvaluationPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationPolicy" ADD CONSTRAINT "EvaluationPolicy_reportTemplateId_fkey" FOREIGN KEY ("reportTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationPolicy" ADD CONSTRAINT "EvaluationPolicy_proposalTemplateId_fkey" FOREIGN KEY ("proposalTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_startedByPersonId_fkey" FOREIGN KEY ("startedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_loopDecisionId_fkey" FOREIGN KEY ("loopDecisionId") REFERENCES "CommitteeDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_supplementaryOpeningId_fkey" FOREIGN KEY ("supplementaryOpeningId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_issuedByPersonId_fkey" FOREIGN KEY ("issuedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_cancelledByPersonId_fkey" FOREIGN KEY ("cancelledByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationTeamMember" ADD CONSTRAINT "EvaluationTeamMember_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationTeamMember" ADD CONSTRAINT "EvaluationTeamMember_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationTeamMember" ADD CONSTRAINT "EvaluationTeamMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBidder" ADD CONSTRAINT "EvaluationBidder_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBidder" ADD CONSTRAINT "EvaluationBidder_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBidder" ADD CONSTRAINT "EvaluationBidder_openedBidId_fkey" FOREIGN KEY ("openedBidId") REFERENCES "OpenedBid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBidder" ADD CONSTRAINT "EvaluationBidder_correctedByPersonId_fkey" FOREIGN KEY ("correctedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBidder" ADD CONSTRAINT "EvaluationBidder_shortlistedByPersonId_fkey" FOREIGN KEY ("shortlistedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBidder" ADD CONSTRAINT "EvaluationBidder_inputsRecordedByPersonId_fkey" FOREIGN KEY ("inputsRecordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationBidder" ADD CONSTRAINT "EvaluationBidder_carriedFromId_fkey" FOREIGN KEY ("carriedFromId") REFERENCES "EvaluationBidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "EvaluationBidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_scoredByPersonId_fkey" FOREIGN KEY ("scoredByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "EvaluationScore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_carriedFromScoreId_fkey" FOREIGN KEY ("carriedFromScoreId") REFERENCES "EvaluationScore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageSubmission" ADD CONSTRAINT "StageSubmission_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageSubmission" ADD CONSTRAINT "StageSubmission_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageSubmission" ADD CONSTRAINT "StageSubmission_submittedByPersonId_fkey" FOREIGN KEY ("submittedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageResult" ADD CONSTRAINT "StageResult_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageResult" ADD CONSTRAINT "StageResult_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageResult" ADD CONSTRAINT "StageResult_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "EvaluationBidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AspectAssessment" ADD CONSTRAINT "AspectAssessment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AspectAssessment" ADD CONSTRAINT "AspectAssessment_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "EvaluationBidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AspectAssessment" ADD CONSTRAINT "AspectAssessment_assessedByPersonId_fkey" FOREIGN KEY ("assessedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AspectAssessment" ADD CONSTRAINT "AspectAssessment_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "AspectAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationRequest" ADD CONSTRAINT "NegotiationRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationRequest" ADD CONSTRAINT "NegotiationRequest_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationRequest" ADD CONSTRAINT "NegotiationRequest_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "EvaluationBidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationRequest" ADD CONSTRAINT "NegotiationRequest_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationRequest" ADD CONSTRAINT "NegotiationRequest_requestedByPersonId_fkey" FOREIGN KEY ("requestedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMeeting" ADD CONSTRAINT "EvaluationMeeting_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMeeting" ADD CONSTRAINT "EvaluationMeeting_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMeeting" ADD CONSTRAINT "EvaluationMeeting_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "EvaluationBidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMeeting" ADD CONSTRAINT "EvaluationMeeting_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMeeting" ADD CONSTRAINT "EvaluationMeeting_openedByPersonId_fkey" FOREIGN KEY ("openedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMeeting" ADD CONSTRAINT "EvaluationMeeting_closedByPersonId_fkey" FOREIGN KEY ("closedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TendererCommunication" ADD CONSTRAINT "TendererCommunication_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TendererCommunication" ADD CONSTRAINT "TendererCommunication_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TendererCommunication" ADD CONSTRAINT "TendererCommunication_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "EvaluationBidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TendererCommunication" ADD CONSTRAINT "TendererCommunication_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "EvaluationBidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_formedByPersonId_fkey" FOREIGN KEY ("formedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalPaper" ADD CONSTRAINT "ProposalPaper_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalPaper" ADD CONSTRAINT "ProposalPaper_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalPaper" ADD CONSTRAINT "ProposalPaper_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalPaper" ADD CONSTRAINT "ProposalPaper_renderedByPersonId_fkey" FOREIGN KEY ("renderedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalPaper" ADD CONSTRAINT "ProposalPaper_checkedByPersonId_fkey" FOREIGN KEY ("checkedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalPaper" ADD CONSTRAINT "ProposalPaper_recommendedByPersonId_fkey" FOREIGN KEY ("recommendedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (X-6): the attachment owner CHECKs rebuilt from the full owner list, the evaluation,
-- its meetings and its bidders added (6.8). Prisma does not model CHECK constraints, so they live
-- here, in attachFault, and in the schema-vs-CHECK test (owner-check.test.ts).
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId") = 1);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" = 'SIGNED_MINUTES' AND "meetingId" IS NOT NULL)
    OR ("purpose" = 'SPEC_PANEL_FORM' AND "specificationPanelId" IS NOT NULL)
    OR ("purpose" = 'BQ_IMPORT_SOURCE' AND "bqVersionId" IS NOT NULL)
    OR ("purpose" = 'TENDER_PART' AND "tenderPackPartId" IS NOT NULL)
    OR ("purpose" = 'ADDENDUM_SIGNED' AND "addendumId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE', 'PUBLICATION_PROOF', 'ATTENDANCE_SHEET') AND "exerciseId" IS NOT NULL)
    OR ("purpose" = 'WITHDRAWAL_LETTER' AND "bidWithdrawalId" IS NOT NULL)
    OR ("purpose" = 'VALIDITY_CONSENT' AND "validityExtensionId" IS NOT NULL)
    OR ("purpose" = 'SIGNED_SCHEDULE' AND "openingId" IS NOT NULL)
    OR ("purpose" IN ('REPORT_DRAWINGS', 'SIGNED_REPORT', 'SIGNED_PROPOSAL_PAPER') AND "evaluationId" IS NOT NULL)
    OR ("purpose" IN ('MEETING_MINUTES', 'TENDERER_CONFIRMATION') AND "evaluationMeetingId" IS NOT NULL)
    OR ("purpose" IN ('CPR_REPORT', 'COMMUNICATION') AND "evaluationBidderId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
  );

-- FR-EVL-005: an evaluation bidder is named only by an EVALUATION_STAGE matter.
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_evaluation_stage"
  CHECK ("evaluationBidderId" IS NULL OR "matterKind" = 'EVALUATION_STAGE');

-- One evaluation version in force per exercise: open or issued (E-7, FR-CTE-009).
CREATE UNIQUE INDEX "Evaluation_one_in_force" ON "Evaluation"("exerciseId") WHERE "state" IN ('OPEN', 'ISSUED');
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_version_positive" CHECK ("version" >= 1);
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_issued_record"
  CHECK ("state" NOT IN ('ISSUED', 'SUPERSEDED') OR "issuedAt" IS NULL OR ("reportReference" IS NOT NULL AND "reportSnapshot" IS NOT NULL));
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_issued_has_report"
  CHECK ("state" <> 'ISSUED' OR ("issuedAt" IS NOT NULL AND "reportReference" IS NOT NULL AND "reportSnapshot" IS NOT NULL));
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_superseded_stamp" CHECK (("state" = 'SUPERSEDED') = ("supersededAt" IS NOT NULL));
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_cancelled_stamp" CHECK (("state" = 'CANCELLED') = ("cancelledAt" IS NOT NULL));
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_trigger_record"
  CHECK (("trigger" = 'LOOP') = ("loopDecisionId" IS NOT NULL AND "loopStageKey" IS NOT NULL)
    AND ("trigger" = 'SUPPLEMENTARY_OPENING') = ("supplementaryOpeningId" IS NOT NULL));

-- A score is marks or a pass, never both, never negative (append-only, FR-EVL-001).
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_one_value" CHECK (num_nonnulls("marks", "passed") = 1);
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_marks_not_negative" CHECK ("marks" IS NULL OR "marks" >= 0);

-- A corrected price carries its reason (FR-EVL-008 arithmetic correction).
ALTER TABLE "EvaluationBidder" ADD CONSTRAINT "EvaluationBidder_correction_reason"
  CHECK ("correctedPrice" IS NULL OR ("correctedPrice" >= 0 AND length(btrim("correctionReason")) > 0));
ALTER TABLE "EvaluationBidder" ADD CONSTRAINT "EvaluationBidder_cpr_range" CHECK ("cprPercent" IS NULL OR ("cprPercent" >= 0 AND "cprPercent" <= 100));

-- A negotiation round stands on its approved route and carries its prices, a clarification neither (FR-EVL-015, 016).
ALTER TABLE "EvaluationMeeting" ADD CONSTRAINT "EvaluationMeeting_kind_record"
  CHECK (("kind" = 'NEGOTIATION') = ("approvalInstanceId" IS NOT NULL)
    AND ("kind" = 'NEGOTIATION' OR ("priceBefore" IS NULL AND "priceAfter" IS NULL)));
ALTER TABLE "EvaluationMeeting" ADD CONSTRAINT "EvaluationMeeting_round_positive" CHECK ("round" >= 1);
ALTER TABLE "EvaluationMeeting" ADD CONSTRAINT "EvaluationMeeting_prices_not_negative" CHECK (("priceBefore" IS NULL OR "priceBefore" >= 0) AND ("priceAfter" IS NULL OR "priceAfter" >= 0));

ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_price_not_negative" CHECK ("price" >= 0);
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_period" CHECK (("completionPeriod" IS NULL) = ("completionUnit" IS NULL) AND ("completionPeriod" IS NULL OR "completionPeriod" >= 1));
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_justified" CHECK ("topRanked" OR length(btrim("justification")) > 0);

-- The two who check and recommend the Kertas Cadangan are different people (FR-CTE-013).
ALTER TABLE "ProposalPaper" ADD CONSTRAINT "ProposalPaper_two_people"
  CHECK ("checkedByPersonId" IS NULL OR "recommendedByPersonId" IS NULL OR "checkedByPersonId" <> "recommendedByPersonId");

-- Configuration: a version is positive, a band's edges in order, an edge is a number or the floor, never both.
ALTER TABLE "EvaluationModel" ADD CONSTRAINT "EvaluationModel_version_positive" CHECK ("version" >= 1);
ALTER TABLE "EvaluationModel" ADD CONSTRAINT "EvaluationModel_issued_content" CHECK ("status" = 'DRAFT' OR ("issuedAt" IS NOT NULL AND "contentSnapshot" IS NOT NULL));
ALTER TABLE "EvaluationBand" ADD CONSTRAINT "EvaluationBand_edges"
  CHECK (NOT ("lowerIsFloor" AND "lower" IS NOT NULL) AND NOT ("upperIsFloor" AND "upper" IS NOT NULL)
    AND ("lower" IS NULL OR "upper" IS NULL OR "lower" <= "upper"));
ALTER TABLE "EvaluationStage" ADD CONSTRAINT "EvaluationStage_shortlist_range"
  CHECK (("shortlistMin" IS NULL OR "shortlistMin" >= 1) AND ("shortlistMax" IS NULL OR "shortlistMax" >= 1) AND ("shortlistMin" IS NULL OR "shortlistMax" IS NULL OR "shortlistMin" <= "shortlistMax"));
ALTER TABLE "EvaluationPolicy" ADD CONSTRAINT "EvaluationPolicy_decimals" CHECK ("scoreDecimals" IS NULL OR ("scoreDecimals" >= 0 AND "scoreDecimals" <= 4));
