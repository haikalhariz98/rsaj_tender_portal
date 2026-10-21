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
  /// Present only on an act that an administrator account may do, with the reason (NFR-SEC-004, the product owner's sweep, applied in Phase 3d): `beginAct` refuses an
  /// administrator account at every other slot, because administration is kept apart from "every transactional, approval and certification capability". These are the
  /// administrator's own configuration acts. `act-slots.test.ts` pins the list.
  administratorMay?: string;
}

/// The Malay of every label a slot is read by. A slot whose label is not here fails `act-slots.test.ts`.
export const LABEL_MS: Readonly<Record<string, string>> = {
  "Recorded by": "Direkodkan oleh",
  "Decided by": "Diputuskan oleh",
  "Verified by": "Disahkan oleh",
  "Confirmed by": "Disahkan oleh",
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
  "Completed by": "Dilengkapkan oleh",
  "Commencement supported by": "Permulaan disokong oleh",
  "Chaired by": "Dipengerusikan oleh",
  "Cancelled by": "Dibatalkan oleh",
  "Authorised by": "Dibenarkan oleh",
  "Assessed by": "Dinilai oleh",
  "Answered by": "Dijawab oleh",
  "Published by": "Diterbitkan oleh",
  "Attested by": "Disahkan oleh",
  "Share set by": "Bahagian kunci ditetapkan oleh",
  "Key changed by": "Kunci ditukar oleh",
  "Lodged by": "Diserahkan untuk simpanan oleh",
};

