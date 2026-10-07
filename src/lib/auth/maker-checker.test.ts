import { describe, expect, it } from "vitest";

import { makerCheckerFault, secondPersonAvailable } from "./maker-checker";

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
