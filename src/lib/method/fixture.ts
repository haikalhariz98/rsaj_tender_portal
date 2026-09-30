import type { Matrix, Rule } from "@/lib/authority/types";

import type { ChecklistItem, ContractBasis, ContractTypeRow, JustificationReason, Method, Taxonomy, TaxonomyMapping, TermsBand } from "./types";

/**
 * A synthetic matrix shaped like the bands the specification's worked examples are
 * written against (§4.2.1, §4.2.2, §4.2.3, §4.4), for tests only. No customer's limits
 * ship in the product, and this file is never seeded. Offices are named for what they
 * do in the examples, not for any organisation's role codes.
 */

const rule = (r: Partial<Rule> & Pick<Rule, "ruleKey" | "domain">): Rule => ({
  method: null,
  cond: null,
  minValue: null,
  maxValue: null,
  pctMin: null,
  pctMax: null,
  contractValueMin: null,
  contractValueMax: null,
  followsBoundarySwitch: null,
  // Worded, as a customer's rule labels are: a label is shown, a key never.
  labelEn: `Rule ${r.ruleKey.toLowerCase().replace(/_/g, " ")}`,
  labelMs: null,
  proposerCode: null,
  approverCode: null,
  committeeCode: null,
  committeeAct: null,
  nonDelegable: false,
  approverMandatory: false,
  isGap: false,
  gapNote: null,
  note: "",
  clause: "TEST",
  sortOrder: 0,
  recommenders: [],
  ...r,
});

const role = (code: string, nameEn: string, isCommittee = false) => ({
  code,
  nameEn,
  nameMs: nameEn,
  isCommittee,
  escalatesToCode: null,
  selfApprovalEscalatesToCode: null,
});

const req = (r: Partial<Rule> & Pick<Rule, "ruleKey">) => rule({ domain: "requisition", followsBoundarySwitch: false, ...r });
// The method family: every edge at the boundary follows the switch.
const direct = (r: Partial<Rule> & Pick<Rule, "ruleKey">) => rule({ domain: "appointment", method: "direct", ...r });

