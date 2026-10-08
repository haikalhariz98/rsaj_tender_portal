/**
 * The record an approval route belongs to, as the exact document a signature on its step signs (NFR-SIG-001; ADR 0034 D12). A route is opened for exactly one matter, and a
 * conflict declared at one of its steps (FR-APR-009) is signed against that matter, never against the step's own row (the signature scan refuses a record that names itself).
 * Pure: the route's pointers in, the matter's model and id out; null where the route points at nothing the product can name (a route whose matter is gone).
 */

export interface RoutePointers {
  requisitionId: string | null;
  exerciseId: string | null;
  awardId: string | null;
  supplierApplicationId: string | null;
  standingRequestId: string | null;
  specialPermissionId: string | null;
  certificateId: string | null;
  variationId: string | null;
  contractMatterId: string | null;
}

export type MatterDocument = { entity: string; id: string };

/// The most specific pointer wins: a contract's matter, variation or certificate before the award it hangs from, the award before its exercise, the exercise before its requisition.
export function matterDocumentOf(r: RoutePointers): MatterDocument | null {
  const pairs: [string, string | null][] = [
    ["ContractMatter", r.contractMatterId],
    ["Variation", r.variationId],
    ["Certificate", r.certificateId],
    ["SpecialPermission", r.specialPermissionId],
    ["StandingRequest", r.standingRequestId],
    ["SupplierApplication", r.supplierApplicationId],
    ["Award", r.awardId],
    ["SourcingExercise", r.exerciseId],
    ["Requisition", r.requisitionId],
  ];
  const found = pairs.find(([, id]) => id != null);
  return found ? { entity: found[0], id: found[1]! } : null;
}
