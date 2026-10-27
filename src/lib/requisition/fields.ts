/**
 * What a requisition must carry (FR-REQ-001), and what its finance-system references
 * must look like (FR-REQ-002).
 *
 * Pure. Lookups are the lists in force on the day; formats are the customer's
 * `CodeFormat` rows. An unset format is a warning that says so, never a pass: nobody
 * has said what a cost centre looks like here, so the portal cannot certify one.
 */

import { inForceOn } from "@/lib/effective";
import { eligibilityOf, inForce } from "@/lib/funding/eligibility";
import type { SourceRef } from "@/lib/funding/types";
import { addSen, parseSen, type Sen } from "@/lib/money";
import { checkCode, findFormat } from "@/lib/organisation/structure";
import type { CodeFormat, OrgUnit } from "@/lib/organisation/types";

export interface DraftLine {
  description: string;
  quantity: string | null;
  unit: string | null;
  estimatedUnitPrice: string | null;
  estimatedAmount: string | null;
}

export interface RequisitionDraft {
  title: string;
  justification: string;
  needStatement: string;
  requestingUnitCode: string | null;
  sectionUnitCode: string | null;
  requestingPersonId: string | null;
  costCentreCode: string | null;
  accountCode: string | null;
  budgetCodeId: string | null;
  siteCode: string | null;
  placeOfDelivery: string;
  /// YYYY-MM-DD.
  dateRequired: string | null;
  /// A decimal string.
  estimatedValue: string | null;
  fundingRouteCode: string | null;
  /// Optional: what is being bought.
  contractTypeCode?: string | null;
  /// Where the money comes from (SF-01, PR-04, ADR 0046). Optional. Not the funding route.
  fundingSourceId?: string | null;
  /// What the project is for (SF-02): required only by a source whose eligibility is "only these".
  projectCategoryCode?: string | null;
  lines: DraftLine[];
}

export interface Lookups {
  units: readonly OrgUnit[];
  costCentres: readonly { code: string; orgUnitCode: string | null; effectiveFrom: Date; effectiveTo: Date | null }[];
  accountCodes: readonly { code: string; effectiveFrom: Date; effectiveTo: Date | null }[];
  sites: readonly { code: string; effectiveFrom: Date; effectiveTo: Date | null }[];
  budgetCodes: readonly {
    id: string;
    accountCode: string;
    isActive: boolean;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }[];
  people: readonly { id: string; isActive: boolean }[];
  fundingRoutes: readonly { code: string; retiredOn: Date | null }[];
  contractTypes?: readonly { code: string; retiredOn: Date | null }[];
  fundingSources?: readonly (Pick<SourceRef, "id" | "categoriesRestricted" | "eligibleCategoryCodes" | "retiredOn"> & { nameEn: string })[];
  projectCategories?: readonly { code: string; retiredOn: Date | null }[];
}

export type FieldFault =
  | { field: string; code: "REQUIRED" }
  | { field: "lines"; code: "NO_LINES" }
  | { field: string; code: "LINE_AMOUNT_REQUIRED"; lineNo: number }
  | { field: string; code: "LINE_DESCRIPTION_REQUIRED"; lineNo: number }
  | { field: "lines"; code: "LINES_DO_NOT_SUM"; total: Sen; value: Sen }
  | { field: string; code: "NOT_IN_FORCE" }
  | { field: "requestingUnitCode"; code: "NOT_A_DEPARTMENT" }
  | { field: "sectionUnitCode"; code: "SECTION_NOT_UNDER_UNIT" }
  | { field: "requestingPersonId"; code: "INACTIVE_PERSON" }
  | { field: "accountCode"; code: "ACCOUNT_NOT_BUDGET_CODE_ACCOUNT" }
  | { field: string; code: "MALFORMED"; example: string; description: string }
  | { field: string; code: "BAD_PATTERN" }
  /// A warning, never a block: no format is configured, so none can be checked.
  | { field: string; code: "NO_FORMAT" }
  /// SF-02, FS-4: the source may not fund this project category.
  | { field: "fundingSourceId"; code: "NOT_ELIGIBLE" }
  /// The source names its eligible categories, so the requisition must name one.
  | { field: "projectCategoryCode"; code: "CATEGORY_REQUIRED" }
  /// A warning, never a block: the source's eligibility is not set, so none can be judged. `source`: its name, for the words.
  | { field: "fundingSourceId"; code: "ELIGIBILITY_NOT_SET"; source: string };

export const WARNING_CODES: ReadonlySet<FieldFault["code"]> = new Set(["NO_FORMAT", "ELIGIBILITY_NOT_SET"]);

/// Faults that stop a requisition leaving Draft. `NO_FORMAT` is shown, not blocking.
export function blocking(faults: readonly FieldFault[]): FieldFault[] {
  return faults.filter((f) => !WARNING_CODES.has(f.code));
}

