/**
 * The words for 6.4's vocabulary and findings. Codes never reach a screen (AGENTS.md
 * rule 5): every enum value, fault and behaviour key has a label here, and each finding
 * says what to do and where.
 */

import type { PackKind, PackPartState, PartContent, PartRole, PartSource, TenderPackStatus, LadKind, UpliftKind, AppendixStatus } from "./types";

export const NOT_SET = "Not set";

export const PACK_KIND_LABEL: Readonly<Record<PackKind, string>> = {
  TENDER: "Tender documents",
  QUOTATION: "Quotation documents",
  NONE: "No document pack",
};

export const PART_ROLE_LABEL: Readonly<Record<PartRole, string>> = {
  INVITATION: "Invitation",
  INSTRUCTIONS: "Instructions to tenderers",
  FORM_OF_TENDER: "Form of tender",
  CONDITIONS: "Conditions of contract",
  APPENDIX: "Appendix to the conditions",
  LOA_SPECIMEN: "Specimen letter of acceptance",
  BOND_FORMS: "Bond and security forms",
  SPECIFICATION: "Specification",
  BILL_OF_QUANTITIES: "Bills of quantities",
  SUMMARY_AND_RATES: "Summary of tender and schedule of rates",
  REGISTRATION_BACKGROUND: "Registration and background",
  DECLARATION: "Tenderer's declaration",
  DRAWINGS: "Drawings",
  OTHER: "Other",
};

export const PART_CONTENT_LABEL: Readonly<Record<PartContent, string>> = {
  STANDARD: "Standard",
  BESPOKE: "Bespoke",
  MIXED: "Standard and bespoke",
};

export const PART_SOURCE_LABEL: Readonly<Record<PartSource, string>> = {
  TEMPLATE: "From the template library",
  BQ_UNPRICED: "The bill of quantities, unpriced",
  APPENDIX: "The Appendix entered here",
  UPLOAD: "A file uploaded to the part",
};

export const PACK_STATUS_LABEL: Readonly<Record<TenderPackStatus, string>> = {
  DRAFT: "Draft",
  SUBMITTED: "With approval",
  APPROVED: "Approved for tendering",
  RETURNED: "Returned for amendment",
  VOID: "Void",
};

export const PART_STATE_LABEL: Readonly<Record<PackPartState, string>> = {
  NOT_STARTED: "Not ready",
  READY: "Ready",
  OMITTED: "Omitted",
};

export const LAD_KIND_LABEL: Readonly<Record<LadKind, string>> = {
  AMOUNT_PER_DAY: "An amount a day",
  PERCENT_OF_SUM_PER_DAY: "A percentage of the contract sum a day",
};

export const UPLIFT_KIND_LABEL: Readonly<Record<UpliftKind, string>> = {
  AMOUNT: "An amount",
  PERCENT: "A percentage of the contract sum",
};

export const APPENDIX_STATUS_LABEL: Readonly<Record<AppendixStatus, string>> = {
  DRAFT: "Being entered",
  COMPLETE: "Complete",
};

/// A three-state answer in words: never a null read as "no".
export const yesNoNotSet = (b: boolean | null | undefined) => (b == null ? NOT_SET : b ? "Yes" : "No");
