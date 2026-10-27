/**
 * RSAJ starter pack, funding (ADR 0046, plan step 8): the four funding sources RSAJ's requirements state, and the two impact measures SF-04 gives
 * as its own examples. Data only.
 *
 * - SUKUK26T1 carries its RM100m envelope (STATED). Its eligibility is NOT loaded: the document's SUK-LAND and SUK-TANK are project groups of D365's
 *   DEV03 test environment, not a stated policy (RSAJ question 40), so it stays not set and every requisition picking it says so.
 * - INTERNAL, GRANT and NA take any category, ASSUMED: SF-02 limits only a sukuk source, so this is a reading of the document, and the tag says so.
 * - No project category is loaded: RSAJ has named none.
 */

import { list } from "./shape";

const SOURCES = { requirement: "SF-01, SF-03, PR-04", source: "RSAJ Portal Requirements (2026-10-27), D365 configuration: FundingSource values" };
const ANY_ASSUMED = { categoriesRestricted: false, eligibilityProvenance: "ASSUMED" as const };

export const FUNDING_SOURCES = list("FundingSource", "Funding source", [
  { code: "SUKUK26T1", values: { nameEn: "Sukuk Tranche 1 2026", envelope: "100000000.00" }, ...SOURCES },
  { code: "INTERNAL", values: { nameEn: "Internal", ...ANY_ASSUMED }, ...SOURCES },
  { code: "GRANT", values: { nameEn: "Grant", ...ANY_ASSUMED }, ...SOURCES },
  { code: "NA", values: { nameEn: "Not applicable", ...ANY_ASSUMED }, ...SOURCES },
]);

const MEASURES = { requirement: "SF-04", source: "SF-04 (the requirement's own examples)" };
export const IMPACT_MEASURES = list("ImpactMeasure", "Impact measure", [
  { code: "storage_added", values: { nameEn: "Storage added", unit: "ML", provenance: "ASSUMED" }, ...MEASURES },
  { code: "households_served", values: { nameEn: "Households served", unit: "households", provenance: "ASSUMED" }, ...MEASURES },
]);

export const FUNDING = { lists: [FUNDING_SOURCES, IMPACT_MEASURES], groups: [] };
