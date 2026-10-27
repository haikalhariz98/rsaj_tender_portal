/**
 * 6.13 Part B run 1a (ADR 0031 §4, BD-613-99): today's acts on a contract and today's answer, pinned before the act ×
 * status table (act-status-pin.test.ts reads it; the table's tests check the table against it). Imported by tests only.
 */

export const TODAY_STATUSES = ["NUMBER_ALLOCATED", "CANCELLED", "IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED", "EXECUTED", "STAMPED", "ACTIVE"] as const;
export type TodayAnswer = "ALLOWED" | "CANCELLED";
export const todayAnswer = (status: (typeof TODAY_STATUSES)[number]): TodayAnswer => (status === "CANCELLED" ? "CANCELLED" : "ALLOWED");

/// Every act on a contract today, by file, in source order.
export const TODAY_ACTS = {
  "src/app/projects/[id]/actions.ts": ["startPreparation", "setAssemblyPart", "recordReconciliation", "addAmendment", "addCorrection", "addRate", "removeCheckLine", "completeCheck", "submitLegal", "decideLegal", "recordWcCheck", "recordContractorSignature", "recordRsajSignature", "correctContractDate", "recordStamping", "recordBriefing", "answerConsultingEngineer", "issueCopy", "despatchCopy", "acknowledgeCopy", "recallCopy", "reissueCopy", "registerOriginal", "moveOriginal", "saveBaselineEntry", "confirmBaseline", "correctBaseline", "correctAwardTerm"],
  "src/app/projects/[id]/supervision-actions.ts": ["resolveSuperintendingOfficer", "recordDelegation", "revokeDelegation", "recordPossession", "submitProgramme", "scrutiniseProgramme", "decideProgramme", "recordProgress", "recordDiaryEntry", "attestDiary", "disputeDiary", "endorseDiary", "recordSiteMeeting", "recordObservation", "recordDirection", "recordSelfHelp", "recordEarlyAction", "recordParty", "retireParty", "handOverRecords"],
  "src/app/projects/[id]/payment-actions.ts": ["recordValuationCalendar", "openInterimValuation", "recordMainWorks", "recordJointValuation", "addMaterialLine", "removeMaterialLine", "recordPartyLine", "addValuationDeduction", "removeValuationDeduction", "raiseInterimCertificate", "holdValuation", "withdrawValuation", "releaseRetention", "recordOpeningPosition", "applyAdvancePayment", "raiseLadWarning", "recordWarningPost", "recordNonCompletion", "closeLadWindow"],
  "src/app/projects/[id]/variation-actions.ts": ["recordVariation", "editVariation", "submitVariation", "decideVariation", "sendVariationForApproval", "decideVariationApprovalStep", "citeVariationCommittee", "chooseVariationRefusal", "tableVariationMatter", "recordCommencement", "closeVariation", "raiseInstruction", "recordOralLoop", "addMeasurement", "removeMeasurement", "recordDaywork", "raiseVariationOrder", "raiseSumAdjustment"],
  "src/app/projects/[id]/certificates/[certId]/actions.ts": ["sendCertificateForRouting", "recordCertificateReceived", "recordCertificateCheck", "sendCertificateToSigning", "recordCertificateSignature", "overrideCertificateFigure", "correctCertificateDay", "despatchCertificateCopy", "acknowledgeCertificateCopy", "voidCertificateAct", "sendCertificateForApproval", "decideCertificateRouteStep", "chooseCertificateRouteRejection", "recordCertificatePayment", "correctCertificatePayment"],
} as const;

/// ADR 0042 D11 (PW-22) and ADR 0046: families added to the table after the pin, outside Part B. They have no pinned answer and no act in TODAY_ACTS.
export const AFTER_PIN_FAMILIES = ["PROJECT_WORKSPACE", "FUNDING"] as const;

export const exported = (src: string) => [...src.matchAll(/^export async function ([a-zA-Z]+)\(/gm)].map((m) => m[1]);
export const bodyOf = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}(`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};
