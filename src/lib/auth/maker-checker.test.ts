import { describe, expect, it } from "vitest";

import { draftIssueFault, makerCheckerFault, secondPersonAvailable } from "./maker-checker";

describe("who may issue a draft of the approval matrix (ADR 0034 D15)", () => {
  it("is anyone who did not make it", () => {
    expect(makerCheckerFault({ makerPersonIds: ["p1", "p2"], makersUnknownAtLanding: false, issuerPersonId: "p3" })).toBeNull();
  });

  it("is never a maker, by Person", () => {
    const fault = makerCheckerFault({ makerPersonIds: ["p1", "p2"], makersUnknownAtLanding: false, issuerPersonId: "p2" });
    expect(fault?.code).toBe("ISSUER_IS_MAKER");
    expect(fault?.en).toMatch(/second person/);
  });

  it("is nobody, until it is adopted, where its makers are unknown", () => {
    expect(makerCheckerFault({ makerPersonIds: [], makersUnknownAtLanding: true, issuerPersonId: "p3" })?.code).toBe("MAKERS_UNKNOWN");
  });

  it("is nobody, until it is adopted, where it has no maker on record at all", () => {
    expect(makerCheckerFault({ makerPersonIds: [], makersUnknownAtLanding: false, issuerPersonId: "p3" })?.code).toBe("NO_MAKER_ON_RECORD");
  });

  it("is a different person once it has been adopted, even where its makers were unknown at landing", () => {
    expect(makerCheckerFault({ makerPersonIds: ["p1"], makersUnknownAtLanding: true, issuerPersonId: "p3" })).toBeNull();
    expect(makerCheckerFault({ makerPersonIds: ["p1"], makersUnknownAtLanding: true, issuerPersonId: "p1" })?.code).toBe("ISSUER_IS_MAKER");
  });

  it("says a second person is needed where only the makers are eligible: nothing fakes an approval", () => {
    expect(secondPersonAvailable(["p1"], ["p1"])).toBe(false);
    expect(secondPersonAvailable(["p1"], ["p1", "p2"])).toBe(true);
    expect(secondPersonAvailable([], [])).toBe(false);
  });
});

describe("a second person is needed (Phase 2c)", () => {
  it("is said, rather than an issue that must be refused, where the issuer is a maker and nobody else could issue", () => {
    const fault = makerCheckerFault({ makerPersonIds: ["p1"], makersUnknownAtLanding: false, issuerPersonId: "p1", eligiblePersonIds: ["p1"] });
    expect(fault?.code).toBe("SECOND_PERSON_NEEDED");
    expect(fault?.en).toMatch(/second person is needed/);
  });

  it("is the plain refusal where someone else could issue it", () => {
    expect(makerCheckerFault({ makerPersonIds: ["p1"], makersUnknownAtLanding: false, issuerPersonId: "p1", eligiblePersonIds: ["p1", "p2"] })?.code).toBe("ISSUER_IS_MAKER");
  });

  it("never lets the maker through, whoever else is eligible: the eligible list only changes what is said", () => {
    for (const eligible of [[], ["p1"], ["p1", "p2"], undefined]) {
      expect(makerCheckerFault({ makerPersonIds: ["p1"], makersUnknownAtLanding: true, issuerPersonId: "p1", eligiblePersonIds: eligible })).not.toBeNull();
    }
  });
});

describe("who may issue a draft that has no adopt act of its own (Phase 5a: an evaluation model's, a rate schedule's)", () => {
  it("is anyone who did not make it", () => {
    expect(draftIssueFault({ makerPersonIds: ["p1", "p2"], issuerPersonId: "p3" })).toBeNull();
  });

  it("is never a maker, by Person, and says a second person is needed where nobody else could issue", () => {
    expect(draftIssueFault({ makerPersonIds: ["p1"], issuerPersonId: "p1", eligiblePersonIds: ["p1", "p2"] })?.code).toBe("ISSUER_IS_MAKER");
    expect(draftIssueFault({ makerPersonIds: ["p1"], issuerPersonId: "p1", eligiblePersonIds: ["p1"] })?.code).toBe("SECOND_PERSON_NEEDED");
    expect(draftIssueFault({ makerPersonIds: ["p1"], issuerPersonId: "p1" })).not.toBeNull();
  });

  it("is nobody while nobody is on record as having made it, whoever asks: a save puts the first person on record, and a different person issues it", () => {
    for (const issuer of ["p1", "p2"]) {
      const fault = draftIssueFault({ makerPersonIds: [], issuerPersonId: issuer, eligiblePersonIds: ["p1", "p2"] });
      expect(fault?.code).toBe("NO_MAKER_ON_RECORD");
      expect(fault?.en).toMatch(/edit it first/);
      expect(fault?.ms.length).toBeGreaterThan(20);
    }
  });
});
