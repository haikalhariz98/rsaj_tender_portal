/**
 * RSAJ starter pack, purchasing (plan step 4.4): the funding routes, the sourcing methods with what each asks of an exercise, the contract
 * types and bases, the selected-tender proposal, the company estimate's lead time, the tender and quotation document parts in printed order,
 * the publication channels, the window rules, online sale, the four qualitative aspects, the two scope switches, and the six-stage tender and
 * five-phase quotation evaluation models AS DRAFTS (ADR 0043 D2). Transcribed from docs/requirements (the specification and Sourcing
 * Requirements v2, which overrides it where they differ). Each entry cites its requirement and clause.
 *
 * Only what the documents state is set. A behaviour they leave open (a contract type's downstream behaviours, a funding route's budget
 * commitment, which methods a committee gate holds) stays unset, and the screens say so. The evaluation models are what FR-EVL-008 to 012
 * transcribe from the forms in use: practice, not policy (decision D1), so they are OBSERVED, and a person completes and confirms them.
 */

import type { PackModelDraft } from "../../../src/lib/starter/types";
import type { BandSnap, CriterionSnap, StageSnap } from "../../../src/lib/evaluation/model";

import { group, list, ref, type Cited } from "./shape";

// ------------------------------------------------------------------ funding routes (FR-REQ-004 to 006)

const FUNDING = { requirement: "FR-REQ-004, FR-REQ-005, FR-REQ-006", source: "OM/P/004 8.2, 8.3, 8.5; OM/P/001 8.1–8.5; OM/P/003 8.1–8.8; DAL §1.4" };
/// FR-REQ-006: F3, F4 and F5 are government-funded, and government guidelines supersede the DAL where they differ. FR-REQ-005: F4 and F5
/// are supervision only (no RSAJ sourcing, evaluation or award); under F3 PAAB decides the route and nothing proceeds before a Project
/// Execution Letter.
export const FUNDING_ROUTES = list("FundingRoute", "Funding route", [
  { code: "F1", values: { nameEn: "F1 Ranhill SAJ OPEX" }, ...FUNDING },
  { code: "F2", values: { nameEn: "F2 Ranhill SAJ CAPEX" }, ...FUNDING },
  { code: "F3", values: { nameEn: "F3 PAAB CAPEX", routeDecidedExternally: true, supersedesAuthority: true, requiresExternalAuthorityRef: true, externalAuthorityRefLabel: "Project Execution Letter" }, ...FUNDING },
  { code: "F4", values: { nameEn: "F4 Government KKDW", organisationProcures: false, supersedesAuthority: true }, ...FUNDING },
  { code: "F5", values: { nameEn: "F5 Government agency or developer own funding", organisationProcures: false, supersedesAuthority: true }, ...FUNDING },
]);

// ------------------------------------------------------------------ contract types and bases (FR-MTD-011, FR-MTD-013, FR-DOC-002)

export const CONTRACT_TYPES = list("ContractType", "Contract type", [
  { code: "work", values: { nameEn: "Work" }, requirement: "FR-MTD-011", source: "KP002/003/004 5.1.2, 5.5, 5.9, 5.10" },
  { code: "service", values: { nameEn: "Service" }, requirement: "FR-MTD-011", source: "KP002/003/004 5.1.2, 5.5, 5.9, 5.10" },
  { code: "supply", values: { nameEn: "Supply" }, requirement: "FR-MTD-011", source: "KP002/003/004 5.1.2, 5.5, 5.9, 5.10" },
]);

const BASIS = { requirement: "FR-MTD-013, FR-DOC-002", source: "SK001 3.1(a),(b), 7.3.1(a),(b); SK004 §3.2" };
export const CONTRACT_BASES = list("ContractBasis", "Contract basis", [
  { code: "bq", values: { nameEn: "Bills of Quantities", requiresBq: true, requiresBqProvenance: "STATED", standardFormLabel: "JKR 203A, or the Ranhill SAJ Standard Form of Contract to Be Used Where Bills of Quantities Form Part of the Contract" }, ...BASIS },
  { code: "ds", values: { nameEn: "Drawings and Specification", requiresBq: false, requiresBqProvenance: "STATED", standardFormLabel: "JKR 203, or the Ranhill SAJ Standard Form of Contract to Be Used Where Drawings and Specification Form Part of the Contract" }, ...BASIS },
]);

// ------------------------------------------------------------------ sourcing methods (FR-MTD-004 to 010)

