/**
 * Invented registration bodies, values, document types and a small matrix for the register's tests.
 * Never seeded and never any customer's lists (6.4 Q-8 precedent): the published CIDB/MOF lists are an
 * RSAJ go-live seed. Thresholds here (30/60/90, 60 months) are fixtures, ASSUMED.
 */

import type { Matrix, Rule } from "@/lib/authority/types";

import type { DocumentFacts, DocumentTypeFacts } from "./types";

export const BODY_WORKS = "body_works";
export const BODY_SUPPLY = "body_supply";
export const BODY_COMPANIES = "body_companies";

export const TYPES: Record<"companies" | "works" | "supply" | "restriction" | "clearance", DocumentTypeFacts> = {
  companies: { id: "t_companies", label: "Companies registry certificate", bodyId: BODY_COMPANIES, valueKinds: [], expires: false, mandatoryAtRegistration: true, notApplicableAllowed: false, retiredOn: null },
  works: { id: "t_works", label: "Works board certificate", bodyId: BODY_WORKS, valueKinds: ["GRADE", "CATEGORY", "SPECIALISATION"], expires: true, mandatoryAtRegistration: true, notApplicableAllowed: false, retiredOn: null },
  supply: { id: "t_supply", label: "Supplier register certificate", bodyId: BODY_SUPPLY, valueKinds: ["FIELD_CODE"], expires: true, mandatoryAtRegistration: false, notApplicableAllowed: true, retiredOn: null },
  restriction: { id: "t_status", label: "Status certificate", bodyId: null, valueKinds: [], expires: true, mandatoryAtRegistration: false, notApplicableAllowed: true, retiredOn: null },
  clearance: { id: "t_clearance", label: "Tax clearance letter", bodyId: null, valueKinds: [], expires: null, mandatoryAtRegistration: null, notApplicableAllowed: null, retiredOn: null },
};

export const doc = (o: Partial<DocumentFacts> & Pick<DocumentFacts, "id" | "typeId">): DocumentFacts => ({
  typeLabel: Object.values(TYPES).find((t) => t.id === o.typeId)?.label ?? "A type",
  lodgedOn: "2026-09-01",
  issuedOn: "2026-08-01",
  validFrom: null,
  expiresOn: null,
  notApplicable: false,
  verification: "VERIFIED",
  verifiedOn: "2026-09-02",
  supersedesId: null,
  ...o,
});

const rule = (r: Partial<Rule> & Pick<Rule, "ruleKey" | "domain">): Rule => ({
  method: null,
  cond: null,
  minValue: null,
  maxValue: null,
  pctMin: null,
  pctMax: null,
  contractValueMin: null,
  contractValueMax: null,
  followsBoundarySwitch: true,
  labelEn: r.ruleKey,
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

const role = (code: string, nameEn: string, selfApprovalEscalatesToCode: string | null = null, isCommittee = false) => ({ code, nameEn, nameMs: `${nameEn} (MS)`, isCommittee, escalatesToCode: null, selfApprovalEscalatesToCode });

/// A matrix with one unbounded registration rule (the officer recommends, the manager approves), a banded one that a null value never matches, and a committee rule for upgrades.
export const SUPPLIER_MATRIX: Matrix = {
  policy: { boundaryValue: 300_000, boundaryInclusive: true, quotationFloor: 15_000, tenderFloor: 300_000, requisitionBoundary: 50_000, currency: "MYR" },
  roles: Object.fromEntries([role("OFFICER", "Registration officer"), role("MANAGER", "Registration manager", "DIRECTOR"), role("DIRECTOR", "Director"), role("BOARD", "Board", null, true)].map((r) => [r.code, r])),
  rules: [
    rule({ ruleKey: "reg.any", domain: "supplier_registration", labelEn: "Supplier registration", approverCode: "MANAGER", recommenders: [{ roleCode: "OFFICER", act: "R" }] }),
    rule({ ruleKey: "reg.banded", domain: "supplier_registration", cond: "RENEWAL", minValue: 0, maxValue: 500_000, labelEn: "Renewal up to RM500,000", approverCode: "OFFICER" }),
    rule({ ruleKey: "reg.upgrade", domain: "supplier_registration", cond: "UPGRADE", labelEn: "Upgrade", approverCode: "MANAGER", recommenders: [{ roleCode: "BOARD", act: "R" }] }),
  ],
};
