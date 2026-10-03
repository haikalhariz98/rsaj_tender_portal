import { describe, expect, it } from "vitest";

import { CERTIFICATE_KINDS } from "@/lib/certificate/types";

import type { DelegationFacts } from "./authority";
import { RECOMMENDING_ACT, supervisedHolders } from "./blocks";

/**
 * BD-613-13, resolved at step 3 (BD-613-30): on an interim payment certificate the recommending officer is a
 * representative in force whose delegation covers valuing work for interim payment (FR-PAY-017). Invented people.
 */

const so = { holderIds: ["p-so"], delegates: [] };
const del = (over: Partial<DelegationFacts>): DelegationFacts => ({ id: "d1", kind: "SPECIALIST_QS", delegatePersonId: "p-qs", letterIssuedOn: "2026-10-01", revokedOn: null, scope: ["VALUATION"], ...over });

describe("the recommending officer", () => {
  it("on an interim certificate: the representatives in force whose scope lists valuation", () => {
    const ds = [del({}), del({ id: "d2", kind: "PRINCIPAL", delegatePersonId: "p-pri", scope: ["DIARY", "INSTRUCTION"] })];
    expect(supervisedHolders("RECOMMENDING_OFFICER", so, ds, "2026-10-05", "INTERIM_PAYMENT")).toEqual({ holderIds: ["p-qs"], delegates: [] });
  });
  it("a representative who may issue instructions but not value is not one (FR-PAY-017)", () => {
    expect(supervisedHolders("RECOMMENDING_OFFICER", so, [del({ scope: ["INSTRUCTION"] })], "2026-10-05", "INTERIM_PAYMENT")).toBeNull();
  });
  it("out of force (letter not issued, revoked): nobody", () => {
    expect(supervisedHolders("RECOMMENDING_OFFICER", so, [del({ letterIssuedOn: null })], "2026-10-05", "INTERIM_PAYMENT")).toBeNull();
    expect(supervisedHolders("RECOMMENDING_OFFICER", so, [del({ revokedOn: "2026-10-05" })], "2026-10-05", "INTERIM_PAYMENT")).toBeNull();
  });
  it("a kind that names no recommending act, or none given: nobody is assumed", () => {
    expect(supervisedHolders("RECOMMENDING_OFFICER", so, [del({})], "2026-10-05", "NON_COMPLETION")).toBeNull();
    expect(supervisedHolders("RECOMMENDING_OFFICER", so, [del({})], "2026-10-05")).toBeNull();
  });
  it("no S.O. on the day: nobody", () => {
    expect(supervisedHolders("RECOMMENDING_OFFICER", null, [del({})], "2026-10-05", "INTERIM_PAYMENT")).toBeNull();
  });
  it("every certificate kind is decided (an exhaustive map)", () => {
    expect(Object.keys(RECOMMENDING_ACT).sort()).toEqual([...CERTIFICATE_KINDS].sort());
  });
});