export const SPEC_MATRIX: Matrix = {
  policy: {
    boundaryValue: 300_000,
    boundaryInclusive: true,
    quotationFloor: 15_000,
    tenderFloor: 300_000,
    requisitionBoundary: 50_000,
    currency: "MYR",
    clauses: { funderOverride: "TEST 1.4" },
  },
  roles: Object.fromEntries(
    [
      role("HOD", "Head of Department"),
      role("HODIV", "Head of Division"),
      role("FD", "Functional Director"),
      role("CEO", "Chief Executive"),
      role("CHAIR", "Chairman"),
      role("CP", "Contract & Procurement"),
      role("BOD", "Board of Directors", true),
      role("TBC", "Tender Board", true),
      role("QC", "Quotation Committee", true),
      role("TECH", "Technical Committee", true),
    ].map((r) => [r.code, r]),
  ),
  rules: [
    // §4.2.1 requisition bands: RM500 / RM50,000 / RM300,000. They do not follow the switch.
    req({ ruleKey: "REQ_500", maxValue: 500, approverCode: "HOD" }),
    req({ ruleKey: "REQ_50K", minValue: 500, maxValue: 50_000, recommenders: [{ roleCode: "HOD", act: "R" }], approverCode: "HODIV" }),
    req({ ruleKey: "REQ_300K", minValue: 50_000, maxValue: 300_000, proposerCode: "HOD", recommenders: [{ roleCode: "HODIV", act: "R" }], approverCode: "FD" }),
    req({
      ruleKey: "REQ_OVER",
      minValue: 300_000,
      proposerCode: "HOD",
      recommenders: [
        { roleCode: "HODIV", act: "R" },
        { roleCode: "FD", act: "MR" },
      ],
      approverCode: "CEO",
    }),

    // §4.4 direct appointment by value.
    direct({ ruleKey: "DA_500", maxValue: 500, approverCode: "HOD" }),
    direct({ ruleKey: "DA_5K", minValue: 500, maxValue: 5_000, approverCode: "HODIV" }),
    direct({ ruleKey: "DA_15K", minValue: 5_000, maxValue: 15_000, approverCode: "FD" }),
    direct({
      ruleKey: "DA_300K",
      minValue: 15_000,
      maxValue: 300_000,
      followsBoundarySwitch: true,
      recommenders: [{ roleCode: "QC", act: "MR" }],
      committeeCode: "QC",
      committeeAct: "MR",
      approverCode: "CEO",
    }),
    direct({ ruleKey: "DA_3M", minValue: 300_000, maxValue: 3_000_000, followsBoundarySwitch: true, approverCode: "TBC", committeeCode: "TBC", committeeAct: "A" }),
    direct({ ruleKey: "DA_5M", minValue: 3_000_000, maxValue: 5_000_000, recommenders: [{ roleCode: "TBC", act: "MR" }], committeeCode: "TBC", committeeAct: "MR", approverCode: "CHAIR" }),
    direct({ ruleKey: "DA_OVER", minValue: 5_000_000, recommenders: [{ roleCode: "TBC", act: "MR" }], committeeCode: "TBC", committeeAct: "MR", approverCode: "BOD" }),

    // §4.2.2 regimes: the tender and quotation appointment rows.
    rule({ ruleKey: "APP_TENDER", domain: "appointment", method: "tender", minValue: 300_000, followsBoundarySwitch: true, approverCode: "TBC", committeeCode: "TBC", committeeAct: "A" }),
    rule({
      ruleKey: "APP_QUOTATION",
      domain: "appointment",
      method: "quotation",
      minValue: 15_000,
      maxValue: 300_000,
      followsBoundarySwitch: true,
      recommenders: [{ roleCode: "QC", act: "MR" }],
      committeeCode: "QC",
      committeeAct: "MR",
      approverCode: "CEO",
    }),
    rule({ ruleKey: "APP_SPECIALIST", domain: "appointment", method: "specialist", recommenders: [{ roleCode: "TECH", act: "R" }], committeeCode: "TECH", committeeAct: "R", approverCode: "CEO" }),

    // §4.4 / FR-MTD-008 approval of the name.
    rule({
      ruleKey: "NAME_TENDER",
      domain: "name_approval",
      method: "tender",
      proposerCode: "CP",
      recommenders: [
        { roleCode: "CP", act: "MR" },
        { roleCode: "HODIV", act: "JR" },
        { roleCode: "FD", act: "R" },
      ],
      approverCode: "CEO",
    }),
    rule({
      ruleKey: "NAME_QUOTATION",
      domain: "name_approval",
      method: "quotation",
      proposerCode: "HOD",
      recommenders: [
        { roleCode: "HOD", act: "JR" },
        { roleCode: "HODIV", act: "R" },
      ],
      approverCode: "FD",
    }),
  ],
};

/// §4.2.3: the quotation route's terms split at RM50,000. Scoped to the quotation
/// regime as data, not code.
export const SPEC_TERMS: TermsBand[] = [
  {
    bandKey: "Q_SHORT",
    minValue: null,
    maxValue: 50_000,
    regime: "quotation",
    labelEn: "Up to RM50,000: short-form terms",
    retentionApplies: false,
    defectsLiabilityApplies: false,
    insuranceNote: "",
    followsBoundarySwitch: null,
    clause: "TEST T1",
    provenance: "OBSERVED",
    sortOrder: 1,
  },
  {
    bandKey: "Q_LONG",
    minValue: 50_000,
    maxValue: null,
    regime: "quotation",
    labelEn: "Above RM50,000: retention and defects liability apply",
    retentionApplies: true,
    defectsLiabilityApplies: true,
    insuranceNote: "",
    followsBoundarySwitch: null,
    clause: "TEST T2",
    provenance: "OBSERVED",
    sortOrder: 2,
  },
];

