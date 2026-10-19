/**
 * The words of the Contracts screens that are converted to Bahasa Malaysia (NFR-LNG-001, ADR 0040, N1 step 4): the case list and its three
 * sibling views, and the case page's header, step bar, tab strip, panel headings and refusals. The Malay is drafted in this slice and is
 * not yet reviewed by the customer, so both catalogues here are DRAFTED_NOT_REVIEWED.
 *
 * What stays English on the case page (ADR 0040 Q1): the "What's next" sentence under the step bar, the page's own warning callouts, every
 * panel body and drawer form, and the messages actions return. The page is PARTLY converted and says so.
 *
 * Terms follow the shell and the earlier staff Malay: an award is "anugerah", a sourcing exercise "urusan", a requisition "permintaan".
 * "In Delay" is the contract's defined state (FR-SUP-010), drafted as "Dalam Kelewatan". A pair with `{name}` is a sentence with values.
 */

import type { AwardStatus, InstrumentKind } from "@/lib/award/types";


import type { CaseStepKey } from "./case-steps";
import { w, type Words } from "./labels";

// ------------------------------------------------------------------ the case page

/** The five steps of the step bar. */
export const CASE_STEP_WORDS: Readonly<Record<CaseStepKey, Words>> = {
  award: w("Award"),
  "before-signing": w("Before signing"),
  signing: w("Signing"),
  project: w("Project"),
  "close-out": w("Close-out"),
};

/** The tab strip of the case: its ids are `CASE_TABS`'. */
export const CASE_TAB_WORDS: Readonly<Record<string, Words>> = {
  overview: w("Overview"),
  approval: w("Approval"),
  instrument: w("Letter"),
  distribution: w("Distribution"),
  return: w("Return"),
  routing: w("Routing sheet"),
  conditions: w("Conditions"),
  securities: w("Securities and insurance"),
  formation: w("Formation"),
  baseline: w("Baseline"),
  team: w("Team"),
  site: w("Site"),
  payments: w("Payments"),
  variations: w("Variations"),
  documents: w("Documents"),
  submissions: w("Submissions"),
};

/** The second level under a tab, keyed `<tab>.<section>`. */
export const CASE_SECTION_WORDS: Readonly<Record<string, Words>> = {
  "formation.assembly": w("Assembly"),
  "formation.checks": w("Reconciliation and checks"),
  "formation.legal": w("Legal review"),
  "formation.signing": w("Signing"),
  "formation.copies": w("Copies and custody"),
  "payments.valuations": w("Valuations"),
  "payments.retention": w("Retention"),
  "payments.advance": w("Advance payment"),
  "payments.damages": w("Liquidated damages"),
  "site.start": w("Possession and progress"),
  "site.diary": w("Site diary"),
  "site.oversight": w("Oversight"),
  "site.records": w("Site records"),
  "variations.variations": w("Variations"),
  "variations.adjustments": w("Adjustments of the contract sum"),
};

/** The main button that links to the panel holding an act's drawer. */
export const CASE_LINK_ACTION_WORDS = {
  RECORD_DESPATCH: w("Record despatch"),
  RECORD_RETURN: w("Record the return"),
  LODGE_SECURITY: w("Lodge a security"),
  VERIFY_SECURITY: w("Verify securities"),
  SUBMIT_TO_LEGAL: w("Send to the legal office"),
  RECORD_SIGNATURE: w("Record the signatures"),
  RECORD_STAMPING: w("Record the stamping"),
  RECORD_POSSESSION: w("Record possession of site"),
} as const;

export const CASE_HEADER_WORDS = {
  contracts: w("Contracts"),
  contractNumber: w("Contract {number}"),
  contractDate: w("Contract Date {date}"),
  notSigned: w("Not signed"),
  forExercise: w("for"),
  stagesLabel: w("Stages of this case"),
  whatsNextOn: w("What's next on {step}:"),
  awardRestricted: w("restricted to the people named on the exercise"),
  instrument: w("Instrument"),
  caseTabs: w("Case"),
} as const;

