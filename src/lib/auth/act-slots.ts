/**
 * The person slots of every act in the product (ADR 0034 D12, Phase 2a): each column that names a Person because that person did, attested or
 * was recorded as doing something. Phase 2b writes every one through `attributeAct`, in the act's own transaction; until then the registry is the
 * checklist, and `act-slots.test.ts` holds it to the schema: every Person relation in `prisma/schema.prisma` is a slot here or is in
 * `NOT_AN_ACT` with its reason, and neither list names a field the schema no longer has.
 *
 * A slot is named by its model (`entity`) and the relation's field name (`field`), which is also the `slot` written to `ActAttribution`.
 *
 * `signatureClass` marks an act that approves, signs or unseals. Such an act needs the password again (`stepUp`) when signed, and
 * `acts.recordOnBehalf`, a paper reference and `SecurityPolicy.paperSignatureRecording = ALLOWED` when recorded from paper. The
 * list below is the one the programme names (the award signatory, contract signing, certificate blocks, the decision of an approval step,
 * the opening authorisation and signature, the Superintending Officer's decisions); Phase 2b revisits it act by act.
 *
 * `entryPoints` names the server actions that perform the act as `path#function`, where they refuse an administrator account (`staffForAct`; for a
 * route handler `staffRoute({ holder })`): a source scan (`act-slots.test.ts`) holds each to asking first. A slot that names a `holder` must name at least
 * one entry point, or the registry would claim a refusal nothing makes (review of Phase 2a). Phase 2b adds the rest as it rewrites each act.
 *
 * Each slot has its label in both languages (`LABEL_MS`): the shared attribution component of Phase 2b is the first place a slot is read aloud.
 *
 * `onBehalf` marks the slots whose act may be recorded for someone else, from a paper record (ADR 0034 D12): decisions, endorsements and signatures, where
 * the person who decided is not the officer entering it. Every other slot is the actor's own: the officer who received the bid, started the opening or
 * recorded the payment is the signed-in officer, with no picker (Phase 2b: "Person pickers remain only on acts genuinely recorded from paper").
 */

import type { AdministratorAct } from "./administration-conflict";

export interface ActSlot {
  entity: string;
  field: string;
  /// "Decided by": the phrase that precedes the person's name where the act is shown.
  label: string;
  /// The same, in Malay.
  ms: string;
  signatureClass: boolean;
  /// Whether the act may be recorded on someone's behalf from a paper record. Signature-class acts that are, need `acts.recordOnBehalf`, a paper reference and
  /// the organisation's `paperSignatureRecording = ALLOWED`; the others need the paper or the reason.
  onBehalf: boolean;
  /// An act that is not a signature but moves money, time or authority (a valuation, a payment, a retention release, a warning that leads to damages, an extension,
  /// a delegation): recorded for someone else it needs `acts.recordOnBehalf` and the paper's reference, as a signature does, though not the organisation's paper
  /// switch (which is the signature's). The conservative default of an open item for the product owner (decisions log, Phase 2b review): until it is ruled, a bare
  /// reason does not let any officer record the S.O.'s payment for them.
  paperGated: boolean;
  /// What kind of act an administrator account is refused at. Absent where an administrator may do the act (the checker's decision on an administrator
  /// grant, the issue of an approval matrix: both are administrator acts, ADR 0034 D8) or where it is not wired yet. Present only with `entryPoints`.
  holder?: AdministratorAct;
  entryPoints?: readonly string[];
}

