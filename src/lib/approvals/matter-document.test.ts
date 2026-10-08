import { describe, expect, it } from "vitest";

import { matterDocumentOf, type RoutePointers } from "./matter-document";

const NONE: RoutePointers = { requisition: null, exercise: null, award: null, supplierApplication: null, standingRequest: null, specialPermission: null, certificate: null, variation: null, contractMatter: null };

describe("the matter a route's step is signed against", () => {
  it("is the one record the route belongs to, whichever kind it is", () => {
    expect(matterDocumentOf({ ...NONE, requisition: "r1" })).toEqual({ entity: "Requisition", id: "r1" });
    expect(matterDocumentOf({ ...NONE, exercise: "e1" })).toEqual({ entity: "SourcingExercise", id: "e1" });
    expect(matterDocumentOf({ ...NONE, award: "a1" })).toEqual({ entity: "Award", id: "a1" });
    expect(matterDocumentOf({ ...NONE, supplierApplication: "s1" })).toEqual({ entity: "SupplierApplication", id: "s1" });
    expect(matterDocumentOf({ ...NONE, standingRequest: "q1" })).toEqual({ entity: "StandingRequest", id: "q1" });
    expect(matterDocumentOf({ ...NONE, specialPermission: "p1" })).toEqual({ entity: "SpecialPermission", id: "p1" });
    expect(matterDocumentOf({ ...NONE, certificate: "c1" })).toEqual({ entity: "Certificate", id: "c1" });
    expect(matterDocumentOf({ ...NONE, variation: "v1" })).toEqual({ entity: "Variation", id: "v1" });
    expect(matterDocumentOf({ ...NONE, contractMatter: "m1" })).toEqual({ entity: "ContractMatter", id: "m1" });
  });

  it("is the most specific record where a route carries more than one pointer, and nothing where it points at none: a signature never names a document it cannot say", () => {
    expect(matterDocumentOf(NONE)).toBeNull();
    expect(matterDocumentOf({ ...NONE, requisition: "r1", exercise: "e1" })).toEqual({ entity: "SourcingExercise", id: "e1" });
    expect(matterDocumentOf({ ...NONE, exercise: "e1", award: "a1" })).toEqual({ entity: "Award", id: "a1" });
    expect(matterDocumentOf({ ...NONE, award: "a1", variation: "v1" })).toEqual({ entity: "Variation", id: "v1" });
  });
});
