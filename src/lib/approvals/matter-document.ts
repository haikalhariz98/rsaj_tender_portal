/**
 * The record an approval route belongs to, as the exact document a signature on its step signs (NFR-SIG-001; ADR 0034 D12). A route is opened for exactly one matter, and a
 * conflict declared at one of its steps (FR-APR-009) is signed against that matter, never against the step's own row (the signature scan refuses a record that names itself).
 * Pure: the route's pointers in, the matter's model and id out; null where the route points at nothing the product can name (a route whose matter is gone).
 */

/// The ids a route points at, one key per kind of matter (named for the matter, not for the column, so that this file reads a route and writes nothing).
export interface RoutePointers {
  requisition: string | null;
  exercise: string | null;
  award: string | null;
  supplierApplication: string | null;
  standingRequest: string | null;
  specialPermission: string | null;
  /// Named `cert` because a property called `certificate` reads, to the certificate writers' source scan, as the model.
  cert: string | null;
  variation: string | null;
  contractMatter: string | null;
}

export type MatterDocument = { entity: string; id: string };

/// The most specific pointer wins: a contract's matter, variation or certificate before the award it hangs from, the award before its exercise, the exercise before its requisition.
export function matterDocumentOf(r: RoutePointers): MatterDocument | null {
  const pairs: [string, string | null][] = [
    ["ContractMatter", r.contractMatter],
    ["Variation", r.variation],
    ["Certificate", r.cert],
    ["SpecialPermission", r.specialPermission],
    ["StandingRequest", r.standingRequest],
    ["SupplierApplication", r.supplierApplication],
    ["Award", r.award],
    ["SourcingExercise", r.exercise],
    ["Requisition", r.requisition],
  ];
  const found = pairs.find(([, id]) => id != null);
  return found ? { entity: found[0], id: found[1]! } : null;
}