/** The award's status (the badge before there is a contract) and the instrument's short name. */
export const AWARD_STATUS_WORDS: Readonly<Record<AwardStatus, Words>> = {
  DRAFT: w("Draft"),
  PENDING_APPROVAL: w("Awaiting approval"),
  APPROVED: w("Approved, not issued"),
  ISSUED: w("Issued"),
  ACCEPTED: w("Accepted"),
  CANCELLED: w("Cancelled"),
};
export const INSTRUMENT_SHORT_WORDS: Readonly<Record<InstrumentKind, Words>> = {
  LETTER_OF_ACCEPTANCE: w("Letter of Acceptance"),
  WORK_INDENT: w("Work indent"),
};

/** The refusals the page renders itself, and the notices that stand in for a panel. */
export const CASE_REFUSAL_WORDS = {
  conditionsRestrictedTitle: w("Adding and settling conditions is restricted"),
  conditionsRestrictedBody: w(
    "Adding and settling the award's conditions is restricted to the people named on the exercise. Their state shows on the Project overview.",
  ),
  awardStageRestrictedTitle: w("The award stage is restricted"),
  awardStageRestrictedBody: w(
    "The award stage of this exercise is restricted to the people named on it. The contract stages are open to you.",
  ),
  notJudged: w("Not judged"),
  setTimeZoneFirst: w("Set the organisation's time zone first."),
  closeOutParked: w("Parked until after go-live"),
  recordWagesCheck: w("Record the wages check"),
  verifyPolicyAbove: w("Verify the policy above first."),
  verifyPolicyFirst: w("Verify the policy first."),
  revisedSumUnreadable: w("The revised contract sum cannot be read"),
  openTheCertificate: w("Open the certificate"),
  employerSignedBy: w("The employer's amendments are signed by {office}."),
  officeNoLongerConfigured: w("an office no longer configured"),
  employerSigningNotSet: w("Employer's signing office not set"),
  employerSigningNotSetWhy: w("An amendment is still recorded, with the offices its signer held on the day."),
  employerSigningSetUnder: w("It is set under Configuration › Contract controls."),
} as const;

/** Every card heading on the case page and in the panels it renders. */
export const CASE_PANEL_TITLE_WORDS = {
  notStarted: w("Not started"),
  theContract: w("The contract"),
  readyToSign: w("Ready to sign?"),
  awardConditions: w("The award's conditions"),
  securitiesAndInsurance: w("Securities and insurance"),
  securitiesAndInsurances: w("Securities and insurances"),
  wagesCheck: w("Workmen's compensation wages check"),
  theAward: w("The award"),
  // formation
  contractDocument: w("The Contract Document"),
  reconciliation: w("Reconciliation"),
  beforeSignature: w("Before signature"),
  stampingAtLhdn: w("Stamping at LHDN"),
  integrityPact: w("Integrity Pact, Stage Three"),
  originalsInCustody: w("Originals in custody"),
  // payments
  payments: w("Payments"),
  valuationCalendar: w("Valuation calendar"),
  valuationsAndCertificates: w("Valuations and their certificates"),
  materialsOnSite: w("Materials on site"),
  nominatedParties: w("Nominated parties and assignees"),
  deductionsKeyed: w("Deductions keyed"),
  certificateAsItStands: w("The certificate as it stands"),
  retention: w("Retention"),
  advancePayments: w("Advance payments"),
  liquidatedDamages: w("Liquidated damages"),
  warningLetters: w("Warning letters"),
  // supervision
  onSite: w("On site"),
  programme: w("Programme"),
  progress: w("Progress"),
  siteDiary: w("Site diary"),
  endorsements: w("Endorsements"),
  specialSiteMeetings: w("Special site meetings"),
  complianceObservations: w("Compliance observations"),
  directionsOnProgramme: w("Directions on the programme"),
  earlyAction: w("Early action"),
  premiumsPaid: w("Premiums paid by the employer"),
  handedOver: w("Handed over"),
  // variations, baseline, documents
  contractSumAndVariations: w("The contract sum and its variations"),
  variations: w("Variations"),
  versions: w("Versions"),
  certificates: w("Certificates"),
  signatures: w("Signatures"),
  controlledCopies: w("Controlled copies"),
  legalReviewBy: w("Legal review by {office}"),
  openingPosition: w("Opening position"),
  releases: w("Releases"),
  nonCompletionDecisions: w("Non-completion decisions"),
  superintendingOfficer: w("Superintending Officer"),
  representatives: w("Representatives"),
  possessionOfSite: w("Possession of site"),
  adjustmentsOfContractSum: w("Adjustments of the contract sum"),
  theDraft: w("The draft"),
  versionInForce: w("Version {version} in force"),
  // the award's panels
  whoApproves: w("Who approves the appointment"),
  approvalOfAppointment: w("Approval of the appointment"),
  routingSheet: w("Routing sheet"),
  whoSigns: w("Who signs the instrument"),
  earlierRoutes: w("Earlier routes"),
  conditionsPrecedent: w("Conditions precedent to signing"),
  beforeWorkStarts: w("Before work starts"),
  distribution: w("Distribution"),
  documents: w("Documents"),
  contractAndCommitment: w("Contract and commitment"),
  lettersTerms: w("The letter's terms"),
  returnedItems: w("What came back (integrity pact, second stage)"),
  acceptancePage: w("The acceptance page"),
  performanceBond: w("The performance bond"),
  securitiesLodged: w("Securities lodged"),
  insurance: w("Insurance"),
} as const;