const MTD = "FR-MTD-004";
/// B.4 "Direct purchase (proprietary and emergency)" bands every value, from up to RM500 to above RM5 million.
const ANY_VALUE = { availableBelow: true, availableInQuotation: true, availableInTender: true } as const;
/// FR-DOC-001 and 013: a tender assembles the tender pack, a quotation the nine-part quotation pack.
const TENDER_PACK = { documentPackKind: "TENDER", documentPackKindProvenance: "STATED" } as const;
const QUOTATION_PACK = { documentPackKind: "QUOTATION", documentPackKindProvenance: "STATED" } as const;
/// FR-EST-006 (SK003 7.2.2(b)): a tender or quotation is judged against the company estimate.
const ESTIMATE = { requiresCompanyEstimate: true, requiresCompanyEstimateProvenance: "STATED" } as const;
const opening = (code: "TOC" | "QOC") => ({ openingCommitteeCode: code, openingCommitteeProvenance: "STATED" }) as const;

export const SOURCING_METHODS = list("SourcingMethod", "Sourcing method", [
  {
    code: "open_tender",
    values: { nameEn: "Open tender", availableInTender: true, defaultInTender: true, requiresAdvertisement: true, committeeCode: "TBC", authorityMethodKey: "open_selective", ...TENDER_PACK, ...ESTIMATE, ...opening("TOC") },
    requirement: `${MTD}, FR-MTD-005, FR-ADV-001, FR-DOC-001, FR-EST-006, FR-OPN-001`,
    source: "DAL §3.1.4.2 item 2, §3.1.4.4 item 2; SK002 7.3.1, 7.4.1; SK001 7.3.1; SK003 7.2.2(b)",
  },
  {
    code: "selected_tender",
    values: {
      nameEn: "Selected tender",
      availableInTender: true,
      invitesNamedSuppliers: true,
      requiresJustification: true,
      justificationPrompt: "The skilled workers' expertise that justifies a selected tender rather than an open one.",
      requiresProposal: true,
      requiresNameApproval: true,
      restrictedAccess: true,
      committeeCode: "TBC",
      authorityMethodKey: "open_selective",
      ...TENDER_PACK,
      ...ESTIMATE,
      ...opening("TOC"),
    },
    requirement: `${MTD}, FR-MTD-005, FR-MTD-006, FR-MTD-007, FR-MTD-008, FR-ADV-002, FR-DOC-001, FR-EST-006, FR-OPN-001`,
    source: "DAL §3.1.4.2 item 2, §3.1.4.4 items 2 and 4; SK002 7.3.1, 7.3.2, 7.3.4, 7.4.1; SK003 7.2.2(b)",
  },
  {
    code: "open_quotation",
    values: { nameEn: "Open quotation", availableInQuotation: true, requiresAdvertisement: true, committeeCode: "QC", authorityMethodKey: "open_selective", ...QUOTATION_PACK, ...ESTIMATE, ...opening("QOC") },
    requirement: `${MTD}, FR-DOC-013, FR-EST-006, FR-OPN-001`,
    source: "DAL §3.1.4.2 item 2, §3.1.4.3 item 2; OM/P/005 §3.2 (the quotation notice); SK003 7.2.2(b)",
  },
  {
    code: "selective_quotation",
    values: { nameEn: "Selective quotation", availableInQuotation: true, invitesNamedSuppliers: true, requiresNameApproval: true, committeeCode: "QC", authorityMethodKey: "open_selective", ...QUOTATION_PACK, ...ESTIMATE, ...opening("QOC") },
    requirement: `${MTD}, FR-MTD-008, FR-DOC-013, FR-EST-006, FR-OPN-001`,
    source: "DAL §3.1.4.2 item 2, §3.1.4.3 items 2 and 4; SK003 7.2.2(b)",
  },
  { code: "direct_appointment", values: { nameEn: "Direct appointment", ...ANY_VALUE, requiresDossier: true, authorityMethodKey: "direct" }, requirement: `${MTD}, FR-MTD-009`, source: "DAL §3.1.4.2 item 1" },
  { code: "selective_direct_appointment", values: { nameEn: "Selective direct appointment", ...ANY_VALUE, authorityMethodKey: "direct" }, requirement: MTD, source: "DAL §3.1.4.2 item 1; OM/P/005 8.5–8.6" },
  { code: "specialist_sole_source", values: { nameEn: "Specialist or sole source", ...ANY_VALUE, authorityMethodKey: "direct" }, requirement: MTD, source: "DAL §3.1.4.2 item 1 (proprietary); OM/P/005 8.5" },
  { code: "emergency_works", values: { nameEn: "Emergency works", ...ANY_VALUE, authorityMethodKey: "direct" }, requirement: MTD, source: "DAL §3.1.4.2 item 1 (emergency)" },
  {
    code: "schedule_of_rates",
    // FR-MTD-010: no series documents how term contracts are procured, so where in the value bands a call-off may be used is not set.
    values: { nameEn: "Schedule of Rates or term-contract call-off", requiresFreshSourcing: false, notes: "Which value bands a call-off may be used in is not stated (FR-MTD-010): set it before use." },
    requirement: `${MTD}, FR-MTD-010`,
    source: "DAL §3.1.4.2 item 2; SK012 3.1",
  },
]);