const REQUIRED: [keyof RequisitionDraft, string][] = [
  ["title", "title"],
  ["justification", "justification"],
  ["requestingUnitCode", "requestingUnitCode"],
  ["requestingPersonId", "requestingPersonId"],
  ["costCentreCode", "costCentreCode"],
  ["accountCode", "accountCode"],
  // Founder, 2026-10-05: the budget line the check reads is required, as the cost centre and account are.
  ["budgetCodeId", "budgetCodeId"],
  ["placeOfDelivery", "placeOfDelivery"],
  ["dateRequired", "dateRequired"],
  ["estimatedValue", "estimatedValue"],
];

const amount = (v: string | null): Sen | null => {
  if (v == null || v.trim() === "") return null;
  try {
    return parseSen(v);
  } catch {
    return null;
  }
};

/**
 * Everything wrong with a requisition, judged on `on` (the organisation's today).
 *
 * `complete: false` checks only what was given — a draft may be saved half-written,
 * but a value it does give must be a real one. `complete: true` also requires every
 * FR-REQ-001 field, at least one line, and lines that sum to the estimated value:
 * the test for leaving Draft and for submission.
 */
export function requisitionFaults(
  draft: RequisitionDraft,
  lookups: Lookups,
  formats: readonly CodeFormat[],
  on: Date,
  opts: { complete: boolean } = { complete: true },
): FieldFault[] {
  const faults: FieldFault[] = [];
  const given = (v: unknown) => v != null && String(v).trim() !== "";

  if (opts.complete) {
    for (const [key, field] of REQUIRED) if (!given(draft[key])) faults.push({ field, code: "REQUIRED" });
    if (draft.lines.length === 0) faults.push({ field: "lines", code: "NO_LINES" });
  }

  draft.lines.forEach((l, i) => {
    if (!given(l.description)) faults.push({ field: `lines.${i}.description`, code: "LINE_DESCRIPTION_REQUIRED", lineNo: i + 1 });
    if (amount(l.estimatedAmount) == null) faults.push({ field: `lines.${i}.estimatedAmount`, code: "LINE_AMOUNT_REQUIRED", lineNo: i + 1 });
  });

  const value = amount(draft.estimatedValue);
  if (opts.complete && value != null && draft.lines.length > 0) {
    const total = addSen(...draft.lines.map((l) => amount(l.estimatedAmount) ?? 0n));
    if (total !== value) faults.push({ field: "lines", code: "LINES_DO_NOT_SUM", total, value });
  }

  // Lookups: in force on the day.
  const unitsInForce = lookups.units.filter((u) => inForceOn(u, on));
  if (given(draft.requestingUnitCode)) {
    const unit = unitsInForce.find((u) => u.code === draft.requestingUnitCode);
    if (!unit) faults.push({ field: "requestingUnitCode", code: "NOT_IN_FORCE" });
    else if (unit.kind !== "DEPARTMENT") faults.push({ field: "requestingUnitCode", code: "NOT_A_DEPARTMENT" });
  }
  if (given(draft.sectionUnitCode)) {
    const section = unitsInForce.find((u) => u.code === draft.sectionUnitCode);
    if (!section) faults.push({ field: "sectionUnitCode", code: "NOT_IN_FORCE" });
    else if (section.parentCode !== draft.requestingUnitCode) faults.push({ field: "sectionUnitCode", code: "SECTION_NOT_UNDER_UNIT" });
  }
  if (given(draft.requestingPersonId)) {
    const person = lookups.people.find((p) => p.id === draft.requestingPersonId);
    if (!person) faults.push({ field: "requestingPersonId", code: "NOT_IN_FORCE" });
    else if (!person.isActive) faults.push({ field: "requestingPersonId", code: "INACTIVE_PERSON" });
  }

  const coded = (field: "costCentreCode" | "accountCode", key: string, list: readonly { code: string; effectiveFrom: Date; effectiveTo: Date | null }[]) => {
    const value = draft[field];
    if (!given(value)) return;
    if (!list.some((x) => x.code === value && inForceOn(x, on))) faults.push({ field, code: "NOT_IN_FORCE" });
    const check = checkCode(value!, findFormat(formats, key));
    if (check.state === "NO_FORMAT") faults.push({ field, code: "NO_FORMAT" });
    if (check.state === "BAD_PATTERN") faults.push({ field, code: "BAD_PATTERN" });
    if (check.state === "MALFORMED") faults.push({ field, code: "MALFORMED", example: check.example, description: check.description });
  };
  coded("costCentreCode", "cost_centre", lookups.costCentres);
  coded("accountCode", "account_code", lookups.accountCodes);

  if (given(draft.siteCode) && !lookups.sites.some((s) => s.code === draft.siteCode && inForceOn(s, on))) {
    faults.push({ field: "siteCode", code: "NOT_IN_FORCE" });
  }
  if (given(draft.budgetCodeId)) {
    const code = lookups.budgetCodes.find((b) => b.id === draft.budgetCodeId);
    if (!code || !code.isActive || !inForceOn(code, on)) faults.push({ field: "budgetCodeId", code: "NOT_IN_FORCE" });
    else if (given(draft.accountCode) && code.accountCode !== draft.accountCode) {
      // ADR 0004: the budget code is checked against its own account line.
      faults.push({ field: "accountCode", code: "ACCOUNT_NOT_BUDGET_CODE_ACCOUNT" });
    }
  }
  if (given(draft.fundingRouteCode)) {
    const route = lookups.fundingRoutes.find((r) => r.code === draft.fundingRouteCode);
    if (!route || (route.retiredOn != null && route.retiredOn <= on)) faults.push({ field: "fundingRouteCode", code: "NOT_IN_FORCE" });
  }

  if (given(draft.contractTypeCode) && lookups.contractTypes) {
    const ct = lookups.contractTypes.find((c) => c.code === draft.contractTypeCode);
    if (!ct || (ct.retiredOn != null && ct.retiredOn <= on)) faults.push({ field: "contractTypeCode", code: "NOT_IN_FORCE" });
  }

  faults.push(...fundingSourceFaults(draft, lookups, on, opts.complete));
  return faults;
}