// ------------------------------------------------------------------ the case list and its sibling views

/** The chips on a case's row (`awardChips`) and the other words a row writes. */
export const CASE_CHIP_WORDS = {
  returned: w("Returned"),
  awaitingReturn: w("Awaiting return"),
  toVerify: w("{count} to verify"),
  securitiesVerified: w("Securities verified"),
  noSecuritiesLodged: w("No securities lodged"),
  noCommitmentNumber: w("No commitment number"),
  indentExpired: w("Indent expired"),
  toIssue: w("To issue"),
  withTheApprovers: w("With the approvers"),
  beingPrepared: w("Being prepared"),
} as const;

export const CASES_LIST_WORDS = {
  title: w("Contracts"),
  subtitle: w("Every award from the day it is started, then its contract, to site and close."),
  nAwarding: w("{count} awarding"),
  nSigning: w("{count} signing"),
  nOnSite: w("{count} on site"),
  nAwaitingConditions: w("{count} awaiting conditions"),
  nReadyToSign: w("{count} ready to sign"),
  nInDelay: w("{count} In Delay"),
  nStraightLine: w(", {count} on the straight-line reading"),
  stillToComeTitle: w("Still to come here"),
  stillToComeBody: w(
    "Possession of site, supervision and site records are recorded on each contract's Team and Site tabs; valuations, interim certificates, retention, the warning letter, the Certificate of Non-Completion and liquidated damages on its Payments tab; variations and the adjustment of the contract sum on its Variations tab. Still to come: extensions of time and the rest of the time and default chain; completion, defects, nominated parties and the final account. Each contract's baseline here is what they will read.",
  ),
  casesInDelay: w("Cases In Delay"),
  allCases: w("All cases"),
  delaySubtitle: w("Every contract In Delay today, judged across all of them, newest first."),
  delayBasis: w("Planned progress between the approved programme's points is read on a straight line."),
  defaultSubtitle: w("Newest first. A case begins as an award and gets a contract number when its instrument is issued."),
  commencedPending: w("Commenced pending approval ({count})"),
  securitiesExpiring: w("Securities expiring or not verified ({count})"),
  submissionsWaiting: w("Submissions waiting ({count})"),
  stagesNav: w("Stages"),
  workNav: w("Awards that need work"),
  allCount: w("All ({count})"),
  inDelayCount: w("In Delay ({count})"),
  viewCount: w("{label} ({count})"),
  validityNotSet: w("{label} (validity not set)"),
  search: w("Search by title, number or contractor"),
  noneInDelay: w("None In Delay"),
  noneHere: w("None here"),
  noCasesYet: w("No cases yet"),
  noContractInDelay: w("No contract is In Delay today."),
  noCaseAtStage: w("No case is at this stage."),
  startAward: w("An award is started from its exercise's Award tab."),
  stage: w("Stage"),
  open: w("Open"),
  colCase: w("Case"),
  colContractor: w("Contractor"),
  colValue: w("Value"),
  colStage: w("Stage"),
  colStatus: w("Status"),
  colDates: w("Dates"),
  inDelay: w("In Delay"),
  contractNumber: w("Contract {number}"),
  noContractYet: w("{reference} · no contract number yet"),
  contractDate: w("Contract Date {date}"),
  notSigned: w("Not signed"),
  completion: w("Completion {date}"),
  completionNotSet: w("Completion date not set until possession"),
  contractNotNumbered: w("Contract not yet numbered"),
  instrument: w("Instrument"),
  pageRange: w("Cases {from}–{to} of {total}. Search and the filter look within this page."),
  previous: w("Previous"),
  next: w("Next"),
  // the view of variations commenced pending approval
  commencedTitle: w("Commenced pending approval"),
  commencedSubtitle: w(
    "Work started on the S.O.'s support before the variation's approval, across every contract, oldest first. {count} in all, an estimated {amount} not yet approved.",
  ),
  allContracts: w("All contracts"),
  commencedSearch: w("Search by variation, contract or contractor"),
  none: w("None"),
  noCommenced: w("No variation has commenced pending its approval."),
  colVariation: w("Variation"),
  colContract: w("Contract"),
  colEstimate: w("Estimate"),
  colAge: w("Age"),
  variationRef: w("Variation {reference}"),
  variationUnnumbered: w("Variation (not yet numbered)"),
  contractAndContractor: w("Contract {number} · {contractor}"),
  timeZoneNotSet: w("Time zone not set"),
  oneDay: w("{count} day"),
  nDays: w("{count} days"),
  commencedOn: w("Commenced {date}"),
  variationsRange: w("Variations {from}–{to} of {total}. The totals above are over all of them."),
} as const;

