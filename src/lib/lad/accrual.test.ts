import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { accrualOf } from "./accrual";

/** 6.13 Part B run 1b (FR-LAD-012, S; BD-613-116 act side of ladAntiOppressionDays): cumulative per scope, alert at the configured days. */

const R = parseSen("269.38");

describe("the damages accrual", () => {
  const scope = { key: "WHOLE", label: "the whole works", from: "2026-09-01", until: null, charged: parseSen("8081.40") };
  it("cumulative per scope: the days run and the damages charged", () => {
    const a = accrualOf({ scopes: [scope], today: "2026-10-10", days: { value: 30, provenance: "ASSUMED" } });
    expect(a).toEqual([{ key: "WHOLE", label: "the whole works", days: 40, charged: parseSen("8081.40"), alert: { state: "ALERT", days: 30, provenance: "ASSUMED" } }]);
  });
  it("FR-LAD-012 \"continued beyond\" the configured days: at them, no alert yet; beyond them, the alert", () => {
    expect(accrualOf({ scopes: [scope], today: "2026-10-01", days: { value: 31, provenance: "STATED" } })[0].alert).toEqual({ state: "BELOW", days: 31, provenance: "STATED" });
    expect(accrualOf({ scopes: [scope], today: "2026-10-01", days: { value: 30, provenance: "STATED" } })[0].alert.state).toBe("ALERT");
  });
  it("null: not set, no alert, never 0", () => {
    expect(accrualOf({ scopes: [scope], today: "2026-10-10", days: { value: null, provenance: null } })[0].alert).toEqual({ state: "NOT_SET" });
  });
  it("a window closed at completion stops the count", () => {
    expect(accrualOf({ scopes: [{ ...scope, until: "2026-09-11" }], today: "2026-10-10", days: { value: null, provenance: null } })[0].days).toBe(10);
    void R;
  });
});