/**
 * SF-02 (FS-4): the source in force, the category in force, and the source eligible for the category. Judged when a requisition leaves Draft and when its source is changed.
 * `sourceKept`: the act keeps the source it already holds (amendment 14 records only a category), so a source retired since is not refused for that; its eligibility is still judged.
 */
export function fundingSourceFaults(
  draft: Pick<RequisitionDraft, "fundingSourceId" | "projectCategoryCode">,
  lookups: Pick<Lookups, "fundingSources" | "projectCategories">,
  on: Date,
  complete: boolean,
  opts: { sourceKept?: boolean } = {},
): FieldFault[] {
  const faults: FieldFault[] = [];
  if (draft.projectCategoryCode && lookups.projectCategories && !lookups.projectCategories.some((c) => c.code === draft.projectCategoryCode && inForce(c, on))) {
    faults.push({ field: "projectCategoryCode", code: "NOT_IN_FORCE" });
  }
  if (!draft.fundingSourceId || !lookups.fundingSources) return faults;
  const source = lookups.fundingSources.find((s) => s.id === draft.fundingSourceId);
  if (!source || (!opts.sourceKept && !inForce(source, on))) return [...faults, { field: "fundingSourceId", code: "NOT_IN_FORCE" }];
  const e = eligibilityOf(source, draft.projectCategoryCode ?? null);
  if (e.state === "NOT_ELIGIBLE") faults.push({ field: "fundingSourceId", code: "NOT_ELIGIBLE" });
  if (e.state === "CATEGORY_MISSING" && complete) faults.push({ field: "projectCategoryCode", code: "CATEGORY_REQUIRED" });
  if (e.state === "NOT_SET") faults.push({ field: "fundingSourceId", code: "ELIGIBILITY_NOT_SET", source: source.nameEn });
  return faults;
}

export type ErpRefFault =
  | { field: "erpRequisitionNo" | "erpNoteNo"; code: "MALFORMED"; example: string; description: string }
  | { field: "erpRequisitionNo" | "erpNoteNo"; code: "BAD_PATTERN" }
  | { field: "erpRequisitionNo" | "erpNoteNo"; code: "NO_FORMAT" };

/**
 * The finance system's numbers, against their configured shapes (`erp_requisition_no`,
 * `erp_note_no`). The shape is data, so a counter that runs on across years
 * (PROC2025150424 then PROC2026154676) is simply a pattern that does not reset.
 */
export function erpRefFaults(
  proc: string | null,
  nm: string | null,
  formats: readonly CodeFormat[],
): ErpRefFault[] {
  const faults: ErpRefFault[] = [];
  const one = (field: "erpRequisitionNo" | "erpNoteNo", value: string | null, key: string) => {
    if (value == null || value.trim() === "") return;
    const check = checkCode(value.trim(), findFormat(formats, key));
    if (check.state === "NO_FORMAT") faults.push({ field, code: "NO_FORMAT" });
    if (check.state === "BAD_PATTERN") faults.push({ field, code: "BAD_PATTERN" });
    if (check.state === "MALFORMED") faults.push({ field, code: "MALFORMED", example: check.example, description: check.description });
  };
  one("erpRequisitionNo", proc, "erp_requisition_no");
  one("erpNoteNo", nm, "erp_note_no");
  return faults;
}