/// The Malay of every label a slot is read by. A slot whose label is not here fails `act-slots.test.ts`.
export const LABEL_MS: Readonly<Record<string, string>> = {
  "Recorded by": "Direkodkan oleh",
  "Decided by": "Diputuskan oleh",
  "Verified by": "Disahkan oleh",
  "Signed by": "Ditandatangani oleh",
  "Requested by": "Dimohon oleh",
  "Granted by": "Diberi oleh",
  "Submitted by": "Dihantar oleh",
  "Raised by": "Ditimbulkan oleh",
  "Prepared by": "Disediakan oleh",
  "Issued by": "Dikeluarkan oleh",
  "Endorsed by": "Disokong oleh",
  "Checked by": "Disemak oleh",
  "Withdrawn by": "Ditarik balik oleh",
  "Valued by": "Dinilai oleh",
  "Started by": "Dimulakan oleh",
  "Sent by": "Dihantar oleh",
  "Reviewed by": "Dikaji semula oleh",
  "Received by": "Diterima oleh",
  "Closed by": "Ditutup oleh",
  "Warned by": "Diberi amaran oleh",
  "Wages check recorded by": "Semakan upah direkodkan oleh",
  "Vote cast by": "Undi diberikan oleh",
  "Tabled by": "Dibentangkan oleh",
  "Split check overridden by": "Semakan pemecahan diatasi oleh",
  "Signed for the employer by": "Ditandatangani bagi pihak majikan oleh",
  "Shortlisted by": "Disenarai pendek oleh",
  "Scrutinised by": "Diteliti oleh",
  "Scored by": "Dimarkahkan oleh",
  "Return received by": "Pulangan diterima oleh",
  "Report issued by": "Laporan dikeluarkan oleh",
  "Rendered by": "Dijana oleh",
  "Released by": "Dilepaskan oleh",
  "Rejection route chosen by": "Laluan penolakan dipilih oleh",
  "Recusal declared by": "Penarikan diri diisytiharkan oleh",
  "Recommended by": "Disyorkan oleh",
  "Proposed by": "Dicadangkan oleh",
  "Proposal reviewed by": "Cadangan dikaji semula oleh",
  "Passed on by": "Disampaikan oleh",
  "Panel override recorded by": "Pengecualian panel direkodkan oleh",
  "Overridden by": "Diatasi oleh",
  "Originated by": "Dimulakan asalnya oleh",
  "Opened by": "Dibuka oleh",
  "Observed by": "Diperhatikan oleh",
  "Moved by": "Dipindahkan oleh",
  "Kept by": "Disimpan oleh",
  "Inputs recorded by": "Input direkodkan oleh",
  "Initialled by": "Diparaf oleh",
  "Hold released by": "Tahanan dilepaskan oleh",
  "Hold placed by": "Tahanan dikenakan oleh",
  "Handed over by": "Diserahkan oleh",
  "Formed by": "Dibentuk oleh",
  "Finding recorded by": "Dapatan direkodkan oleh",
  "Directed by": "Diarahkan oleh",
  "Determined by": "Ditentukan oleh",
  "Decided by the Superintending Officer": "Diputuskan oleh Pegawai Penguasa",
  "Corrected by": "Dibetulkan oleh",
  "Contract type overridden by": "Jenis kontrak diatasi oleh",
  "Conflict declared by": "Konflik diisytiharkan oleh",
  "Confirmed by": "Disahkan oleh",
  "Completed by": "Dilengkapkan oleh",
  "Commencement supported by": "Permulaan disokong oleh",
  "Chaired by": "Dipengerusikan oleh",
  "Cancelled by": "Dibatalkan oleh",
  "Authorised by": "Dibenarkan oleh",
  "Assessed by": "Dinilai oleh",
  "Answered by": "Dijawab oleh",
};

type SlotExtra = Partial<Pick<ActSlot, "signatureClass" | "onBehalf" | "paperGated" | "holder" | "entryPoints">>;
const slot = (entity: string, field: string, label: string, extra: SlotExtra = {}): ActSlot => ({
  entity,
  field,
  label,
  ms: LABEL_MS[label] ?? "",
  signatureClass: false,
  onBehalf: false,
  paperGated: false,
  ...extra,
});
/// A signature-class act: it may also be recorded from paper.
const signed = (entity: string, field: string, label: string, holder: AdministratorAct, entryPoints: readonly string[]): ActSlot =>
  slot(entity, field, label, { signatureClass: true, onBehalf: true, holder, entryPoints });
