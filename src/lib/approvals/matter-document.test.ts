import { describe, expect, it } from "vitest";

import { matterDocumentOf, type RoutePointers } from "./matter-document";

const NONE: RoutePointers = { requisitionId: null, exerciseId: null, awardId: null, supplierApplicationId: null, standingRequestId: null, specialPermissionId: null, certificateId: null, variationId: null, contractMatterId: null };

describe("the matter a route's step is signed against", () => {
  it("is the one record the route belongs to, whichever kind it is", () => {
    expect(matterDocumentOf({ ...NONE, requisitionId: "r1" })).toEqual({ entity: "Requisition", id: "r1" });
    expect(matterDocumentOf({ ...NONE, exerciseId: "e1" })).toEqual({ entity: "SourcingExercise", id: "e1" });
    expect(matterDocumentOf({ ...NONE, awardId: "a1" })).toEqual({ entity: "Award", id: "a1" });
    expect(matterDocumentOf({ ...NONE, supplierApplicationId: "s1" })).toEqual({ entity: "SupplierApplication", id: "s1" });
    expect(matterDocumentOf({ ...NONE, standingRequestId: "q1" })).toEqual({ entity: "StandingRequest", id: "q1" });
    expect(matterDocumentOf({ ...NONE, specialPermissionId: "p1" })).toEqual({ entity: "SpecialPermission", id: "p1" });
    expect(matterDocumentOf({ ...NONE, certificateId: "c1" })).toEqual({ entity: "Certificate", id: "c1" });
    expect(matterDocumentOf({ ...NONE, variationId: "v1" })).toEqual({ entity: "Variation", id: "v1" });
    expect(matterDocumentOf({ ...NONE, contractMatterId: "m1" })).toEqual({ entity: "ContractMatter", id: "m1" });
  });

  it("is the most specific record where a route carries more than one pointer, and nothing where it points at none: a signature never names a document it cannot say", () => {
    expect(matterDocumentOf(NONE)).toBeNull();
    expect(matterDocumentOf({ ...NONE, requisitionId: "r1", exerciseId: "e1" })).toEqual({ entity: "SourcingExercise", id: "e1" });
    expect(matterDocumentOf({ ...NONE, exerciseId: "e1", awardId: "a1" })).toEqual({ entity: "Award", id: "a1" });
    expect(matterDocumentOf({ ...NONE, awardId: "a1", variationId: "v1" })).toEqual({ entity: "Variation", id: "v1" });
  });
});
