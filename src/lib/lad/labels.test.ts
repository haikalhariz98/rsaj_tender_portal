import { describe, expect, it } from "vitest";

import { LAD_FAULT_WORDS, ladFaultWords } from "./labels";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/** 6.13 Part B run 1b: every damages code of the run is worded, English and Malay, naming no code. */

describe("the damages chain's run 1b words", () => {
  const data = { state: "OPEN", claim: "CM/1", scope: "the whole works", eotNumber: "EOT/1", issuedNumber: "IP/1", day: "2026-09-14", line: "the whole works", charged: "8081.40", credited: "3771.32", waived: "4310.09", then: "8081.40", now: "4310.08", moved: "the extension of time EOT/1 issued", decision: "the decision of 1 Sep 2026", amount: "8081.40", waiver: "CM/2" };
  it("each code in both languages, naming no code", () => {
    for (const [code, f] of Object.entries(LAD_FAULT_WORDS)) {
      const w = f(data);
      expect(w.en.length, code).toBeGreaterThan(10);
      for (const t of [w.en]) expect(t, code).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
    }
  });
  it("the cap names the line and its three figures in money", () => {
    expect(ladFaultWords({ code: "LAD_CREDIT_OVER_CHARGED", level: "block", data: { line: "the whole works", charged: "8081.40", credited: "3771.32", waived: "4310.09" } })!.en).toBe("On the whole works: credits RM3,771.32 and waivers RM4,310.09 would pass the damages it charged (RM8,081.40).");
  });
  it("LAD_BASIS_MOVED reads the waiver's figures where it has them, and the certificate's otherwise", () => {
    expect(ladFaultWords({ code: "LAD_BASIS_MOVED", level: "block", data: { then: "8081.40", now: "4310.08", moved: "x" } })!.en).toMatch(/^The LAD amount it was approved on/);
    expect(ladFaultWords({ code: "LAD_BASIS_MOVED", level: "block", data: { moved: "x" } })!.en).toBe("The damages it was raised on have moved since: x. Void it and raise it again.");
    expect(ladFaultWords({ code: "NOT_A_CODE", level: "block" })).toBeNull();
  });
});
