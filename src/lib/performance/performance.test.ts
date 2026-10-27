import { describe, expect, it } from "vitest";

import { formatMark, parseFixed } from "@/lib/evaluation/fixed";

import { formIssueFaults, type FormSnapshot } from "./form";
import { performanceFaultText, totalText } from "./labels";
import { editFaults, openFaults, performanceFiled, performanceNotFiled, performanceState, reportOpens, verifyFaults } from "./report";
import { gradeOf, reportTotal, scoreFaults } from "./score";

/**
 * Contractor performance's rules (plan closeout-plan.md §6.3, stage D). The weights, scale and bands are an invented fixture, not RSAJ's forms.
 * The plan's fixture pairs scores 4,3,5,4,3 with 74.0000; at weights 0.30/0.25/0.20/0.15/0.10 on a scale of 5 those give 77.0000, and
 * 4,3,5,3,3 give 74.0000 (6.16's figure came from its six-criterion form). Both are pinned.
 */

const criteria = [0.3, 0.25, 0.2, 0.15, 0.1].map((w, i) => ({ order: i + 1, label: `C${i + 1}`, guide: "", weight: w.toFixed(4) }));
const bands: FormSnapshot["bands"] = [
  { label: "E", lowerPct: "0.0000", sortOrder: 5 },
  { label: "D", lowerPct: "40.0000", sortOrder: 4 },
  { label: "C", lowerPct: "50.0000", sortOrder: 3 },
  { label: "B", lowerPct: "60.0000", sortOrder: 2 },
  { label: "A", lowerPct: "80.0000", sortOrder: 1 },
];
const form = { name: "Fixture form", scaleMax: 5, criteria, bands, otherIssued: false };
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const scored = (...s: number[]) => new Map(s.map((v, i) => [i + 1, v]));

describe("formIssueFaults", () => {
  it("issues weights 0.30/0.25/0.20/0.15/0.10 clean", () => expect(formIssueFaults(form)).toEqual([]));
  it("refuses 0.11 for the last weight, and 0.95 in all", () => {
    expect(codes(formIssueFaults({ ...form, criteria: criteria.map((c, i) => (i === 4 ? { ...c, weight: "0.1100" } : c)) }))).toEqual(["WEIGHTS_NOT_ONE"]);
    const short = formIssueFaults({ ...form, criteria: criteria.map((c, i) => (i === 4 ? { ...c, weight: "0.0500" } : c)) });
    expect(performanceFaultText(short[0])).toBe("The weights total 0.95, not exactly 1.");
  });
  it("refuses no criteria, a scale outside 2 to 10, no grades, grades not from 0, two grades at one score, and a second issued form for the type", () => {
    expect(codes(formIssueFaults({ ...form, criteria: [] }))).toEqual(["NO_CRITERIA"]);
    expect(codes(formIssueFaults({ ...form, scaleMax: 1 }))).toEqual(["SCALE_OUT_OF_RANGE"]);
    expect(codes(formIssueFaults({ ...form, scaleMax: 11 }))).toEqual(["SCALE_OUT_OF_RANGE"]);
    expect(codes(formIssueFaults({ ...form, scaleMax: 2 }))).toEqual([]);
    expect(codes(formIssueFaults({ ...form, scaleMax: 10 }))).toEqual([]);
    expect(codes(formIssueFaults({ ...form, bands: [] }))).toEqual(["NO_BANDS"]);
    expect(codes(formIssueFaults({ ...form, bands: bands.slice(1) }))).toEqual(["BANDS_NOT_FROM_ZERO"]);
    expect(codes(formIssueFaults({ ...form, bands: [...bands, { label: "D2", lowerPct: "40.0000", sortOrder: 6 }] }))).toEqual(["BAND_REPEATED"]);
    expect(codes(formIssueFaults({ ...form, otherIssued: true }))).toEqual(["TYPE_HAS_ISSUED_FORM"]);
  });
});