/// An act only the holder of an office may do, that is not a signature.
const held = (entity: string, field: string, label: string, entryPoints: readonly string[], holder: AdministratorAct = "HOLDER_CHECKED"): ActSlot => slot(entity, field, label, { holder, entryPoints });
/// A decision, endorsement, confirmation or record that is not a signature but may come from a paper record: the person it is attributed to (an S.O. or a
/// representative, a signatory, a member) may not be the officer entering it. The 6.13 contract acts are all of this kind: they are recorded for the S.O. or
/// a representative, judged on the capacity that person holds on the day.
const paper = (entity: string, field: string, label: string, extra: SlotExtra = {}): ActSlot => slot(entity, field, label, { onBehalf: true, ...extra });

/// A paper-capable act that moves money, time or authority: recorded for someone else it needs the permission and the paper's reference (`paperGated`).
const gated = (entity: string, field: string, label: string, extra: SlotExtra = {}): ActSlot => paper(entity, field, label, { paperGated: true, ...extra });

export const ACT_SLOTS: readonly ActSlot[] = [
  // ---- committees and approvals
  slot("CommitteeDecision", "tabledBy", "Tabled by"),
  paper("DecisionRecusal", "person", "Recusal declared by"),
  paper("Vote", "person", "Vote cast by", { holder: "HOLDER_CHECKED", entryPoints: ["src/app/api/committees/decisions/[id]/votes/route.ts#POST"] }),
  // The grantor is named in the form: the signed-in person, or another whose delegation is recorded from their letter.
  // Not gated: the configuration editor that records it is an administrator's, and an administrator account never holds `acts.recordOnBehalf` (it is grant-only), so gating
  // would end the editor's ordinary use. The check that matters is `faultsIn`'s: the officer keying it is never its delegate.
  paper("Delegation", "fromPerson", "Granted by"),
  paper("Requisition", "requestingPerson", "Requested by"),
  paper("RequisitionEndorsement", "person", "Endorsed by"),
  slot("RequisitionSplitCheck", "overriddenBy", "Split check overridden by"),
  slot("ApprovalInstance", "submittedBy", "Submitted by"),
  slot("ApprovalInstance", "rejectionChosenBy", "Rejection route chosen by"),
  signed("ApprovalStep", "decidedBy", "Decided by", "HOLDER_CHECKED", [
    "src/app/requisitions/actions.ts#recordDecision",
    "src/app/sourcing/actions.ts#recordNameDecision",
    "src/app/sourcing/[id]/documents/actions.ts#recordTenderingDecision",
    "src/app/sourcing/[id]/evaluation/meeting-actions.ts#recordNegotiationDecision",
    "src/app/sourcing/[id]/window/change-actions.ts#recordWindowChangeDecision",
    "src/app/suppliers/actions.ts#decideRegistrationStep",
    "src/app/awards/actions.ts#decideAppointmentStep",
    "src/app/projects/[id]/certificates/[certId]/actions.ts#decideCertificateRouteStep",
    "src/app/projects/[id]/variation-actions.ts#decideVariationApprovalStep",
    "src/app/projects/[id]/matter-actions.ts#decideContractMatterStep",
    "src/app/suppliers/link-actions.ts#decidePermissionStep",
    "src/app/suppliers/standing-actions.ts#decideStandingStep",
  ]),
  held("ApprovalStep", "declaredBy", "Conflict declared by", ["src/app/approvals/actions.ts#escalateStep"]),
  slot("SourcingExercise", "overriddenBy", "Contract type overridden by"),
  slot("SourcingExercise", "proposalReviewer", "Proposal reviewed by"),

  // ---- awards, securities, insurance
  signed("Award", "signatoryPerson", "Signed by", "SIGNATURE", ["src/app/awards/actions.ts#issueAward"]),
  slot("AwardReturn", "receivedBy", "Return received by"),
  slot("SecurityInstrument", "verifiedBy", "Verified by"),
  slot("InsurancePolicy", "verifiedBy", "Verified by"),
  slot("InsurancePolicy", "wcCheckedBy", "Wages check recorded by"),

  // ---- documents
  slot("DocumentVersion", "recordedBy", "Recorded by"),
  slot("LegalHold", "placedBy", "Hold placed by"),
  slot("LegalHold", "releasedBy", "Hold released by"),

  // ---- scope, estimates and the tender pack
  slot("RateSchedule", "issuedBy", "Issued by"),
  slot("SpecPanelVerification", "person", "Verified by"),
  slot("CompanyEstimate", "preparer", "Prepared by"),
  slot("CompanyEstimateVersion", "preparer", "Prepared by"),
  paper("EstimateEvent", "person", "Recorded by"),
  slot("ClauseOverride", "person", "Endorsed by"),
  slot("PackAssurance", "person", "Confirmed by"),
  slot("PublicationRecord", "recordedBy", "Recorded by"),
  slot("DocumentSale", "issuedBy", "Issued by"),
  slot("SiteEventAttendance", "recordedBy", "Recorded by"),

  // ---- bids and opening
  slot("BidEnvelope", "receivedBy", "Received by"),
  slot("BidWithdrawal", "receivedBy", "Received by"),
  slot("BidWithdrawal", "findingBy", "Finding recorded by"),
  // The box event the second authorisation of a main opening makes is the consequence of an act that may be recorded from paper, so it can be too; locking the box itself is the officer's own (`onBehalf: false` at `lockBox`).
  paper("BoxEvent", "person", "Recorded by"),
  slot("ValidityExtension", "recordedBy", "Recorded by"),
  slot("Opening", "startedBy", "Started by"),
  slot("Opening", "panelOverrideBy", "Panel override recorded by"),
  slot("OpeningSitting", "recordedBy", "Recorded by"),
  signed("OpeningAuthorisation", "person", "Authorised by", "UNSEAL", ["src/app/sourcing/[id]/opening/actions.ts#recordAuthorisation"]),
  paper("OpenedBidInitial", "person", "Initialled by"),
  signed("OpeningSignature", "person", "Signed by", "SIGNATURE", ["src/app/sourcing/[id]/opening/actions.ts#recordSignature"]),
  slot("EstimateCopyExplanation", "recordedBy", "Recorded by"),

  // ---- evaluation
  slot("Evaluation", "startedBy", "Started by"),
  slot("Evaluation", "issuedBy", "Report issued by"),
  slot("Evaluation", "cancelledBy", "Cancelled by"),
  slot("EvaluationBidder", "correctedBy", "Corrected by"),
  slot("EvaluationBidder", "shortlistedBy", "Shortlisted by"),
  slot("EvaluationBidder", "inputsRecordedBy", "Inputs recorded by"),
  slot("EvaluationScore", "scoredBy", "Scored by"),
  slot("StageSubmission", "submittedBy", "Submitted by"),
  slot("AspectAssessment", "assessedBy", "Assessed by"),
  slot("NegotiationRequest", "requestedBy", "Requested by"),
  slot("EvaluationMeeting", "openedBy", "Opened by"),
  slot("EvaluationMeeting", "closedBy", "Closed by"),
  slot("TendererCommunication", "recordedBy", "Recorded by"),
  slot("Recommendation", "formedBy", "Formed by"),
  slot("ProposalPaper", "renderedBy", "Rendered by"),
  paper("ProposalPaper", "checkedBy", "Checked by"),
  paper("ProposalPaper", "recommendedBy", "Recommended by"),

  // ---- the supplier register
  slot("SupplierApplication", "recordedBy", "Recorded by"),
  slot("SupplierApplication", "submittedBy", "Sent by"),
  slot("PortalApplication", "decidedBy", "Decided by"),
  // The last registration step's approval may be recorded from paper, and the decision it makes is its consequence; a resubmission or a rejection is the officer's own (`onBehalf: false` at `decideApplication`).
  paper("ApplicationDecision", "decidedBy", "Decided by"),
  slot("SupplierDocument", "recordedBy", "Recorded by"),
  slot("SupplierDocument", "verifiedBy", "Verified by"),
  slot("StandingRequest", "requestedBy", "Requested by"),
  slot("StandingRequest", "withdrawnBy", "Withdrawn by"),
  slot("StandingEvent", "recordedBy", "Recorded by"),
  slot("StandingEvent", "withdrawnBy", "Withdrawn by"),
  slot("SpecialPermission", "requestedBy", "Requested by"),
  slot("SpecialPermission", "grantedBy", "Granted by"),

  // ---- contract formation and certificates
  slot("ContractReconciliation", "checkedBy", "Checked by"),
  signed("ReconciliationAmendment", "officer", "Signed for the employer by", "SIGNATURE", ["src/app/projects/[id]/actions.ts#addAmendment"]),
  slot("FormationCheck", "completedBy", "Completed by"),
  slot("LegalReview", "submittedBy", "Submitted by"),
  paper("LegalReview", "reviewer", "Reviewed by"),
  signed("ContractSignature", "person", "Signed by", "SIGNATURE", ["src/app/projects/[id]/actions.ts#recordRsajSignature"]),
  paper("CustodyMovement", "person", "Moved by"),
  signed("CertificateSignature", "person", "Signed by", "SIGNATURE", ["src/app/projects/[id]/certificates/[certId]/actions.ts#recordCertificateSignature"]),
  slot("CertificateOverride", "person", "Overridden by"),
  paper("RoutingCheck", "person", "Checked by"),

  // ---- 6.13: supervision, payment, time, variations
  gated("SoDelegation", "grantorPerson", "Granted by"),
  paper("Possession", "recordedBy", "Recorded by"),
  paper("WorkProgramme", "scrutinisedBy", "Scrutinised by"),
  signed("WorkProgramme", "decidedBy", "Decided by", "HOLDER_CHECKED", ["src/app/projects/[id]/supervision-actions.ts#decideProgramme"]),
  paper("ProgressRecord", "recordedBy", "Recorded by"),
  paper("SiteDiaryEntry", "officer", "Kept by"),
  signed("DiaryEndorsement", "person", "Endorsed by", "SIGNATURE", ["src/app/projects/[id]/supervision-actions.ts#endorseDiary"]),
  paper("SiteMeeting", "chair", "Chaired by"),
  paper("ComplianceObservation", "person", "Observed by"),
  paper("ProgrammeDirection", "person", "Directed by"),
  gated("PendingDeduction", "person", "Recorded by"),
  gated("EarlyActionDecision", "person", "Decided by"),
  paper("SiteRecordsHandover", "person", "Handed over by"),
  paper("OpeningPosition", "person", "Recorded by"),
  paper("PaymentCalendar", "person", "Recorded by"),
  gated("InterimValuation", "person", "Valued by"),
  gated("RetentionRelease", "person", "Released by"),
  gated("AdvancePayment", "person", "Recorded by"),
  gated("FinancePayment", "person", "Recorded by"),
  gated("LadWarning", "person", "Warned by"),
  signed("NonCompletion", "person", "Decided by", "HOLDER_CHECKED", ["src/app/projects/[id]/payment-actions.ts#recordNonCompletion"]),
  paper("ContractMatter", "person", "Recorded by"),
  paper("DelayNotice", "person", "Recorded by"),
  signed("EotClaim", "determinedBy", "Determined by", "HOLDER_CHECKED", ["src/app/projects/[id]/time-actions.ts#determineEotClaim"]),
  paper("EotClaim", "person", "Recorded by"),
  // The answer to the claim (the pack, the delay, the completion date) is its own act, with its own slot (product owner's ruling, 2026-10-07): an answer with no loss-and-expense
  // estimate writes no `LossExpenseClaim`, so there was no row to carry who answered. The flags are those of `LossExpenseClaim.person`, which the same act writes when an estimate is
  // given: paper-capable, not gated, so one answer is judged the same whether or not it carries an estimate.
  paper("EotClaim", "answeredBy", "Answered by"),
  gated("ExtensionOfTime", "person", "Granted by"),
  gated("LossExpenseClaim", "valuedBy", "Valued by"),
  paper("LossExpenseClaim", "person", "Recorded by"),
  gated("PeriodExtension", "person", "Recorded by"),
  gated("PeriodAgreement", "person", "Raised by"),
  gated("LadWaiver", "person", "Recorded by"),
  paper("Variation", "originator", "Originated by"),
  paper("Variation", "reviewedBy", "Reviewed by"),
  paper("Variation", "principal", "Passed on by"),
  signed("Variation", "soDecidedBy", "Decided by the Superintending Officer", "HOLDER_CHECKED", ["src/app/projects/[id]/variation-actions.ts#decideVariation"]),
  paper("Variation", "commencedSupport", "Commencement supported by"),
  paper("Variation", "closedBy", "Closed by"),
  paper("VariationApproval", "sentBy", "Sent by"),
  paper("VariationInstruction", "person", "Recorded by"),
  paper("VariationMeasurement", "person", "Recorded by"),
  paper("DayworkRecord", "person", "Recorded by"),
  paper("VariationCertificate", "person", "Raised by"),
  gated("SumAdjustment", "person", "Raised by"),

  // ---- configuration that is decided by a second person or issued (Phase 2c)
  // Issuing a matrix is signature-class (the password is asked), but it is an administrator act: `configuration.issue` is held through the administrator flag
  // (ADR 0034 D8), so it has no `holder`. An open item for the product owner (review of Phase 2a, in the decisions log): whether it is that, or an office
  // holder's signature, which would make `configuration.issue` grant-only.
  slot("AuthorityMatrix", "issuedByPerson", "Issued by", { signatureClass: true }),
  slot("ConfigurationChange", "proposedBy", "Proposed by"),
  // The checker's decision. Made by an administrator for some kinds (an administrator grant), so it is never refused to one: no `holder`.
  slot("ConfigurationChange", "decidedBy", "Decided by", { signatureClass: true }),
];