/// FR-MTD-006: the ten items of a selected-tender proposal, all required before it goes to C&P, and none empty when it goes to the CEO.
const item = (key: string, labelEn: string) => ({ code: key, values: { sourcingMethodId: ref("SourcingMethod", "selected_tender"), key, labelEn, required: true }, requirement: "FR-MTD-006", source: `SK002 7.3.2(${key})` });
export const PROPOSAL_ITEMS = list("MethodChecklistItem", "Selected tender proposal item", [
  item("a", "Description or title of the work"),
  item("b", "Estimated cost"),
  item("c", "Grades of contractor eligible and the registration field code required"),
  item("d", "Justification for proposing a selected tender"),
  item("e", "List of contractors proposed"),
  item("f", "Background of those contractors"),
  item("g", "Scope of work"),
  item("h", "Work completion period"),
  item("i", "Budget provision"),
  item("j", "The benefit obtained compared with an open tender"),
]);

// ------------------------------------------------------------------ tender and quotation document parts (FR-DOC-001, 002, 003, 013)

/// FR-DOC-003 classes some instruments as standard and some as bespoke; only those parts keep a STATED class. For the rest the product needs a
/// class, so "both" stands, ASSUMED, until RSAJ confirms it. SR-11: every part is uploaded, so the class has no effect on how a part is issued.
const CLASS_STATED = ["t_form_of_tender", "t_loa_specimen", "t_specification", "t_bills_of_quantities", "t_drawings", "q_bill_of_quantities", "q_drawings"];
const UNCLASSED = "The part and its order are stated (FR-DOC-001/013); its class is not (FR-DOC-003).";
type PartIn = { code: string; packKind: "TENDER" | "QUOTATION"; printedNumber: string; labelEn: string; role: string; content: "STANDARD" | "BESPOKE" | "MIXED"; basis?: "bq" | "ds"; mandatory?: boolean | null; inTable?: boolean | null; declaration?: boolean; note?: string };
const part = (p: PartIn, cited: Cited, sortOrder: number) => ({
  code: p.code,
  values: {
    packKind: p.packKind,
    contractBasisCode: p.basis ?? null,
    printedNumber: p.printedNumber,
    sortOrder,
    labelEn: p.labelEn,
    role: p.role as "OTHER",
    content: p.content,
    // SR-09 and SR-11: the bill of quantities is an uploaded Excel file, read as the unpriced bill while the on-screen bill is not used (ADR 0035).
    source: p.role === "BILL_OF_QUANTITIES" ? ("BQ_UNPRICED" as const) : ("UPLOAD" as const),
    mandatory: p.mandatory === undefined ? true : p.mandatory,
    inTableDocument: p.inTable ?? null,
    // FR-DOC-008: a bid without the signed declaration and letter of authorisation fails the mandatory check at opening.
    ...(p.declaration ? { returnedByBidder: true, returnedByBidderProvenance: "STATED" as const, openingCheck: true, openingCheckProvenance: "STATED" as const } : {}),
    ...(CLASS_STATED.includes(p.code) ? { notes: "" } : { provenance: "ASSUMED" as const, notes: p.note ?? UNCLASSED }),
  },
  ...cited,
});
const TENDER = { requirement: "FR-DOC-001, FR-DOC-002, FR-DOC-003, FR-DOC-007, FR-DOC-008, FR-DOC-010", source: "SK001 7.1.2, 7.3.1(a),(b), 7.3.3, 7.3.4(a)–(k)" };
/// FR-DOC-010: the tender table document holds the conditions, the form of tender, the specification, the bills and the drawings; FR-DOC-007
/// binds the bond forms into it too.
const TENDER_PARTS: PartIn[] = [
  { code: "t_invitation", packKind: "TENDER", printedNumber: "1", labelEn: "Letter of invitation to tender or notice of offer", role: "INVITATION", content: "MIXED", inTable: false },
  { code: "t_form_of_tender", packKind: "TENDER", printedNumber: "2", labelEn: "Form of tender", role: "FORM_OF_TENDER", content: "STANDARD", inTable: true },
  { code: "t_conditions", packKind: "TENDER", printedNumber: "3", labelEn: "Articles of agreement and conditions of contract, with the appendices", role: "CONDITIONS", content: "MIXED", inTable: true },
  { code: "t_loa_specimen", packKind: "TENDER", printedNumber: "4", labelEn: "Letter of acceptance of tender (specimen)", role: "LOA_SPECIMEN", content: "STANDARD", inTable: false },
  { code: "t_bond_forms", packKind: "TENDER", printedNumber: "5", labelEn: "Bank guarantee or insurance form for the performance bond", role: "BOND_FORMS", content: "MIXED", inTable: true },
  { code: "t_specification", packKind: "TENDER", printedNumber: "6", labelEn: "Specification", role: "SPECIFICATION", content: "MIXED", inTable: true },
  { code: "t_bills_of_quantities", packKind: "TENDER", printedNumber: "7a", labelEn: "Bills of quantities", role: "BILL_OF_QUANTITIES", content: "BESPOKE", basis: "bq", inTable: true },
  { code: "t_summary_and_rates", packKind: "TENDER", printedNumber: "7b", labelEn: "Summary of tender and schedule of rates", role: "SUMMARY_AND_RATES", content: "MIXED", basis: "ds", inTable: false },
  { code: "t_registration_background", packKind: "TENDER", printedNumber: "8", labelEn: "Tenderer's registration background form", role: "REGISTRATION_BACKGROUND", content: "MIXED", inTable: false },
  { code: "t_declaration", packKind: "TENDER", printedNumber: "9", labelEn: "Bidder's declaration letter, with the letter of authorisation", role: "DECLARATION", content: "MIXED", inTable: false, declaration: true },
  { code: "t_drawings", packKind: "TENDER", printedNumber: "10", labelEn: "Drawings", role: "DRAWINGS", content: "BESPOKE", inTable: true },
  { code: "t_instructions", packKind: "TENDER", printedNumber: "11", labelEn: "Instructions to tenderers", role: "INSTRUCTIONS", content: "MIXED", inTable: false },
];
const QUOTATION = { requirement: "FR-DOC-013, FR-DOC-003, FR-DOC-008", source: "OM/P/005 §3.2; SK001 7.3.4(j)" };
/// FR-DOC-013's nine parts. Whether the corrigendum is mandatory (there is not always one) and which parts a quotation's table document holds
/// are not stated.
const QUOTATION_PARTS: PartIn[] = [
  { code: "q_notice", packKind: "QUOTATION", printedNumber: "1", labelEn: "Quotation notice", role: "INVITATION", content: "MIXED" },
  { code: "q_corrigendum", packKind: "QUOTATION", printedNumber: "2", labelEn: "Corrigendum", role: "OTHER", content: "MIXED", mandatory: null },
  { code: "q_instructions", packKind: "QUOTATION", printedNumber: "3", labelEn: "Instructions to tenderers", role: "INSTRUCTIONS", content: "MIXED" },
  { code: "q_conditions", packKind: "QUOTATION", printedNumber: "4", labelEn: "Conditions of quotation for works", role: "CONDITIONS", content: "MIXED" },
  { code: "q_specification", packKind: "QUOTATION", printedNumber: "5", labelEn: "Specification of works", role: "SPECIFICATION", content: "MIXED" },
  { code: "q_form", packKind: "QUOTATION", printedNumber: "6", labelEn: "Quotation form", role: "FORM_OF_TENDER", content: "MIXED" },
  { code: "q_bill_of_quantities", packKind: "QUOTATION", printedNumber: "7", labelEn: "Bill of quantities", role: "BILL_OF_QUANTITIES", content: "BESPOKE" },
  { code: "q_tenderer_background", packKind: "QUOTATION", printedNumber: "8", labelEn: "Tenderer's background", role: "REGISTRATION_BACKGROUND", content: "MIXED" },
  { code: "q_drawings", packKind: "QUOTATION", printedNumber: "9", labelEn: "Drawings", role: "DRAWINGS", content: "BESPOKE" },
];
/// FR-DOC-008: a bid without the signed declaration fails the mandatory check at opening, so a quotation needs the part too. OM/P/005 does not
/// list it among its nine, so it is placed last (a question for RSAJ: is it bound into the quotation form?).
const Q_DECLARATION: PartIn = {
  code: "q_declaration",
  packKind: "QUOTATION",
  printedNumber: "10",
  labelEn: "Bidder's declaration letter, with the letter of authorisation",
  role: "DECLARATION",
  content: "MIXED",
  mandatory: true,
  inTable: null,
  declaration: true,
  note: "Bound in by FR-DOC-008; not on OM/P/005's list of nine, so placed last.",
};
export const DOCUMENT_PARTS = list("TenderDocumentPart", "Tender document part", [
  ...TENDER_PARTS.map((p, i) => part(p, TENDER, (i + 1) * 10)),
  ...QUOTATION_PARTS.map((p, i) => part(p, QUOTATION, (i + 1) * 10)),
  part(Q_DECLARATION, { requirement: "FR-DOC-008, FR-EVL-009", source: "SK001 7.3.4(j)" }, (QUOTATION_PARTS.length + 1) * 10),
]);

