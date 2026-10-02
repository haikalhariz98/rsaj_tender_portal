/**
 * TEST FIXTURE ONLY — never seeded, never imported outside a test (`sealed.test.ts` scans for it).
 *
 * The two evaluation models the customer works to today, as the plan reads them (D1: SK003 has no
 * marks, weights, pass marks or formula; these are practice, OBSERVED, pending RSAJ's ruling): the
 * tender model of TA 109 (technical 70 pass at 60 %, financial 60 pass at 40 %, composite 60, each of
 * the technical and financial stages to be passed on its own) and the five-phase quotation model of the
 * LAPORAN PENILAIAN SEBUTHARGA template (compliance; a shortlist of three to four; a minimum-capital test
 * on the company estimate at 3 % or 5 % with its bands as written, gap included; the price against the
 * estimate at ±15 %, an ASSUMED reading of "reasonable"; a CPR band; the recommendation). RSAJ seeds
 * them at go-live; the product ships none (rule 1, X-10(d)).
 */

import type { AspectConfig, BandSnap, CriterionSnap, ModelContent, StageSnap } from "./model";

const OBS = "OBSERVED" as const;

export const stage = (s: Partial<StageSnap> & Pick<StageSnap, "order" | "code" | "kind" | "side">): StageSnap => ({
  labelEn: s.code,
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
  governingSource: "TA 109",
  criteria: [],
  factors: [],
  ...s,
});

export const criterion = (c: Partial<CriterionSnap> & Pick<CriterionSnap, "code" | "order" | "scale">): CriterionSnap => ({
  parentCode: null,
  labelEn: c.code,
  labelMs: null,
  maxMarks: null,
  computedInput: "NONE",
  bandSetCode: null,
  needsNamedContractor: false,
  provenance: OBS,
  ...c,
});

export const band = (b: Partial<BandSnap> & Pick<BandSnap, "labelEn" | "outcome" | "sortOrder">): BandSnap => ({
  labelMs: null,
  lower: null,
  lowerInclusive: true,
  lowerIsFloor: false,
  upper: null,
  upperInclusive: false,
  upperIsFloor: false,
  ...b,
});

