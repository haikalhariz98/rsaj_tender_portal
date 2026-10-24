/**
 * The ONE list of what a search may match, for global search and every server list's `q` (ADR 0044 D1). Pure.
 *
 * Prisma paths, through to-one relations only. Identifiers and titles only: never a SULIT field, a creditor or bank column, an
 * evaluation, opening, bid or sealing column, or a Malay name. `fields.scan.test.ts` walks each path through the schema and holds
 * the list to that, so search never reads a value it could leak and writes no `SulitAccessEvent`.
 */

export type SearchEntity = "requisition" | "exercise" | "project" | "supplier" | "sitting" | "application";

export const SEARCH_FIELDS: Readonly<Record<SearchEntity, readonly string[]>> = {
  requisition: ["reference", "title", "erpRequisitionNo", "erpNoteNo"],
  exercise: ["reference", "title", "requisition.reference", "requisition.erpRequisitionNo"],
  // A project is an award. Its `exercise.*` paths are AND-ed with the exercise's own guard by the caller (plan 7.2).
  // `awardeeName` is the contractor, not SULIT, and on every Projects row and export already (security review, 2026-10-24: restored).
  project: ["reference", "erpCommitmentNo", "contract.number", "awardeeName", "exercise.reference", "exercise.title", "exercise.requisition.erpRequisitionNo"],
  supplier: ["reference", "registeredName", "registrationNo", "erpVendorCode"],
  // A committee sitting (the Meeting model), on the sittings list's own fields (ST-3).
  sitting: ["reference", "committee.nameEn"],
  // A supplier application (the Suppliers list's Applications tab): its applicant, by name, reference and registration number. Not in global search.
  application: ["supplier.registeredName", "supplier.reference", "supplier.registrationNo"],
};

/// The exact-key columns: a whole-value match on one of these opens the case group (ST-4, FR-REQ-002).
export const CASE_KEYS: Readonly<Partial<Record<SearchEntity, readonly string[]>>> = {
  requisition: ["reference", "erpRequisitionNo", "erpNoteNo"],
  exercise: ["reference"],
  project: ["reference", "erpCommitmentNo", "contract.number"],
};

/// The Prisma model each entity's paths start from, for the scans.
export const SEARCH_MODEL: Readonly<Record<SearchEntity, string>> = {
  requisition: "Requisition",
  exercise: "SourcingExercise",
  project: "Award",
  supplier: "Supplier",
  sitting: "Meeting",
  application: "SupplierApplication",
};