// ------------------------------------------------------------------ the invitation window (FR-ADV-001, 004, 006, 007; SR-10)

const ADV = { requirement: "FR-ADV-001", source: "SK002 7.4.1" };
export const CHANNELS = list("PublicationChannel", "Publication channel", [
  { code: "newspaper", values: { nameEn: "Newspaper", requiredWhenAdvertised: true }, ...ADV },
  { code: "notice_board", values: { nameEn: "Contract & Procurement Department notice board", requiredWhenAdvertised: true }, ...ADV },
  { code: "website", values: { nameEn: "Ranhill SAJ website", requiredWhenAdvertised: true }, ...ADV },
]);

export const WINDOW_GROUPS = [
  // FR-ADV-004: two weeks the floor and, from its note, three weeks the target. How near the newspaper's day warns is not stated, so it stays
  // unset and a re-run reads this group as partly set.
  group(
    "WindowPolicy",
    "Invitation · date rules",
    { minAdvertisementDays: 14, targetAdvertisementDays: 21, newspaperWarnDays: null, purchaseCutoffDays: 2 },
    { requirement: "FR-ADV-004, FR-ADV-007", source: "SK002 7.4.2(g), 7.4.2(c); CPD/DFA/PRE T-QUO three-week target (FR-ADV-004 note)" },
    { provenance: "dateRulesProvenance", source: "dateRuleSource" },
  ),
  group("WindowPolicy", "Invitation · closing time", { defaultClosingTime: "14:30" }, { requirement: "FR-ADV-006", source: "SK002 7.4.2(g)" }, { provenance: "closingTimeProvenance" }),
  // SR-10: the supplier pays online and can then download the documents, so they are released online too.
  group("WindowPolicy", "Invitation · online sale", { documentSaleMode: "ONLINE", electronicDocumentRelease: true }, { requirement: "SR-10", source: "Sourcing Requirements v2, SR-10" }, { provenance: "electronicReleaseProvenance" }),
];