/// TA 109: technical 40 + 30 + 30 marks (the first a group of two 20-mark criteria), financial 60 + 40.
export const TA109: ModelContent = {
  code: "TA109",
  version: 1,
  nameEn: "Tender evaluation (TA 109)",
  nameMs: "Penilaian tender (TA 109)",
  route: "TRADITIONAL",
  provenance: OBS,
  governingSource: "TA 109",
  stages: [
    stage({ order: 1, code: "COMPLIANCE", kind: "CHECKLIST", side: "CONTRACT_PROCUREMENT", mustPass: true, criteria: [criterion({ code: "FORM", order: 1, scale: "PASS_FAIL" }), criterion({ code: "REGISTRATION", order: 2, scale: "PASS_FAIL" })] }),
    stage({ order: 2, code: "ASPECTS", kind: "ASPECTS", side: "IMPLEMENTING_DEPARTMENT" }),
    stage({
      order: 3,
      code: "TECHNICAL",
      kind: "SCORED",
      side: "IMPLEMENTING_DEPARTMENT",
      maxMarks: "100",
      passMark: "70",
      passInclusive: true,
      mustPass: true,
      compositeWeight: "60",
      criteria: [
        criterion({ code: "EXPERIENCE", order: 1, scale: "ENTERED_MARKS", maxMarks: "40" }),
        criterion({ code: "EXP_SIMILAR", parentCode: "EXPERIENCE", order: 2, scale: "ENTERED_MARKS", maxMarks: "20" }),
        criterion({ code: "EXP_VALUE", parentCode: "EXPERIENCE", order: 3, scale: "ENTERED_MARKS", maxMarks: "20" }),
        criterion({ code: "STAFF", order: 4, scale: "ENTERED_MARKS", maxMarks: "30", needsNamedContractor: true }),
        criterion({ code: "PROGRAMME", order: 5, scale: "ENTERED_MARKS", maxMarks: "30" }),
      ],
    }),
    stage({
      order: 4,
      code: "FINANCIAL",
      kind: "SCORED",
      side: "CONTRACT_PROCUREMENT",
      unlocksAfterOrder: 3,
      maxMarks: "100",
      passMark: "60",
      passInclusive: true,
      mustPass: true,
      compositeWeight: "40",
      capitalBase: "TENDER_AMOUNT",
      factors: [{ code: "TENDER", labelEn: "Tender amount", labelMs: null, factorPct: "10", provenance: OBS }],
      criteria: [
        criterion({ code: "CAPITAL", order: 1, scale: "BANDED", computedInput: "MIN_CAPITAL_RATIO", bandSetCode: "CAPITAL_TENDER" }),
        criterion({ code: "LIQUIDITY", order: 2, scale: "ENTERED_MARKS", maxMarks: "60" }),
        criterion({ code: "STANDING", order: 3, scale: "ENTERED_MARKS", maxMarks: "40" }),
      ],
    }),
    stage({ order: 5, code: "COMPOSITE", kind: "COMPOSITE", side: "CONTRACT_PROCUREMENT", passMark: "60", passInclusive: true, mustPass: true }),
    stage({ order: 6, code: "RECOMMEND", kind: "RECOMMENDATION", side: "CONTRACT_PROCUREMENT" }),
  ],
  bandSets: [
    {
      code: "CAPITAL_TENDER",
      nameEn: "Minimum capital (tender)",
      provenance: OBS,
      governingSource: "TA 109",
      bands: [band({ labelEn: "Meets the minimum", outcome: "PASS", sortOrder: 1, lowerIsFloor: true, lowerInclusive: true }), band({ labelEn: "Below the minimum", outcome: "FAIL", sortOrder: 2, upperIsFloor: true, upperInclusive: false })],
    },
  ],
};

/// The four aspects a traditional evaluation assesses (FR-EVL-003), required on TRADITIONAL.
export const ASPECTS: AspectConfig[] = [
  { code: "A", kind: "COMPLETENESS", labelEn: "Completeness of the offer", labelMs: null, requiredOnRoute: "TRADITIONAL", provenance: "STATED", retired: false },
  { code: "B", kind: "PRICE_VS_ESTIMATE", labelEn: "The price against the estimate", labelMs: null, requiredOnRoute: "TRADITIONAL", provenance: "STATED", retired: false },
  { code: "C", kind: "COMPLETION_PERIOD", labelEn: "The completion period", labelMs: null, requiredOnRoute: "TRADITIONAL", provenance: "STATED", retired: false },
  { code: "D", kind: "CAPABILITY", labelEn: "Capability", labelMs: null, requiredOnRoute: "TRADITIONAL", provenance: "STATED", retired: false },
];