describe("reportTotal and gradeOf", () => {
  it("4,3,5,3,3 on a scale of 5 give 74.0000; 4,3,5,4,3 give 77.0000", () => {
    expect(formatMark(reportTotal(form, scored(4, 3, 5, 3, 3)), 4)).toBe("74.0000");
    expect(formatMark(reportTotal(form, scored(4, 3, 5, 4, 3)), 4)).toBe("77.0000");
  });
  it("rounds once, half up, to four places: 1 and 1 of 3 at 0.5 each give 33.3333, 2 and 2 give 66.6667", () => {
    const thirds = { scaleMax: 3, criteria: [{ order: 1, label: "A", guide: "", weight: "0.5000" }, { order: 2, label: "B", guide: "", weight: "0.5000" }] };
    expect(formatMark(reportTotal(thirds, scored(1, 1)), 4)).toBe("33.3333");
    expect(formatMark(reportTotal(thirds, scored(2, 2)), 4)).toBe("66.6667");
  });
  it("all 5s give 100.0000, all 1s give 20.0000", () => {
    expect(formatMark(reportTotal(form, scored(5, 5, 5, 5, 5)), 4)).toBe("100.0000");
    expect(formatMark(reportTotal(form, scored(1, 1, 1, 1, 1)), 4)).toBe("20.0000");
  });
  it("grades through placeInBands: 39.995 is E, 40.0000 is D, 79.9999 is B, 80 is A, 100 is A", () => {
    const g = (v: string) => gradeOf(parseFixed(v), bands);
    expect(g("39.995")).toEqual({ label: "E" });
    expect(g("40.0000")).toEqual({ label: "D" });
    expect(g("79.9999")).toEqual({ label: "B" });
    expect(g("80")).toEqual({ label: "A" });
    expect(g("100")).toEqual({ label: "A" });
  });
  it("shows the total as judged, never rounded across an edge", () => {
    expect(totalText(parseFixed("39.995"))).toBe("39.995%");
    expect(totalText(parseFixed("74"))).toBe("74.00%");
  });
  it("refuses a missing score and one out of scale, by name", () => {
    expect(scoreFaults(form, scored(4, 3, 5, 3)).map((f) => [f.code, f.data?.criterion])).toEqual([["SCORE_MISSING", "C5"]]);
    expect(codes(scoreFaults(form, scored(4, 3, 5, 3, 6)))).toEqual(["OUT_OF_SCALE"]);
    expect(codes(scoreFaults(form, scored(0, 3, 5, 3, 3)))).toEqual(["OUT_OF_SCALE"]);
    expect(scoreFaults(form, scored(4, 3, 5, 3, 3))).toEqual([]);
  });
  it("a total no grade holds is refused, never put in the nearest grade", () => {
    expect(gradeOf(parseFixed("10"), bands.slice(1))).toEqual({ code: "NOT_GRADED", level: "block" });
  });
});

describe("the report's life", () => {
  const none = { cpcIssued: false, dlpApplies: true, cmgdIssued: false };
  it("opens at the CMGD, or at the CPC where no DLP applies (ruling 17)", () => {
    expect(reportOpens(none)).toBe(false);
    expect(reportOpens({ ...none, cpcIssued: true })).toBe(false);
    expect(reportOpens({ ...none, cpcIssued: true, cmgdIssued: true })).toBe(true);
    expect(reportOpens({ cpcIssued: true, dlpApplies: false, cmgdIssued: false })).toBe(true);
  });
  it("refuses FORM_NOT_SET by name, NOT_YET_OPEN, and a second report", () => {
    const f = openFaults({ cpcIssued: true, dlpApplies: false, cmgdIssued: false, formIssued: false, typeName: "Works", live: false });
    expect(codes(f)).toEqual(["PERFORMANCE_FORM_NOT_SET"]);
    expect(performanceFaultText(f[0])).toBe("Works contracts have no issued performance form. Issue one in Settings › Performance forms.");
    expect(codes(openFaults({ ...none, cpcIssued: true, formIssued: true, typeName: "Works", live: false }))).toEqual(["NOT_YET_OPEN"]);
    expect(codes(openFaults({ ...none, cmgdIssued: true, formIssued: true, typeName: "Works", live: true }))).toEqual(["REPORT_LIVE"]);
    expect(openFaults({ ...none, cmgdIssued: true, formIssued: true, typeName: "Works", live: false })).toEqual([]);
  });
  it("fixes the scores at assessment, and is verified once, by someone other than the assessor", () => {
    expect(codes(editFaults({ assessedByPersonId: "p1", verifiedByPersonId: null }))).toEqual(["ASSESSED"]);
    expect(codes(verifyFaults({ assessedByPersonId: null, verifiedByPersonId: null }, "p2"))).toEqual(["NOT_ASSESSED"]);
    expect(codes(verifyFaults({ assessedByPersonId: "p1", verifiedByPersonId: null }, "p1"))).toEqual(["SAME_PERSON"]);
    expect(verifyFaults({ assessedByPersonId: "p1", verifiedByPersonId: null }, "p2")).toEqual([]);
    expect(codes(verifyFaults({ assessedByPersonId: "p1", verifiedByPersonId: "p2" }, "p3"))).toEqual(["VERIFIED"]);
  });
  it("is filed only once verified; stage C's check refuses every other state", () => {
    expect(performanceState(null)).toBe("NONE");
    expect(performanceState({ assessedByPersonId: null, verifiedByPersonId: null })).toBe("OPEN");
    expect(performanceState({ assessedByPersonId: "p1", verifiedByPersonId: null })).toBe("ASSESSED");
    expect(performanceFiled({ assessedByPersonId: "p1", verifiedByPersonId: "p2" })).toBe(true);
    expect(performanceNotFiled(null)?.code).toBe("PERFORMANCE_NOT_FILED");
    expect(performanceNotFiled({ assessedByPersonId: "p1", verifiedByPersonId: null })?.code).toBe("PERFORMANCE_NOT_FILED");
    expect(performanceNotFiled({ assessedByPersonId: "p1", verifiedByPersonId: "p2" })).toBeNull();
  });
});