type SlotExtra = Partial<Pick<ActSlot, "signatureClass" | "onBehalf" | "paperGated" | "holder" | "entryPoints" | "administratorMay">>;
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
  paper("Delegation", "fromPerson", "Granted by", { administratorMay: "A delegation is recorded in Configuration, Users and roles, which an administrator keeps; it is recorded for the grantor from their letter, and an administrator is never the grantor (ADR 0034 D9). The product owner's sweep names it." }),
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
  // FR-APR-009 (Phase 3d): a conflict is declared signed, with the declarer's own password, against the matter the route belongs to; the declarer recuses from the step. Not paper-capable.
  slot("ApprovalStep", "declaredBy", "Conflict declared by", { signatureClass: true, holder: "HOLDER_CHECKED", entryPoints: ["src/app/approvals/actions.ts#escalateStep"] }),
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
  // FR-EST-005 (Phase 3d): each column of the specification panel is signed by its verifier with their own password, against the panel, in the column's capacity. Not paper-capable: the
  // signed paper form is still attached (and required), but the verification is the signatory's own sign-in (an open item for the product owner, logged with Phase 3d).
  slot("SpecPanelVerification", "person", "Verified by", { signatureClass: true, holder: "SIGNATURE", entryPoints: ["src/app/sourcing/[id]/scope/actions.ts#recordPanelVerification"] }),
  slot("CompanyEstimate", "preparer", "Prepared by"),
  slot("CompanyEstimateVersion", "preparer", "Prepared by"),
  paper("EstimateEvent", "person", "Recorded by"),
  slot("ClauseOverride", "person", "Endorsed by"),
  slot("PackAssurance", "person", "Confirmed by"),
  slot("PublicationRecord", "recordedBy", "Recorded by"),
  slot("DocumentSale", "issuedBy", "Issued by"),
  // Phase 4d (FR-AWD-010): the officer who issued an unsuccessful tenderer's notice of the outcome.
  slot("NonAwardNotice", "issuedBy", "Issued by"),
  // Phase 4e (6.14 OD-6, BD-614-31): the officer who answered a contractor's submission, the signed-in officer's own act, judged by the contract's supervision (the S.O., or a
  // representative whose letter lists contractor communication). An administrator is refused (NFR-SEC-004).
  slot("ContractorSubmission", "decidedBy", "Answered by", { holder: "TRANSACTION", entryPoints: ["src/app/documents/review-actions.ts#answerContractorSubmission"] }),
  // Phase 4e (FR-VND-014): the officer who published an announcement to the supplier board, and the one who withdrew it. Each is the signed-in holder's own act, gated by
  // `announcements.publish`; an administrator is refused as at every act outside configuration (taken in the refusing direction; an open item for the product owner).
  slot("Announcement", "publishedBy", "Published by", { holder: "TRANSACTION", entryPoints: ["src/app/suppliers/announcement-actions.ts#publishAnnouncement"] }),
  slot("Announcement", "withdrawnBy", "Withdrawn by", { holder: "TRANSACTION", entryPoints: ["src/app/suppliers/announcement-actions.ts#withdrawAnnouncement"] }),
  slot("SiteEventAttendance", "recordedBy", "Recorded by"),

  // ---- bids and opening
  slot("BidEnvelope", "receivedBy", "Received by"),
  slot("BidWithdrawal", "receivedBy", "Received by"),
  slot("BidWithdrawal", "findingBy", "Finding recorded by"),
  // The box event the second authorisation of a main opening makes is the consequence of an authorisation, which since Phase 3d is each member's own sign-in and is never
  // recorded from paper; locking the box is the officer's own too. So no box event is recorded for someone else.
  slot("BoxEvent", "person", "Recorded by"),
  slot("ValidityExtension", "recordedBy", "Recorded by"),
  slot("Opening", "startedBy", "Started by"),
  slot("Opening", "panelOverrideBy", "Panel override recorded by"),
  slot("OpeningSitting", "recordedBy", "Recorded by"),
  // Each present panel member authorises with their own password, signed in as themselves: FR-OPN-003 (the product owner's ruling of 2026-10-07 on the 2b review, applied in
  // Phase 3d). It is never recorded from paper for a member, so it is not paper-capable and the opening's page offers it to the member signed in alone.
  slot("OpeningAuthorisation", "person", "Authorised by", { signatureClass: true, holder: "UNSEAL", entryPoints: ["src/app/sourcing/[id]/opening/actions.ts#recordAuthorisation"] }),
  paper("OpenedBidInitial", "person", "Initialled by"),
  signed("OpeningSignature", "person", "Signed by", "SIGNATURE", ["src/app/sourcing/[id]/opening/actions.ts#recordSignature", "src/app/sourcing/[id]/opening/online-finalise-actions.ts#signOnlineFinalise"]),
  slot("EstimateCopyExplanation", "recordedBy", "Recorded by"),
  // Wave 3b (SR-13, ADR 0036 D3, D4, D10, D11): the named officer's act of setting their share (SHARE_SET), a recorded change of a published exercise key (REKEY), and the
  // sealed lodgement of the company estimate (LODGE_SEALED_ESTIMATE). Setting a share asks the password again (D4); steps 8 and 16 wire each act through `beginAct` with its
  // entry point and its kind of act, and until then each is on `act-wiring-scan.test.ts`'s NOT_BUILT list.
  // Wave 3b step 8 (ADR 0036 D4, ruling 20n): both ask the sign-in password again, so both are signature-class; neither is recorded from paper, and an administrator account
  // does neither (an unsealing: the officer's own key, with the officer's own passphrase).
  slot("OfficerExerciseKey", "person", "Share set by", { signatureClass: true, holder: "UNSEAL", entryPoints: ["src/app/sourcing/[id]/scope/key-actions.ts#setOfficerShare"] }),
  slot("PublishedKeyChange", "by", "Key changed by", { signatureClass: true, holder: "UNSEAL", entryPoints: ["src/app/sourcing/[id]/scope/key-actions.ts#rekeyExercise"] }),
  // Wave 3b step 17 (ADR 0036 D11, ruling 11): the departing officer releases their share to the incoming officer, asking the sign-in password again.
  slot("ShareRelease", "releasedBy", "Released by", { signatureClass: true, holder: "UNSEAL", entryPoints: ["src/app/sourcing/[id]/scope/substitution-actions.ts#releaseShareForSubstitution"] }),
  slot("SealedEstimateLodgement", "lodgedBy", "Lodged by"),

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
  // Phase 4b (FR-VND-005, CPD 2026-10-07): ONE officer checks a supplier's bank details, signing with their password, with their name and the day. Not paper-capable: the check is of the
  // statement the officer has open, and a changed profile is checked again by one officer (no second-officer step).
  slot("CreditorProfile", "verifiedBy", "Verified by", { signatureClass: true, holder: "SIGNATURE", entryPoints: ["src/app/suppliers/creditor-actions.ts#verifyCreditorProfile"] }),
  // ADR 0041 (plan 6.1), registered with the schema in step 1: the officer who sends an online application for decision (the route's requester), and the officers who verify what it
  // holds. Their acts arrive in step 4, which makes the bank-details check a signature, as `CreditorProfile.verifiedBy` is.
  slot("PortalApplication", "sentBy", "Sent by"),
  slot("PortalApplicationDocument", "verifiedBy", "Verified by"),
  slot("PortalApplicationCreditor", "verifiedBy", "Verified by"),
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
  slot("AuthorityMatrix", "issuedByPerson", "Issued by", {
    signatureClass: true,
    administratorMay: "`configuration.issue` is held through the administrator flag (ADR 0034 D8), so refusing the act would refuse every administrator the permission they hold; it still needs the password and a second person (the product owner, 2026-10-07: issuing is an administrator's act).",
  }),
  // Issuing an evaluation model (Phase 5a) is the matrix's act again: signature-class, `configuration.issue` held through the administrator flag, and by someone who did not make the draft.
  slot("EvaluationModel", "issuedBy", "Issued by", {
    signatureClass: true,
    administratorMay: "`configuration.issue` is held through the administrator flag (ADR 0034 D8), as for the approval matrix, so refusing the act would refuse every administrator the permission they hold; it still needs the password and a second person who did not make the draft (Phase 5a).",
  }),
  // NFR-AUD-006, ruling item 9 (Phase 5a): the person a back-dated signature names as authorising it confirms it, as a signature of their own. The password is asked; it is never recorded
  // from paper; an administrator account is refused as at every act outside configuration (the person named authorises a transaction, which an administrator is kept apart from).
  slot("BackdateConfirmation", "confirmedBy", "Confirmed by", { signatureClass: true, holder: "SIGNATURE", entryPoints: ["src/app/inbox/actions.ts#confirmBackdatingAction"] }),
  slot("ConfigurationChange", "proposedBy", "Proposed by", { administratorMay: "A change to configuration is proposed by an administrator or an office holder, and decided by another person (ADR 0034 D15)." }),
  // The checker's decision. Made by an administrator for some kinds (an administrator grant), so it is never refused to one: no `holder`.
  slot("ConfigurationChange", "decidedBy", "Decided by", { signatureClass: true, administratorMay: "The checker's decision on an administrator grant is made by an administrator (ADR 0034 D15)." }),
  // Wave 3b (SR-13, ADR 0036 D1, ruling 20v): who attested each deployment fact that the portal cannot check, must-have 4 (the public-copy database role) and must-have 5
  // (no core dumps or swap, HTTPS, no body logging). A STATED fact with who and when, shown as "attested, not checked by the portal" and never as a verification. Recorded
  // through the bid sealing policy's two-person path (`BID_SEALING_POLICY`, wave 3b step 7): `bid-sealing/core.ts` begins the act, named by the form (the proposer's own).
  slot("BidSealingPolicy", "publicRoleAttestedBy", "Attested by"),
  slot("BidSealingPolicy", "hardeningAttestedBy", "Attested by"),
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
  { entry: "src/app/approvals/actions.ts#moveStepsOfAbsentHolders", holder: "HOLDER_CHECKED", why: "Moves approval steps up one office (the same escalation as escalateStep) when a holder is away, from the worklist or after marking a person away." },
  // The sitting's acts (the product owner's sweep for NFR-SEC-004, Phase 3d): the Secretariat's work of a committee, which an administrator account does not do.
  // Those that attribute a person are also refused by `beginAct`; these write no slot of their own, or write it after other checks, so they ask first.
  { entry: "src/app/requisitions/actions.ts#citeGateDecision", holder: "HOLDER_CHECKED", why: "Discharges a committee gate of a requisition from the committee's decision: the same kind of act as the cite actions above, and it writes no slot." },
  { entry: "src/app/committees/actions.ts#scheduleSitting", holder: "HOLDER_CHECKED", why: "Fixes a sitting of a committee and its matters: the Secretariat's work." },
  { entry: "src/app/committees/actions.ts#editSitting", holder: "HOLDER_CHECKED", why: "Changes the date, place or agenda of a sitting: the Secretariat's work." },
  { entry: "src/app/committees/actions.ts#changeStatus", holder: "HOLDER_CHECKED", why: "Moves a sitting through its states (called, held, minuted, closed): the Secretariat's work, and it writes no slot." },
  { entry: "src/app/committees/actions.ts#saveMinutes", holder: "HOLDER_CHECKED", why: "Records the minutes of a sitting: the Secretariat's work." },
  { entry: "src/app/committees/actions.ts#recordAttendance", holder: "HOLDER_CHECKED", why: "Records who attended a sitting, which decides whether it is quorate: the Secretariat's work." },
  { entry: "src/app/committees/actions.ts#tableMatter", holder: "HOLDER_CHECKED", why: "Tables a matter before a committee (FR-CTE-006): only the Secretariat does, so an administrator account is refused before any other check." },
  { entry: "src/app/committees/actions.ts#declareRecusal", holder: "HOLDER_CHECKED", why: "A member's declaration that they take no part in a decision." },
  { entry: "src/app/committees/actions.ts#recordOutcome", holder: "HOLDER_CHECKED", why: "Records what a committee decided on a matter, and moves the matter it is about." },
  { entry: "src/app/committees/actions.ts#withdrawMatter", holder: "HOLDER_CHECKED", why: "Takes a matter off a sitting before it is decided: the Secretariat's work." },
  // Go-live R4: the schedule of tenders is published, replaced and withdrawn through the document store's own acts. A DocumentAttachment names no Person, so these have no slot.
  // They are the acts of a transaction (an administrator account does not do them), whatever record or purpose they are asked of.
  { entry: "src/app/documents/actions.ts#attachDocument", holder: "TRANSACTION", why: "Attaches a stored version to a record for a purpose, among them the schedule of tenders published on Results." },
  { entry: "src/app/documents/actions.ts#attachNewVersion", holder: "TRANSACTION", why: "Replaces the version an attachment pins with a newer one of the same document, with a reason: how a published schedule is corrected." },
  { entry: "src/app/documents/actions.ts#detachDocument", holder: "TRANSACTION", why: "Takes an attachment off its record, with a reason: how a published schedule is withdrawn." },
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
  "DocumentPurchase.receiptRecordedBy": "SR-10: mirrors DocumentSale.issuedBy of the sale this purchase made, which is the attributed act: the officer who recorded the finance receipt. Not an act of its own.",
  "PersonQualification.person": "A qualification the person holds, kept as reference data: the person is the subject of the record. Who recorded it is in the audit row.",
  "StaffAccount.person": "The binding of a sign-in account to its Person: identity, bound for good once made.",
  "OneTimeCode.issuedBy": "The issuer of a code is the signed-in actor of an account-administration act, written in the sign-in log and the audit trail.",
  "AuditEntry.actorPerson": "The audit trail itself: it records the actor.",
  "SulitAccessEvent.actorPerson": "The SULIT access log itself (Phase 3a): it records who read or was refused a value, and is append-only.",
  "DocumentAccessEvent.actorPerson": "The document access log itself (Phase 3b): it records who downloaded, checked or was refused a file, and is append-only for the app login.",
  "SealedAccessEvent.staffPerson": "An access log, not an act (wave 3b, SR-13, NFR-SEC-003, ruling 20w): the sealed access log itself records who reached or was refused sealed content, and is append-only for every login.",
  "ReportingLine.person": "The subordinate of a reporting line: the subject of a configuration record (Phase 3c). Who recorded the line is in the audit row.",
  "ReportingLine.superior": "The superior of a reporting line: the subject of a configuration record (Phase 3c). Who recorded the line is in the audit row.",
  "StaffNotice.recipient": "The person told: the subject of a notice shown in the portal (Phase 3c), not the author of an act.",
  "StaffNotice.raisedBy": "The notice itself (Phase 3c): it records which act's signed-in person caused it, and only its first reading ever changes.",
  "ActAttribution.subjectPerson": "The attribution itself.",
  "ActAttribution.recordedByPerson": "The attribution itself.",
  "BqVersion.preparer": "A designation: the officer a bill of quantities is prepared by, named in its header and checked against their qualification when the bill is finalised. Who edited the header is in the audit row, and the version's own acts (saving a line, finalising) are the editor's.",
  "ActAttribution.backdateAuthorisedByPerson": "The attribution itself: the officer a signed act's back-dating was authorised by (NFR-AUD-006), named by the actor and kept on the attribution row, which is append-only.",
  "AuthorityMatrixMaker.person": "The maker record itself: written for the signed-in actor by the draft's own edit.",
  "ConfigurationDraftMaker.person": "The maker record itself (Phase 5a): written for the signed-in actor by the edit of an evaluation model's or a rate schedule's draft, as the matrix's is.",
  "MeetingAttendance.person": "The attendee: the subject of a recorded fact (who was present), not the author of an act.",
  "Delegation.toPerson": "The delegate: who receives the authority, not who granted it. The act is the grant, whose slot is `Delegation.fromPerson`.",
  "Delegation.jobholder": "The jobholder whose authority is delegated (ruling of 2026-10-08, log line 1773): the person the grant is about, not who grants it. The act is the grant, whose slot is `Delegation.fromPerson`, and the audit row names the jobholder.",
  "SoDelegation.delegatePerson": "The delegate: who receives the authority, not who granted it. The act is the grant, whose slot is `SoDelegation.grantorPerson`.",
  "ExerciseParticipant.person": ROSTER,
  "OpeningPanelMember.person": ROSTER,
  "ExerciseOpeningOfficer.person": ROSTER,
  "ExerciseOpeningOfficer.namedBy": "The signed-in officer who named the opening officer (SR-07): written from the session by the naming action itself, and kept in the audit row with the before and after. Naming is not a signed act.",
  "ExerciseOpeningOfficer.endedBy": "The signed-in officer who took an opening officer off or replaced them (SR-07, ruling 11): written from the session, with the authority and reason on the same row and in the audit row. It is not a signed act.",
  "EvaluationTeamMember.person": ROSTER,
  "SourcingExercise.personInCharge": "A designation: the officer named in charge of the exercise, not an act.",
  "Requisition.returnedTo": "A routing target: the person a requisition is returned to, who did nothing by being named.",
  "CustodyItem.custodian": "A state: who holds an original now, changed only by a custody movement (`CustodyMovement.person`).",
};