// ------------------------------------------------------------------ scope and estimate (FR-EST-007; SR-08, SR-09)

export const SCOPE_GROUPS = [
  group("ScopePolicy", "Scope · company estimate lead time", { estimateLeadDays: 7 }, { requirement: "FR-EST-007", source: "SK003 7.2.2(b) (ready one week before the submission date)" }, { provenance: "estimateLeadProvenance" }),
  group("ScopePolicy", "Scope · specification panel and on-screen bill", { specPanelUsed: false, onScreenBillUsed: false }, { requirement: "SR-08, SR-09", source: "Sourcing Requirements v2, SR-08 and SR-09" }),
];

// ------------------------------------------------------------------ evaluation (FR-EVL-003; FR-EVL-008 to 012)

const aspect = (code: string, kind: "COMPLETENESS" | "PRICE_VS_ESTIMATE" | "COMPLETION_PERIOD" | "CAPABILITY", labelEn: string) => ({
  code,
  values: { kind, labelEn, requiredOnRoute: "TRADITIONAL" as const },
  requirement: "FR-EVL-003",
  source: `SK003 7.2.2(${code})`,
});
export const ASPECTS = list("EvaluationAspect", "Evaluation aspect", [
  aspect("a", "COMPLETENESS", "Completeness of the tender received"),
  aspect("b", "PRICE_VS_ESTIMATE", "Reasonableness of the tender price against the company estimate"),
  aspect("c", "COMPLETION_PERIOD", "Reasonableness of the work completion period"),
  aspect("d", "CAPABILITY", "Capability of the tenderer: experience, current work and latest performance"),
]);

