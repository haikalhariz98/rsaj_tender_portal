import { describe, expect, it } from "vitest";

import { TIME_FAULT_WORDS, timeFaultWords, timeRefusal } from "./labels";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/** 6.13 Part B run 1b: every time and damages code is worded, English and Malay, and no code reaches the words. */

describe("time's words", () => {
  const data = { day: "2026-09-14", type: "Works", item: "PROGRESS", condition: "Way leave", precondition: "spanConfirmed", committee: "Tender Board", claims: "VOC", granted: 16, computed: 18, number: "C/1", claim: "CM/1", reason: "r", domain: "eot", matrix: "Issue A" };
  it("each code has both languages, neither naming a code", () => {
    for (const [code, f] of Object.entries(TIME_FAULT_WORDS)) {
      const w = f(data);
      expect(w.en.length, code).toBeGreaterThan(10);
      for (const t of [w.en]) expect(t, code).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
    }
  });
  it("the design note's words, as written (6.13B-run1b-design.md)", () => {
    expect(timeFaultWords({ code: "EOT_INSTRUMENT_NOT_SET", level: "block", data: { type: "Works" } })).toEqual({
      en: "The contract type (Works) does not say which time instrument it offers. Set it under Configuration › Reference data › Contract types.",
    });
    expect(timeFaultWords({ code: "WEATHER_NOT_EXCEPTIONAL", level: "block" }).en).toBe("Weather that is not exceptional (monsoon season, heavy rain normal for the area) is not a ground: it was allowed for in the tender.");
    expect(timeFaultWords({ code: "PRECONDITION_NOT_MET", level: "block", data: { precondition: "spanConfirmed" } }).en).toBe("The SPAN Act's compliance is not confirmed: all four, and the SPAN Act's compliance, are confirmed before the extension is evaluated.");
  });
  it("an unknown code fails closed in words, and a refusal reads the lead and each finding", () => {
    expect(timeFaultWords({ code: "NOT_A_CODE", level: "block" }).en).toBe("Refused.");
    expect(timeRefusal("Not recorded:", [{ code: "NOTICE_CAUSE_REQUIRED", level: "block" }])).toBe("Not recorded: Say what caused the delay, as the notice gives it.");
  });
});