/**
 * Entry points an administrator account is refused that attribute no Person slot: they discharge a step of an approval route from a committee's
 * decision (`cite*Decision`), which writes the committee's outcome and not a person's, so there is no slot to hang them on (an open item for the
 * product owner: whether citing is a holder-checked act at all). The default is the restrictive one, and it locks out no office holder.
 * Held to the same scan as the slots' entry points.
 */
export const OTHER_HOLDER_ENTRY_POINTS: readonly { entry: string; holder: AdministratorAct; why: string }[] = [
  { entry: "src/app/requisitions/actions.ts#citeCommitteeDecision", holder: "HOLDER_CHECKED", why: "Discharges a committee step of a requisition's approval route." },
  { entry: "src/app/sourcing/actions.ts#citeNameDecision", holder: "HOLDER_CHECKED", why: "Discharges a committee step of the route that names a sourcing exercise's method." },
  { entry: "src/app/awards/actions.ts#citeAppointmentDecision", holder: "HOLDER_CHECKED", why: "Discharges a committee step of an award's appointment route." },
  { entry: "src/app/projects/[id]/matter-actions.ts#citeContractMatterDecision", holder: "HOLDER_CHECKED", why: "Discharges a committee step of a contract matter's route." },
  { entry: "src/app/projects/[id]/variation-actions.ts#citeVariationCommittee", holder: "HOLDER_CHECKED", why: "Discharges a committee step of a variation's route." },
];