const OBS = "OBSERVED" as const;
const stage = (s: Partial<StageSnap> & Pick<StageSnap, "order" | "code" | "labelEn" | "kind" | "side" | "governingSource">): StageSnap => ({
  labelMs: null,
  unlocksAfterOrder: null,
  maxMarks: null,
  passMark: null,
  passInclusive: null,
  mustPass: null,
  compositeWeight: null,
  committeeCode: null,
  shortlistRule: null,
  shortlistMin: null,
  shortlistMax: null,
  shortlistOfficeCode: null,
  capitalBase: null,
  provenance: OBS,
  criteria: [],
  factors: [],
  ...s,
});
const criterion = (order: number, code: string, labelEn: string, c: Partial<CriterionSnap> = {}): CriterionSnap => ({
  code,
  parentCode: null,
  order,
  labelEn,
  labelMs: null,
  maxMarks: null,
  scale: "ENTERED_MARKS",
  computedInput: "NONE",
  bandSetCode: null,
  needsNamedContractor: false,
  provenance: OBS,
  ...c,
});
const band = (sortOrder: number, labelEn: string, outcome: BandSnap["outcome"], b: Partial<BandSnap>): BandSnap => ({ labelEn, labelMs: null, lower: null, lowerInclusive: true, lowerIsFloor: false, upper: null, upperInclusive: false, upperIsFloor: false, outcome, sortOrder, ...b });

/// What the documents leave to the person who confirms a model: who acts on the stages they do not assign (here Contract & Procurement, which
/// holds the documents under SK003 7.1.1), whether a figure exactly on a pass mark passes, and the four aspects' stage (FR-EVL-003), which
/// neither form has.
const LEFT_OPEN = "To complete before it is put in force: the side of the stages the form does not assign (set to Contract & Procurement, SK003 7.1.1); whether a figure exactly on a pass mark passes; and where the four aspects of FR-EVL-003 are assessed.";

const TA109 = "TA 109 Stages 1–6 (practice; FR-EVL-008, decision D1)";
/// A stage whose side the form does not assign: set to Contract & Procurement (SK003 7.1.1), so ASSUMED rather than the form's practice.
const unassigned = (form: string) => ({ provenance: "ASSUMED" as const, governingSource: `${form}: side not assigned by the form; set to Contract & Procurement` });
const TENDER_MODEL: PackModelDraft = {
  requirement: "FR-EVL-006, FR-EVL-008, FR-EVL-002",
  source: TA109,
  notes: LEFT_OPEN,
  content: {
    code: "tender_six_stage",
    nameEn: "Tender evaluation, six stages",
    nameMs: null,
    route: "TRADITIONAL",
    provenance: OBS,
    governingSource: TA109,
    bandSets: [],
    stages: [
      stage({ order: 1, code: "checklist", labelEn: "Stage 1: mandatory submission checklist", kind: "CHECKLIST", side: "CONTRACT_PROCUREMENT", mustPass: true, ...unassigned(TA109) }),
      stage({ order: 2, code: "shortlist", labelEn: "Stage 2: shortlist by Form of Tender price", kind: "SHORTLIST", side: "CONTRACT_PROCUREMENT", shortlistRule: "DECIDED_BY_OFFICE", shortlistOfficeCode: "CP", governingSource: TA109 }),
      stage({
        order: 3,
        code: "technical",
        labelEn: "Stage 3: technical evaluation",
        kind: "SCORED",
        side: "IMPLEMENTING_DEPARTMENT",
        maxMarks: "100",
        passMark: "70",
        mustPass: true,
        compositeWeight: "60",
        governingSource: TA109,
        criteria: [
          criterion(1, "past_experience_performance", "Past experience and performance", { maxMarks: "40" }),
          criterion(2, "past_experience", "Past experience", { parentCode: "past_experience_performance", maxMarks: "15" }),
          criterion(3, "works_in_progress", "Works in progress", { parentCode: "past_experience_performance", maxMarks: "5" }),
          criterion(4, "preliminary_programme", "Preliminary works programme", { parentCode: "past_experience_performance", maxMarks: "5" }),
          criterion(5, "project_organisation", "Project organisation", { parentCode: "past_experience_performance", maxMarks: "5" }),
          criterion(6, "plant", "Plant", { parentCode: "past_experience_performance", maxMarks: "10" }),
          criterion(7, "technical_requirement", "Technical requirement", { maxMarks: "60" }),
          criterion(8, "design", "Design, calculation, specification and drawing", { parentCode: "technical_requirement", maxMarks: "40" }),
          criterion(9, "method_statement", "Method statement", { parentCode: "technical_requirement", maxMarks: "20" }),
        ],
      }),
      stage({
        order: 4,
        code: "financial",
        labelEn: "Stage 4: financial evaluation",
        kind: "SCORED",
        side: "CONTRACT_PROCUREMENT",
        unlocksAfterOrder: 3,
        maxMarks: "100",
        passMark: "60",
        mustPass: true,
        compositeWeight: "40",
        // Minimum capital required = 10% of the tender amount.
        capitalBase: "TENDER_AMOUNT",
        factors: [{ code: "minimum_capital", labelEn: "Minimum capital required, of the tender amount", labelMs: null, factorPct: "10", provenance: OBS }],
        governingSource: TA109,
        criteria: [
          criterion(1, "paid_up_capital", "Paid-up capital", { maxMarks: "10" }),
          criterion(2, "net_worth", "Net worth", { maxMarks: "10" }),
          criterion(3, "working_capital", "Total working capital as a percentage of the minimum capital required", { maxMarks: "60" }),
          criterion(4, "gearing_ratio", "Gearing ratio", { maxMarks: "10" }),
          criterion(5, "current_ratio", "Current ratio", { maxMarks: "10" }),
        ],
      }),
      stage({ order: 5, code: "combined", labelEn: "Stage 5: combined score (technical 60%, financial 40%)", kind: "COMPOSITE", side: "CONTRACT_PROCUREMENT", passMark: "60", mustPass: true, ...unassigned(TA109) }),
      stage({ order: 6, code: "recommendation", labelEn: "Stage 6: recommendation", kind: "RECOMMENDATION", side: "CONTRACT_PROCUREMENT", ...unassigned(TA109) }),
    ],
  },
};

