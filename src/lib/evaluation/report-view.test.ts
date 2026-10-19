import { describe, expect, it } from "vitest";

import type { ReportSnapshot } from "./report";
import { ESTIMATE_WITHHELD_WORDS, reportForReader, statesEstimateFigures } from "./report-view";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * The issued report as a reader may see it (Phase 3b, FR-EVL-014 and FR-EST-008). The report is frozen with figures worked out from the company estimate; a reader
 * the evaluation is open to is not thereby in the estimate's custody, so those parts are held back whole, and nothing of the estimate is left in what is returned.
 */

const SAVING = "RM 33,000.00";
const report = (over: Partial<ReportSnapshot> = {}): ReportSnapshot => ({
  v: 1,
  reference: "EV/2026/0001",
  issuedOn: "2026-10-01",
  issuedBy: "A. Officer",
  version: 1,
  exercise: { reference: "SX/2026/0016", title: "Pump house" },
  model: { name: "Model", version: 1, route: "TWO_STAGE", provenance: "ASSUMED" },
  decimals: 2,
  team: [{ name: "Chen", side: "IMPLEMENTING_DEPARTMENT" }],
  text: { language: "EN", body: `We recommend bid 1. The saving against the estimate is ${SAVING} (10.00%).`, template: { code: "T", name: "Report", bodyVersion: 1 } },
  annexes: [
    { key: "A", label: "Jadual Penilaian", body: [] },
    {
      key: "B",
      label: "Jadual Perbandingan",
      body: [
        { listingNo: 1, bidder: "Contoh", asRead: "RM 264,000.00", vsEstimate: { difference: "−RM 33,000.00", percent: "−11.1111%" }, vsLowest: null },
        { listingNo: 2, bidder: "Sampel", asRead: "RM 300,000.00", vsEstimate: "Sealed", vsLowest: null },
      ],
    },
    { key: "C", label: "Jadual Tawaran", body: { rows: [{ listingNo: 1, bidderName: "Contoh", openingPrice: "264000.00" }], benchmark: { sealed: false, companyEstimate: "297000.00", label: "Company estimate" } } },
  ],
  recommendation: { listingNo: 1, bidder: "Contoh", registrationNo: "R1", price: "RM 264,000.00", period: "90 days", topRanked: true, justification: "", formedBy: "A. Officer", formedOn: "2026-10-01" },
  saving: { state: "STATED", amount: SAVING, percent: "10.0000%" },
  meetings: [],
  consent: [] as never,
  bidders: [],
  ...over,
});

describe("a report that states figures worked out from the company estimate", () => {
  it("is recognised by its saving, by Annex B's differences, and by the estimate frozen in Annex C", () => {
    expect(statesEstimateFigures(report())).toBe(true);
    expect(statesEstimateFigures(report({ saving: { state: "SEALED", amount: null, percent: null }, annexes: report().annexes.filter((a) => a.key === "A") }))).toBe(false);
    const onlyB = report({ saving: { state: "NO_ESTIMATE", amount: null, percent: null }, annexes: [report().annexes[1]] });
    expect(statesEstimateFigures(onlyB)).toBe(true);
    const onlyC = report({ saving: { state: "NO_ESTIMATE", amount: null, percent: null }, annexes: [report().annexes[2]] });
    expect(statesEstimateFigures(onlyC)).toBe(true);
  });
  it("is returned whole to a reader in the estimate's custody", () => {
    const r = report();
    expect(reportForReader(r, true)).toEqual({ report: r, estimateWithheld: null });
  });
  it("is returned to any other reader with nothing of the estimate in it: not the saving, the differences, the benchmark or the text", () => {
    const out = reportForReader(report(), false);
    const json = JSON.stringify(out.report);
    for (const leak of [SAVING, "33,000", "297000", "297,000", "11.1111", "10.0000", "companyEstimate", "We recommend bid 1"]) expect(json, leak).not.toContain(leak);
    expect(out.estimateWithheld).toBe(ESTIMATE_WITHHELD_WORDS);
    expect(out.report.text.body).toBe("");
  });
  it("keeps what is not worked out from the estimate: the prices as read, the recommendation and its price, the opening's rows", () => {
    const out = reportForReader(report(), false).report;
    const json = JSON.stringify(out);
    expect(json).toContain("RM 264,000.00");
    expect(json).toContain("264000.00");
    expect(out.recommendation.bidder).toBe("Contoh");
  });
  it("says Withheld where a difference was, and leaves a row that never had one (a sealed estimate) as it was", () => {
    const b = reportForReader(report(), false).report.annexes.find((a) => a.key === "B")!.body as { vsEstimate: unknown }[];
    expect(b[0].vsEstimate).toBe("Withheld");
    expect(b[1].vsEstimate).toBe("Sealed");
  });
  it("does not alter the report it was given", () => {
    const r = report();
    const before = JSON.stringify(r);
    reportForReader(r, false);
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe("a report that states none", () => {
  it("is returned whole to everyone, and nothing is said to be withheld", () => {
    const r = report({ saving: { state: "SEALED", amount: null, percent: null }, annexes: [{ key: "A", label: "A", body: [] }] });
    expect(reportForReader(r, false)).toEqual({ report: r, estimateWithheld: null });
  });
});
