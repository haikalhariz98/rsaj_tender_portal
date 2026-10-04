import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { capFaults, creditsDue, type IssuedLine } from "./credit";

/**
 * 6.13 Part B run 1b (613A-C2 (a)(3) as amended, BD-613-89; BD-613-75's cap): the damages returned on an extension of
 * time, per issued line, per rate segment at that segment's rate; the rounding never returned; returned once. Pure.
 * Fixture: the plan's worked example (CNC at 269.38 from 1 Sep, interim 1–30 Sep = 8,081.40; EOT 14 days, new date 14 Sep).
 */

const R = parseSen("269.38");
const line = (o: Partial<IssuedLine> = {}): IssuedLine => ({ certificateId: "i1", number: "IP/1", scopeKey: "WHOLE", segments: [{ from: "2026-09-01", until: "2026-10-01", rate: R, days: 30 }], gross: parseSen("8081.40"), rounding: parseSen("-0.40"), ...o });

describe("creditsDue", () => {
  it("14 × 269.38 = 3,771.32 returned", () => {
    const c = creditsDue({ lines: [line()], scopeDates: { WHOLE: "2026-09-14" }, returned: [] });
    expect(c).toEqual([{ lineCertificateId: "i1", lineNumber: "IP/1", scopeKey: "WHOLE", segmentFrom: "2026-09-01", days: 14, rate: R, amount: parseSen("3771.32") }]);
  });

  it("the line's rounding is never returned: only rate × days", () => {
    const c = creditsDue({ lines: [line({ rounding: parseSen("0.99") })], scopeDates: { WHOLE: "2026-10-31" }, returned: [] });
    expect(c[0].amount).toBe(parseSen("8081.40"));
  });

  it("a line straddling a segment edge credits each part at its own rate", () => {
    const CPO = parseSen("215.50");
    const l = line({ segments: [{ from: "2026-09-01", until: "2026-09-10", rate: R, days: 9 }, { from: "2026-09-10", until: "2026-10-01", rate: CPO, days: 21 }] });
    const c = creditsDue({ lines: [l], scopeDates: { WHOLE: "2026-09-14" }, returned: [] });
    expect(c.map((x) => [x.segmentFrom, x.days, x.amount])).toEqual([["2026-09-01", 9, R * 9n], ["2026-09-10", 5, CPO * 5n]]);
  });

  it("returned once: a credit already returned is not returned again; a later extension returns only the further days", () => {
    const first = creditsDue({ lines: [line()], scopeDates: { WHOLE: "2026-09-14" }, returned: [] });
    expect(creditsDue({ lines: [line()], scopeDates: { WHOLE: "2026-09-14" }, returned: first })).toEqual([]);
    const second = creditsDue({ lines: [line()], scopeDates: { WHOLE: "2026-09-20" }, returned: first });
    expect(second.map((x) => [x.days, x.amount])).toEqual([[6, R * 6n]]);
  });

  it("a section's extension returns only that section's lines; nothing where no day is on or before the date", () => {
    const sec = line({ certificateId: "i2", scopeKey: "SECTION:2" });
    expect(creditsDue({ lines: [line(), sec], scopeDates: { WHOLE: "2026-08-31", "SECTION:2": "2026-09-05" }, returned: [] }).map((x) => [x.scopeKey, x.days])).toEqual([["SECTION:2", 5]]);
    expect(creditsDue({ lines: [line()], scopeDates: { WHOLE: null }, returned: [] })).toEqual([]);
  });
});

describe("BD-613-75's cap: credits plus waivers never exceed the damages charged on the line", () => {
  const charged = parseSen("8081.40");
  it("exactly equal passes; one sen over refuses, naming the line, the charged, the credited and the waived", () => {
    expect(capFaults([{ scopeKey: "WHOLE", label: "Damages on the whole works", charged, credited: parseSen("3771.32"), waived: parseSen("4310.08"), by: "CREDIT" }])).toEqual([]);
    const f = capFaults([{ scopeKey: "WHOLE", label: "Damages on the whole works", charged, credited: parseSen("3771.32"), waived: parseSen("4310.09"), by: "CREDIT" }]);
    expect(f).toEqual([{ code: "LAD_CREDIT_OVER_CHARGED", level: "block", data: { line: "Damages on the whole works", charged: "8081.40", credited: "3771.32", waived: "4310.09" } }]);
  });
  it("named by what passes it: a waiver's application refuses LAD_WAIVER_OVER_CHARGED", () => {
    const f = capFaults([{ scopeKey: "WHOLE", label: "Damages on the whole works", charged, credited: parseSen("3771.32"), waived: parseSen("4310.09"), by: "WAIVER" }]);
    expect(f.map((x) => x.code)).toEqual(["LAD_WAIVER_OVER_CHARGED"]);
  });
});