/**
 * Person relations that are not acts, each with the reason. Not an exemption: a relation here is accounted for, and a new Person relation that is
 * in neither list fails the scan. Each reason says why no attribution row is wanted: the person is the subject of a record, a designation or a
 * state, or the row is itself the record of who acted.
 */
const CONFIGURATION = "Configuration: who holds it is policy, changed only through the configuration editors, audited with the signed-in actor and (from Phase 5) decided by a second person.";
const ROSTER = "A roster entry: it names who sits or takes part, not who did something. Who put them there is in the audit row.";

export const NOT_AN_ACT: Readonly<Record<string, string>> = {
  "RoleAssignment.person": CONFIGURATION,
  "CommitteeMember.person": CONFIGURATION,
  "OrgUnit.headPerson": CONFIGURATION,
  "CostCentre.ownerPerson": CONFIGURATION,
  "BudgetCode.holderPerson": CONFIGURATION,
  "PersonQualification.person": "A qualification the person holds, kept as reference data: the person is the subject of the record. Who recorded it is in the audit row.",
  "StaffAccount.person": "The binding of a sign-in account to its Person: identity, bound for good once made.",
  "OneTimeCode.issuedBy": "The issuer of a code is the signed-in actor of an account-administration act, written in the sign-in log and the audit trail.",
  "AuditEntry.actorPerson": "The audit trail itself: it records the actor.",
  "SulitAccessEvent.actorPerson": "The SULIT access log itself (Phase 3a): it records who read or was refused a value, and is append-only.",
  "DocumentAccessEvent.actorPerson": "The document access log itself (Phase 3b): it records who downloaded, checked or was refused a file, and is append-only for the app login.",
  "ReportingLine.person": "The subordinate of a reporting line: the subject of a configuration record (Phase 3c). Who recorded the line is in the audit row.",
  "ReportingLine.superior": "The superior of a reporting line: the subject of a configuration record (Phase 3c). Who recorded the line is in the audit row.",
  "StaffNotice.recipient": "The person told: the subject of a notice shown in the portal (Phase 3c), not the author of an act.",
  "StaffNotice.raisedBy": "The notice itself (Phase 3c): it records which act's signed-in person caused it, and only its first reading ever changes.",
  "ActAttribution.subjectPerson": "The attribution itself.",
  "ActAttribution.recordedByPerson": "The attribution itself.",
  "BqVersion.preparer": "A designation: the officer a bill of quantities is prepared by, named in its header and checked against their qualification when the bill is finalised. Who edited the header is in the audit row, and the version's own acts (saving a line, finalising) are the editor's.",
  "ActAttribution.backdateAuthorisedByPerson": "The attribution itself: the officer a signed act's back-dating was authorised by (NFR-AUD-006), named by the actor and kept on the attribution row, which is append-only.",
  "AuthorityMatrixMaker.person": "The maker record itself: written for the signed-in actor by the draft's own edit.",
  "MeetingAttendance.person": "The attendee: the subject of a recorded fact (who was present), not the author of an act.",
  "Delegation.toPerson": "The delegate: who receives the authority, not who granted it. The act is the grant, whose slot is `Delegation.fromPerson`.",
  "SoDelegation.delegatePerson": "The delegate: who receives the authority, not who granted it. The act is the grant, whose slot is `SoDelegation.grantorPerson`.",
  "ExerciseParticipant.person": ROSTER,
  "OpeningPanelMember.person": ROSTER,
  "EvaluationTeamMember.person": ROSTER,
  "SourcingExercise.personInCharge": "A designation: the officer named in charge of the exercise, not an act.",
  "Requisition.returnedTo": "A routing target: the person a requisition is returned to, who did nothing by being named.",
  "CustodyItem.custodian": "A state: who holds an original now, changed only by a custody movement (`CustodyMovement.person`).",
};

export const slotKey = (entity: string, field: string): string => `${entity}.${field}`;

export const slotOf = (entity: string, field: string): ActSlot | undefined => ACT_SLOTS.find((s) => s.entity === entity && s.field === field);

/// The signature-class slots: approve, sign or unseal.
export const SIGNATURE_SLOTS: readonly ActSlot[] = ACT_SLOTS.filter((s) => s.signatureClass);