const LPS = "Quotation evaluation report template (practice; FR-EVL-009 to 012)";
const QUOTATION_MODEL: PackModelDraft = {
  requirement: "FR-EVL-006, FR-EVL-009, FR-EVL-010, FR-EVL-011, FR-EVL-012",
  source: LPS,
  notes: `${LEFT_OPEN} Also open: the marks of each Phase 2 criterion (the form gives a maximum of 90%), and whether Phases 2 to 4 must each be passed.`,
  content: {
    code: "quotation_five_phase",
    nameEn: "Quotation evaluation, five phases",
    nameMs: null,
    route: "TRADITIONAL",
    provenance: OBS,
    governingSource: LPS,
    bandSets: [
      {
        // FR-EVL-010: above 15%, at 10%, below 10%, and below the 3% or 5% floor, as written (the gap above 10% and up to 15% included).
        code: "capital",
        nameEn: "Minimum capital bands",
        provenance: OBS,
        governingSource: LPS,
        bands: [
          band(1, "Strong", "PASS", { lower: "15", lowerInclusive: false }),
          band(2, "Good", "PASS", { lower: "10", lowerInclusive: true, upper: "10", upperInclusive: true }),
          band(3, "Satisfactory", "PASS", { lowerIsFloor: true, lowerInclusive: true, upper: "10", upperInclusive: false }),
          band(4, "Fail", "FAIL", { upperIsFloor: true, upperInclusive: false }),
        ],
      },
      {
        // FR-EVL-011: below −15%, within ±15%, above +15%; against the estimate and against the lowest bid alike.
        code: "variance",
        nameEn: "Price variance bands",
        provenance: OBS,
        governingSource: LPS,
        bands: [
          band(1, "Low", "NONE", { upper: "-15", upperInclusive: false }),
          band(2, "Competitive", "NONE", { lower: "-15", lowerInclusive: true, upper: "15", upperInclusive: true }),
          band(3, "High", "NONE", { lower: "15", lowerInclusive: false }),
        ],
      },
      {
        // FR-EVL-012: 80–100, 60–79, 50–59, 40–49, 0–39, as written.
        code: "cpr",
        nameEn: "Contractor Performance Report bands",
        provenance: OBS,
        governingSource: LPS,
        bands: [
          band(1, "Best", "NONE", { lower: "80", upper: "100", upperInclusive: true }),
          band(2, "Good", "NONE", { lower: "60", upper: "79", upperInclusive: true }),
          band(3, "Moderate", "NONE", { lower: "50", upper: "59", upperInclusive: true }),
          band(4, "Unsatisfactory", "NONE", { lower: "40", upper: "49", upperInclusive: true }),
          band(5, "Fail", "NONE", { lower: "0", upper: "39", upperInclusive: true }),
        ],
      },
    ],
    stages: [
      stage({
        order: 1,
        code: "phase_1",
        labelEn: "Phase 1: mandatory evaluation",
        kind: "CHECKLIST",
        side: "CONTRACT_PROCUREMENT",
        mustPass: true,
        ...unassigned(LPS),
        criteria: [
          criterion(1, "before_closing", "Documents received before 2.30 p.m.", { scale: "PASS_FAIL" }),
          criterion(2, "eligible", "Tenderer eligible", { scale: "PASS_FAIL" }),
          criterion(3, "forms_complete", "Quotation form and bidder's declaration complete, signed and officially stamped", { scale: "PASS_FAIL" }),
        ],
      }),
      stage({ order: 2, code: "phase_1_shortlist", labelEn: "Phase 1: shortlist of three or four tenderers", kind: "SHORTLIST", side: "CONTRACT_PROCUREMENT", shortlistRule: "COUNT_RANGE", shortlistMin: 3, shortlistMax: 4, ...unassigned(LPS) }),
      stage({
        order: 3,
        code: "phase_2",
        labelEn: "Phase 2: technical evaluation",
        kind: "SCORED",
        side: "IMPLEMENTING_DEPARTMENT",
        maxMarks: "90",
        governingSource: LPS,
        criteria: [
          criterion(1, "work_experience", "Work experience"),
          criterion(2, "current_work", "Current work"),
          criterion(3, "manpower", "Manpower"),
          criterion(4, "plant_machinery", "Plant and machinery"),
          criterion(5, "workforce_management", "Workforce management"),
          criterion(6, "cpr", "Contractor Performance Report percentage", { scale: "BANDED", computedInput: "CPR_PERCENT", bandSetCode: "cpr" }),
        ],
      }),
      stage({
        order: 4,
        code: "phase_3",
        labelEn: "Phase 3: financial evaluation",
        kind: "FINANCIAL_TEST",
        side: "CONTRACT_PROCUREMENT",
        unlocksAfterOrder: 3,
        capitalBase: "COMPANY_ESTIMATE",
        factors: [
          { code: "store", labelEn: "Materials supplied from the Ranhill SAJ store", labelMs: null, factorPct: "3", provenance: OBS },
          { code: "contractor", labelEn: "Materials supplied by the contractor", labelMs: null, factorPct: "5", provenance: OBS },
        ],
        governingSource: LPS,
        criteria: [criterion(1, "minimum_capital", "Average bank balance of the last three months against the minimum capital", { scale: "BANDED", computedInput: "MIN_CAPITAL_RATIO", bandSetCode: "capital" })],
      }),
      stage({
        order: 5,
        code: "phase_4",
        labelEn: "Phase 4: commercial evaluation",
        kind: "COMMERCIAL",
        side: "CONTRACT_PROCUREMENT",
        unlocksAfterOrder: 3,
        governingSource: LPS,
        criteria: [
          criterion(1, "against_estimate", "Against the company estimate", { scale: "BANDED", computedInput: "VARIANCE_VS_ESTIMATE", bandSetCode: "variance" }),
          criterion(2, "against_lowest", "Against the lowest bid", { scale: "BANDED", computedInput: "VARIANCE_VS_LOWEST", bandSetCode: "variance" }),
        ],
      }),
      stage({ order: 6, code: "phase_5", labelEn: "Phase 5: recommendation", kind: "RECOMMENDATION", side: "CONTRACT_PROCUREMENT", ...unassigned(LPS) }),
    ],
  },
};

export const PURCHASING = {
  lists: [FUNDING_ROUTES, CONTRACT_TYPES, CONTRACT_BASES, SOURCING_METHODS, PROPOSAL_ITEMS, DOCUMENT_PARTS, CHANNELS, ASPECTS],
  groups: [...WINDOW_GROUPS, ...SCOPE_GROUPS],
  drafts: { evaluationModels: [TENDER_MODEL, QUOTATION_MODEL] },
};