const method = (m: Partial<Method> & Pick<Method, "code">): Method => ({
  nameEn: m.code,
  nameMs: null,
  availableInTender: false,
  availableInQuotation: false,
  availableBelow: false,
  requiresAdvertisement: false,
  invitesNamedSuppliers: false,
  requiresFreshSourcing: true,
  awardInstrument: "",
  committeeCode: null,
  authorityMethodKey: null,
  governingSource: "",
  provenance: "STATED",
  notes: "",
  sortOrder: 0,
  retiredOn: null,
  defaultInTender: false,
  defaultInQuotation: false,
  defaultBelow: false,
  requiresJustification: false,
  justificationPrompt: "",
  requiresProposal: false,
  requiresNameApproval: false,
  restrictedAccess: false,
  requiresDossier: false,
  requiresCoordinationRecord: false,
  dossierSeriesKey: null,
  ...m,
});

const any = { availableInTender: true, availableInQuotation: true, availableBelow: true };

/// §4.4's nine methods.
export const SPEC_METHODS: Method[] = [
  method({ code: "open_tender", nameEn: "Open tender", availableInTender: true, defaultInTender: true, authorityMethodKey: "tender", sortOrder: 1 }),
  method({
    code: "selected_tender",
    nameEn: "Selected tender",
    availableInTender: true,
    authorityMethodKey: "tender",
    requiresJustification: true,
    justificationPrompt: "The skilled-worker expertise that justifies a selected tender.",
    requiresProposal: true,
    requiresNameApproval: true,
    restrictedAccess: true,
    sortOrder: 2,
  }),
  method({ code: "open_quotation", nameEn: "Open quotation", availableInQuotation: true, defaultInQuotation: true, authorityMethodKey: "quotation", sortOrder: 3 }),
  method({ code: "selective_quotation", nameEn: "Selective quotation", availableInQuotation: true, authorityMethodKey: "quotation", requiresNameApproval: true, sortOrder: 4 }),
  method({ code: "direct", nameEn: "Direct appointment", ...any, defaultBelow: true, authorityMethodKey: "direct", sortOrder: 5 }),
  method({ code: "selective_direct", nameEn: "Selective direct appointment", ...any, authorityMethodKey: "direct", requiresDossier: true, dossierSeriesKey: "direct_appointment", sortOrder: 6 }),
  method({ code: "specialist", nameEn: "Specialist or sole source", availableInQuotation: true, availableBelow: true, committeeCode: "TECH", authorityMethodKey: "specialist", requiresJustification: true, sortOrder: 7 }),
  method({ code: "emergency", nameEn: "Emergency works", ...any, authorityMethodKey: "direct", requiresCoordinationRecord: true, sortOrder: 8 }),
  method({ code: "call_off", nameEn: "Schedule of rates call-off", ...any, requiresFreshSourcing: false, sortOrder: 9 }),
];

/// §6.3 FR-MTD-006: the ten items (a)–(j), as test data.
export const TEN_ITEMS: ChecklistItem[] = "abcdefghij".split("").map((k, i) => ({ key: k, labelEn: `Item (${k})`, required: true, sortOrder: i, retiredOn: null }));

export const SPEC_REASONS: JustificationReason[] = [
  { code: "SOLE_DISTRIBUTOR", nameEn: "Sole authorised distributor", sourcingMethodCode: "selective_direct", provenance: "OBSERVED", sortOrder: 1, retiredOn: null },
  { code: "EXISTING_VENDOR", nameEn: "Existing vendor", sourcingMethodCode: null, provenance: "OBSERVED", sortOrder: 2, retiredOn: null },
];

const type = (t: Partial<ContractTypeRow> & Pick<ContractTypeRow, "code">): ContractTypeRow => ({
  nameEn: t.code,
  deliverableKind: null,
  provenance: "ASSUMED",
  sortOrder: 0,
  retiredOn: null,
  pricingBasis: null,
  registrationTest: null,
  administratorRoleCodes: [],
  startRequiresSecurities: null,
  eotInstrument: null,
  completionInstrument: null,
  defectsLiabilityApplies: null,
  makingGoodCertificate: null,
  nominationAllowed: null,
  interimPaymentRule: null,
  sumAdjustmentDrivers: [],
  claimsApprovalCommitteeCode: null,
  ...t,
});