/** The lodged securities and policies view (`?view=securities`). */
export const SECURITIES_VIEW_WORDS = {
  viewAttention: w("Expiring or not verified"),
  viewExpiring: w("Expiring or expired"),
  viewUnverified: w("Lodged, not verified"),
  viewAll: w("All lodged"),
  notOnList: w("Not on the approved list"),
  retiredBefore: w("Retired from the list before it was lodged"),
  onListRetired: w("On the list when lodged; retired {date}"),
  onList: w("On the approved list"),
  issuerNotRecorded: w("Issuer not recorded"),
  insurerNotRecorded: w("Insurer not recorded"),
  notRecorded: w("Not recorded"),
  awardeeAndContract: w("{awardee} · contract {number}"),
  title: w("Contracts"),
  subtitle: w("Contracts after award: formed, signed, stamped and distributed, on a fixed baseline."),
  nLodgedNotVerified: w("{count} lodged, not verified"),
  nExpiring: w("{count} expiring or expired"),
  shownNotSentTitle: w("Shown here, not sent"),
  shownNotSentBody: w(
    "Expiry reminders are worked out from the notification rule for expiring securities and shown on this register. Nothing is sent from the portal in this phase.",
  ),
  cardTitle: w("Securities expiring or not verified"),
  cardSubtitle: w(
    "Live ones first, soonest to expire first; then those long expired, then those rejected. {unverified} lodged, not verified; {expiring} expiring or expired. {reminders}. Each is lodged and verified under Before signing, in the contract's securities and insurance panel.",
  ),
  search: w("Search by contract, awardee or issuer"),
  nothingLodgedYet: w("Nothing lodged yet"),
  nothingInView: w("Nothing in this view"),
  emptyBody: w("Securities and policies are lodged on an award once its instrument is issued."),
  colSecurity: w("Security"),
  colIssuer: w("Issuer"),
  colValue: w("Value"),
  colExpires: w("Expires"),
  colStatus: w("Status"),
  showing: w("Showing {from}–{to} of {total}"),
} as const;

export const SECURITY_KIND_WORDS = {
  PERFORMANCE_BOND: w("Performance bond"),
  ADVANCE_PAYMENT_GUARANTEE: w("Advance payment guarantee"),
  DESIGN_GUARANTEE_BOND: w("Design guarantee bond"),
  RETENTION_BOND: w("Retention bond"),
} as const;
export const INSURANCE_KIND_WORDS = {
  WORKS: w("Works insurance"),
  PUBLIC_LIABILITY: w("Public liability insurance"),
  WORKMENS_COMPENSATION: w("Workmen's compensation insurance"),
  CAR: w("Contractor's all risks insurance"),
  EAR: w("Erection all risks insurance"),
} as const;
export const REGISTER_STATUS_WORDS = {
  LODGED: w("Lodged, not verified"),
  VERIFIED: w("Verified"),
  REJECTED: w("Rejected"),
} as const;

