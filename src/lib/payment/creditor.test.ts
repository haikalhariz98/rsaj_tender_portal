import { describe, expect, it } from "vitest";

import { creditorStanding, creditorStandingWords, creditorVersionState, type CreditorVersionFact } from "./creditor";

const v = (version: number, verification: CreditorVersionFact["verification"], sent = true): CreditorVersionFact => ({ version, sent, verification });

describe("which bank details a payment may go to (BD-613-44)", () => {
  it("nothing sent: payments are refused, as 'not entered'", () => {
    expect(creditorStanding([])).toEqual({ state: "NONE", reason: "NOT_ENTERED" });
    expect(creditorStanding([v(1, "NOT_CHECKED", false)])).toEqual({ state: "NONE", reason: "NOT_ENTERED" });
  });

  it("a version sent and not yet checked does not count", () => {
    expect(creditorStanding([v(1, "NOT_CHECKED")])).toEqual({ state: "NONE", reason: "AWAITING_CHECK" });
  });

  it("a version found not in order does not count either", () => {
    expect(creditorStanding([v(1, "NOT_IN_ORDER")])).toEqual({ state: "NONE", reason: "NOT_IN_ORDER" });
  });

  it("a checked version is in force", () => {
    expect(creditorStanding([v(1, "VERIFIED")])).toEqual({ state: "IN_FORCE", version: 1, awaiting: null });
  });

  it("a newer version that is not yet checked leaves the earlier checked one in force, and says it is waiting", () => {
    expect(creditorStanding([v(1, "VERIFIED"), v(2, "NOT_CHECKED")])).toEqual({ state: "IN_FORCE", version: 1, awaiting: 2 });
  });

  it("a newer version found not in order changes nothing and is not waiting", () => {
    expect(creditorStanding([v(1, "VERIFIED"), v(2, "NOT_IN_ORDER")])).toEqual({ state: "IN_FORCE", version: 1, awaiting: null });
  });

  it("the newest checked version is the one in force, whatever order they come in", () => {
    expect(creditorStanding([v(3, "VERIFIED"), v(1, "VERIFIED"), v(2, "NOT_IN_ORDER")])).toEqual({ state: "IN_FORCE", version: 3, awaiting: null });
  });

  it("a draft is neither in force nor waiting", () => {
    expect(creditorStanding([v(1, "VERIFIED"), v(2, "NOT_CHECKED", false)])).toEqual({ state: "IN_FORCE", version: 1, awaiting: null });
  });

  it("each version reads as in force, awaiting a check, not in order, superseded or a draft", () => {
    const all = [v(1, "VERIFIED"), v(2, "VERIFIED"), v(3, "NOT_CHECKED"), v(4, "NOT_IN_ORDER"), v(5, "NOT_CHECKED", false)];
    expect(all.map((x) => creditorVersionState(x, all))).toEqual(["SUPERSEDED", "IN_FORCE", "AWAITING_CHECK", "NOT_IN_ORDER", "DRAFT"]);
  });

  it("says in words whether a payment may go, and never as a zero or an empty account", () => {
    expect(creditorStandingWords({ state: "IN_FORCE", version: 2, awaiting: null })).toMatchObject({ payable: true });
    expect(creditorStandingWords({ state: "IN_FORCE", version: 2, awaiting: 3 }).en).toContain("Version 3 is waiting for a check and changes nothing until then");
    for (const reason of ["NOT_ENTERED", "AWAITING_CHECK", "NOT_IN_ORDER"] as const) {
      const words = creditorStandingWords({ state: "NONE", reason });
      expect(words.payable).toBe(false);
      expect(words.en).toContain("payments are refused");
      expect(words.ms.length).toBeGreaterThan(10);
    }
  });
});