export const slotKey = (entity: string, field: string): string => `${entity}.${field}`;

/**
 * The slots whose actor is a SUPPLIER's account, not a Person (Phase 4b, B0 of the CPD registration spec). The schema scan that holds `ACT_SLOTS` to the Person relations does not see these,
 * because their actor is a `SupplierAccount`: `supplier-act-slots.test.ts` holds them to the schema's SupplierAccount relations instead. Both are written by `attributeSupplierAct`.
 *
 * Sending a registration is ONE signature: the supplier gives their password once, and that entry signs the submission, which names the application as the exact document signed. Each
 * declaration is then a SIGNED row of its own, naming the declaration it signed, but is not itself password-bearing: one password entry signs one act (`@@unique([sessionId, stepUpAt])`),
 * so two signature-class rows from one entry would be refused. The submission's row is the proof the password was asked, and the declarations' rows say so in their reason.
 */
export const SUPPLIER_ACT_SLOTS: readonly ActSlot[] = [
  slot("SupplierApplication", "submittedBySupplierAccount", "Submitted by", { signatureClass: true }),
  slot("RegistrationDeclaration", "signedBy", "Signed by"),
  // Phase 4c: a registered supplier changes its bank details, signed with the password asked again; the profile it sends is the exact document signed, and the account that enters it is the account that sends it.
  slot("CreditorProfile", "enteredBy", "Sent by", { signatureClass: true }),
  // Phase 4e: the contractor's acts from its portal account. A submission is sent by the account (the column is the record, audited); only the STATUTORY DECLARATION is signed, with the
  // password asked again, and that is the one kind the store attributes on this slot, naming the submission as the exact document signed. The agent's attestation of a diary entry
  // (FR-SUP-007) and the contractor's block on a certificate (FR-VAR-022) are signatures, each with the password, each naming the entry or the certificate signed.
  slot("ContractorSubmission", "submittedBy", "Signed by", { signatureClass: true }),
  slot("SiteDiaryEntry", "agentAttestedBy", "Attested by", { signatureClass: true }),
  slot("CertificateSignature", "signedBySupplierAccount", "Signed by", { signatureClass: true }),
  // Wave 3b (SR-13, ADR 0036 D5, threat S11): an online submission is a signed act, with the password asked again and a SIGNED attribution written in the same transaction as
  // its envelope (build plan step 10).
  slot("OnlineBid", "submittedBy", "Submitted by", { signatureClass: true }),
  // Ruling 20ak: a withdrawal is a signed act too. One password entry signs one act, so the attribution names the submission withdrawn; an alternative withdrawn in the same act carries the same account in its column.
  slot("OnlineBid", "withdrawnBy", "Withdrawn by", { signatureClass: true }),
];

export const slotOf = (entity: string, field: string): ActSlot | undefined =>
  ACT_SLOTS.find((s) => s.entity === entity && s.field === field) ?? SUPPLIER_ACT_SLOTS.find((s) => s.entity === entity && s.field === field);

/// The signature-class slots: approve, sign or unseal.
export const SIGNATURE_SLOTS: readonly ActSlot[] = ACT_SLOTS.filter((s) => s.signatureClass);