/// §4.5, reverse-engineered as the spec says, for tests only.
export const SPEC_TYPES: ContractTypeRow[] = [
  type({
    code: "WORK",
    nameEn: "Work",
    deliverableKind: "MEASURED_CONSTRUCTION",
    pricingBasis: "Drawings and specification, or bills of quantities",
    registrationTest: "Works registration",
    administratorRoleCodes: ["SO", "PD"],
    startRequiresSecurities: true,
    eotInstrument: "Certificate of extension of time",
    completionInstrument: "Certificate of practical completion",
    defectsLiabilityApplies: true,
    makingGoodCertificate: true,
    nominationAllowed: true,
    interimPaymentRule: "Monthly, work executed plus materials on site",
    sumAdjustmentDrivers: ["Variations", "Re-measurement"],
    claimsApprovalCommitteeCode: "TBC",
  }),
  type({
    code: "SERVICE",
    nameEn: "Service",
    deliverableKind: "TERM_PERFORMANCE",
    pricingBasis: "Drawings and specification, or bills of quantities",
    administratorRoleCodes: ["SO", "PD"],
    startRequiresSecurities: true,
    completionInstrument: "Certificate of practical completion at the end of the term",
    // The narrative says no, the flowchart says yes: not set, never false.
    defectsLiabilityApplies: null,
    nominationAllowed: false,
    interimPaymentRule: "Monthly, work executed only",
  }),
  type({
    code: "SUPPLY",
    nameEn: "Supply",
    deliverableKind: "GOODS_DELIVERED",
    pricingBasis: "Specification and schedule of prices",
    administratorRoleCodes: ["SO"],
    startRequiresSecurities: false,
    completionInstrument: "Delivery certificate",
    defectsLiabilityApplies: false,
    makingGoodCertificate: false,
    nominationAllowed: false,
    interimPaymentRule: "Local order, invoice and delivery order",
  }),
];

export const SPEC_BASES: ContractBasis[] = [
  { code: "BQ", nameEn: "Bills of quantities", standardFormLabel: null, sortOrder: 1, retiredOn: null },
  { code: "DS", nameEn: "Drawings and specification", standardFormLabel: null, sortOrder: 2, retiredOn: null },
];

const tax = (code: string, values: string[]): Taxonomy => ({
  code,
  nameEn: code,
  sortOrder: 0,
  retiredOn: null,
  values: values.map((v) => ({ code: v, nameEn: v, retiredOn: null })),
});

/// Four other taxonomies, as the corpus has them (MODEL §3.2.3), with invented values.
export const SPEC_TAXONOMIES: Taxonomy[] = [
  tax("CPD", ["CPD_WORK", "CPD_SERVICE", "CPD_SUPPLY"]),
  tax("EVAL", ["EVAL_WORKS", "EVAL_GENERAL"]),
  tax("REPORT", ["REPORT_WORKS", "REPORT_DB", "REPORT_SERVICE", "REPORT_SUPPLY"]),
  tax("PANEL", ["PANEL_CIVIL", "PANEL_GENERAL"]),
];

const map = (contractTypeCode: string, taxonomyCode: string, valueCode: string, extra: Partial<TaxonomyMapping> = {}): TaxonomyMapping => ({
  contractTypeCode,
  taxonomyCode,
  valueCode,
  whenBasisCode: null,
  whenTaxonomyCode: null,
  whenValueCode: null,
  provenance: "ASSUMED",
  ...extra,
});

export const SPEC_MAPPINGS: TaxonomyMapping[] = [
  map("WORK", "CPD", "CPD_WORK"),
  map("WORK", "EVAL", "EVAL_WORKS"),
  // Works gives two report forms; the drawings-and-specification basis settles it.
  map("WORK", "REPORT", "REPORT_WORKS"),
  map("WORK", "REPORT", "REPORT_DB"),
  map("WORK", "REPORT", "REPORT_DB", { whenBasisCode: "DS" }),
  map("WORK", "PANEL", "PANEL_CIVIL"),
  map("SUPPLY", "CPD", "CPD_SUPPLY"),
  map("SUPPLY", "EVAL", "EVAL_GENERAL"),
  map("SUPPLY", "REPORT", "REPORT_SUPPLY"),
  map("SUPPLY", "PANEL", "PANEL_GENERAL"),
  map("SUPPLY", "PANEL", "PANEL_CIVIL", { whenTaxonomyCode: "EVAL", whenValueCode: "EVAL_WORKS" }),
];