/// The quotation's five phases (LAPORAN PENILAIAN SEBUTHARGA), with Fasa 3's bands as written, gap and all.
export const FIVE_PHASE: ModelContent = {
  code: "QUOTE5",
  version: 1,
  nameEn: "Quotation evaluation, five phases",
  nameMs: "Penilaian sebut harga, lima fasa",
  route: "TRADITIONAL",
  provenance: OBS,
  governingSource: "LAPORAN PENILAIAN SEBUTHARGA",
  stages: [
    stage({ order: 1, code: "FASA1", kind: "CHECKLIST", side: "CONTRACT_PROCUREMENT", mustPass: true, criteria: [criterion({ code: "COMPLETE", order: 1, scale: "PASS_FAIL" })] }),
    stage({ order: 2, code: "FASA2", kind: "SHORTLIST", side: "CONTRACT_PROCUREMENT", shortlistRule: "COUNT_RANGE", shortlistMin: 3, shortlistMax: 4 }),
    stage({
      order: 3,
      code: "FASA3",
      kind: "FINANCIAL_TEST",
      side: "CONTRACT_PROCUREMENT",
      mustPass: true,
      capitalBase: "COMPANY_ESTIMATE",
      factors: [
        { code: "STORE", labelEn: "Materials supplied by the store", labelMs: null, factorPct: "3", provenance: OBS },
        { code: "CONTRACTOR", labelEn: "Materials supplied by the contractor", labelMs: null, factorPct: "5", provenance: OBS },
      ],
      criteria: [criterion({ code: "CAPITAL", order: 1, scale: "BANDED", computedInput: "MIN_CAPITAL_RATIO", bandSetCode: "FASA3" })],
    }),
    stage({
      order: 4,
      code: "FASA4",
      kind: "COMMERCIAL",
      side: "CONTRACT_PROCUREMENT",
      mustPass: false,
      criteria: [
        criterion({ code: "VS_ESTIMATE", order: 1, scale: "BANDED", computedInput: "VARIANCE_VS_ESTIMATE", bandSetCode: "PRICE" }),
        criterion({ code: "VS_LOWEST", order: 2, scale: "BANDED", computedInput: "VARIANCE_VS_LOWEST", bandSetCode: "LOWEST" }),
        criterion({ code: "CPR", order: 3, scale: "BANDED", computedInput: "CPR_PERCENT", bandSetCode: "CPR" }),
      ],
    }),
    stage({ order: 5, code: "FASA5", kind: "RECOMMENDATION", side: "CONTRACT_PROCUREMENT" }),
  ],
  bandSets: [
    {
      code: "FASA3",
      nameEn: "Fasa 3 capital bands (as written)",
      provenance: OBS,
      governingSource: "LAPORAN PENILAIAN SEBUTHARGA",
      bands: [
        band({ labelEn: "Kukuh", outcome: "PASS", sortOrder: 1, lower: "15", lowerInclusive: false }),
        band({ labelEn: "Baik", outcome: "PASS", sortOrder: 2, lower: "10", lowerInclusive: true, upper: "10", upperInclusive: true }),
        band({ labelEn: "Memuaskan", outcome: "PASS", sortOrder: 3, lowerIsFloor: true, lowerInclusive: true, upper: "10", upperInclusive: false }),
        band({ labelEn: "Gagal", outcome: "FAIL", sortOrder: 4, upperIsFloor: true, upperInclusive: false }),
      ],
    },
    {
      code: "PRICE",
      nameEn: "The price against the estimate (±15 %, assumed)",
      provenance: "ASSUMED",
      governingSource: "",
      bands: [
        band({ labelEn: "Rendah", outcome: "NONE", sortOrder: 1, upper: "-15", upperInclusive: false }),
        band({ labelEn: "Kompetitif", outcome: "NONE", sortOrder: 2, lower: "-15", lowerInclusive: true, upper: "15", upperInclusive: true }),
        band({ labelEn: "Tinggi", outcome: "NONE", sortOrder: 3, lower: "15", lowerInclusive: false }),
      ],
    },
    {
      code: "LOWEST",
      nameEn: "Against the lowest",
      provenance: "ASSUMED",
      governingSource: "",
      bands: [band({ labelEn: "Within 10 %", outcome: "NONE", sortOrder: 1, lower: "0", upper: "10", upperInclusive: true }), band({ labelEn: "Above 10 %", outcome: "NONE", sortOrder: 2, lower: "10", lowerInclusive: false })],
    },
    {
      code: "CPR",
      nameEn: "CPR",
      provenance: OBS,
      governingSource: "LAPORAN PENILAIAN SEBUTHARGA",
      bands: [
        band({ labelEn: "Gagal", outcome: "FAIL", sortOrder: 1, lower: "0", upper: "40" }),
        band({ labelEn: "Sederhana", outcome: "PASS", sortOrder: 2, lower: "40", upper: "60" }),
        band({ labelEn: "Baik", outcome: "PASS", sortOrder: 3, lower: "60", upper: "80" }),
        band({ labelEn: "Terbaik", outcome: "PASS", sortOrder: 4, lower: "80", upper: "100", upperInclusive: true }),
      ],
    },
  ],
};