/** The expiry chip on a security (`expiryChip`) and the reminder intervals (`remindersText`). */
export const EXPIRY_WORDS = {
  expiredAgo: w("Expired {days} days ago"),
  expiresIn: w("Expires in {days} days"),
  noExpiry: w("No expiry recorded"),
  remindersAt: w("Reminders at {days} days"),
  remindersNotSet: w("Expiry reminders are not set"),
} as const;

/** The contractors' submissions view (`?view=submissions`) and the panel it shares with each contract's Submissions tab. */
export const SUBMISSIONS_WORDS = {
  nWaiting: w("{count} submissions waiting"),
  nOverdue: w("{count} past the due day"),
  overdueNotJudged: w("Overdue not judged: the time zone is not set"),
  nAnswered: w("{count} answered"),
  overdueNotJudgedTitle: w("Overdue is not judged"),
  overdueNotJudgedBody: w(
    "The organisation's time zone is not set, so no submission is called overdue. Set it under Configuration, Organisation.",
  ),
  serviceNotSetFor: w("{notSet} for {kinds}"),
  everyKind: w("every kind"),
  serviceNotSetBody: w("A submission of a kind with no service level shows no due day and is never judged overdue. Set each under "),
  postAwardControls: w("Configuration › Post-award controls"),
  waitingTitle: w("Submissions waiting"),
  waitingSubtitle: w(
    "Submissions contractors sent from their portal accounts, waiting for an answer, the longest waiting first{overdue}. {routing} The S.O. office's holders, or a representative whose letter lists contractor communication, answer each.",
  ),
  overdueUnjudged: w(", overdue is not judged because the organisation's time zone is not set"),
  overduePast: w(", {count} of them past the due day"),
  routingStatement: w("Routed inside the portal to the contract's Superintending Officer; not sent by email (INT-09)."),
  nothingWaits: w("Nothing waits for an answer"),
  nothingWaitsBody: w(
    "A contractor's programme, claim, materials list, delay notice, defects report or notice that the statutory declaration is lodged appears here when it is sent.",
  ),
  signedWithPassword: w("Signed with the contractor's password"),
  sentOn: w("sent {date}"),
  claimed: w("claimed {amount}"),
  aboutDay: w("day {day}"),
  routedTo: w("routed to {office}"),
  routedToNobody: w("routed to nobody: no Superintending Officer was assigned"),
  rangeOf: w("{from}–{to} of {total}.{note}"),
  searchLooksInPage: w(" Search and sort look within this page."),
  answered: w("Answered"),
  answeredSubtitle: w("Every submission answered, the latest sent first, with who answered it and whether it was answered by its due day."),
  searchAnswered: w("Search by contract, contractor or title"),
  nothingAnswered: w("Nothing answered yet"),
  nothingAnsweredBody: w("An answered submission is listed here."),
  colSubmission: w("Submission"),
  colContract: w("Contract"),
  colAnswer: w("Answer"),
  colService: w("Against the service level"),
  colBy: w("Answered by"),
  kindSent: w("{kind} · sent {date}"),
  contractNumber: w("Contract {number}"),
  previous: w("Previous"),
  next: w("Next"),
  // the service level of a submission (`serviceWords`)
  svcNotSet: w("{notSet}: no due day"),
  svcDueToday: w("Due today, {date}"),
  svcDueOne: w("Due {date}, {count} day left"),
  svcDueMany: w("Due {date}, {count} days left"),
  svcOverdueOne: w("Overdue: was due {date}, {count} day ago"),
  svcOverdueMany: w("Overdue: was due {date}, {count} days ago"),
  svcAnsweredNoLevel: w("Answered (no service level was set)"),
  svcAnsweredOnTime: w("Answered by its due day, {date}"),
  svcAnsweredLate: w("Answered after its due day, {date}"),
  // the answer drawer
  answerTitle: w("Answer: {label}"),
  answerDescription: w(
    "From {contractor}. Taken up means you record what it calls for on the contract's own tabs (the programme, the valuation, the delay notice); returned sends it back to the contractor with your note, which it reads in the portal. Either way the answer is shown in the portal and not sent by email.",
  ),
  answerField: w("The answer"),
  answerChoose: w("Choose"),
  answerReturned: w("Returned to the contractor"),
  answerNote: w("Note to the contractor"),
  answerNoteHint: w("Required where it is returned. Shown to the contractor."),
  answerSubmit: w("Answer"),
} as const;

