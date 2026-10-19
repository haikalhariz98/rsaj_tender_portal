import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { baselineOf, differenceFindings, differences, matchesBaseline, reasonsOnSave, type AwardTerms, type FrozenTender } from "./appendix-baseline";
import { differsRefusal, noReasonText, tenderTermText } from "./labels";

/**
 * 6.13 Part A ruling on BD-613-2 (a flagged step of 6.11): an award sum insured stated otherwise than the figure
 * the frozen Appendix governs is an Appendix difference under 64-C4: it needs a reason, is shown with both
 * figures, and refuses issue until it has one. The Appendix silent, or the award stating none: nothing differs.
 * Worked example (invented Appendix, for tests only): awarded RM1,077,508.60, works uplift 10% (so the works
 * figure is RM1,185,259.46), public liability minimum RM2,000,000.00, workmen's compensation RM500,000.00.
 */

const RM = (s: string) => parseSen(s);
const AWARDED = RM("1077508.60");
const APPENDIX: FrozenTender["appendix"] = { ladKind: null, ladAmount: null, ladPct: null, dlpApplies: null, dlpMonths: null, tplMinimum: RM("2000000"), wcMinimum: RM("500000"), worksInsuranceUpliftKind: "PERCENT", worksInsuranceUpliftAmount: null, worksInsuranceUpliftPct: "10", insuranceExcess: null, sectionalCompletion: null };
const B = baselineOf({ packVersion: 1, frozenOn: null, appendix: APPENDIX, regulated: null }, AWARDED);
const SILENT = baselineOf({ packVersion: 1, frozenOn: null, appendix: { ...APPENDIX, tplMinimum: null, wcMinimum: null, worksInsuranceUpliftKind: null, worksInsuranceUpliftPct: null }, regulated: null }, AWARDED);
const terms = (o: Partial<AwardTerms> = {}): AwardTerms => ({ ladAmount: null, ladUnit: "", dlpMonths: null, regulatedActivity: null, ...o });

describe("a sum insured against the figure the Appendix governs", () => {
  it("below: a difference", () => {
    expect(matchesBaseline("liabilityInsured", B, terms({ liabilitySumInsured: RM("1500000") }))).toBe(false);
    expect(matchesBaseline("worksInsured", B, terms({ worksSumInsured: RM("1185259.45") }))).toBe(false);
  });
  it("above: a difference too", () => {
    expect(matchesBaseline("wcInsured", B, terms({ wcSumInsured: RM("500000.01") }))).toBe(false);
    expect(matchesBaseline("worksInsured", B, terms({ worksSumInsured: RM("1185259.47") }))).toBe(false);
  });
  it("equal: no difference (the works figure is the awarded sum plus the uplift, half up)", () => {
    expect(matchesBaseline("worksInsured", B, terms({ worksSumInsured: RM("1185259.46") }))).toBe(true);
    expect(matchesBaseline("liabilityInsured", B, terms({ liabilitySumInsured: RM("2000000") }))).toBe(true);
  });
  it("the Appendix silent, or the award stating none: nothing to compare", () => {
    expect(matchesBaseline("liabilityInsured", SILENT, terms({ liabilitySumInsured: RM("1") }))).toBeNull();
    expect(matchesBaseline("worksInsured", SILENT, terms({ worksSumInsured: RM("1") }))).toBeNull();
    expect(matchesBaseline("liabilityInsured", B, terms())).toBeNull();
    expect(tenderTermText("liabilityInsured", SILENT)).toBeNull();
  });
});

describe("through the 64-C4 reason path", () => {
  it("a difference with no reason refuses issue, naming the term; with its reason it does not", () => {
    const d = differences(B, terms({ liabilitySumInsured: RM("1500000") }), {});
    expect(d).toEqual([{ field: "liabilityInsured", reason: null }]);
    expect(differenceFindings(d).map((f) => [f.code, f.data?.field])).toEqual([["APPENDIX_DIFFERENCE_UNEXPLAINED", "liabilityInsured"]]);
    expect(differenceFindings(differences(B, terms({ liabilitySumInsured: RM("1500000") }), { liabilityInsured: "Insurer's limit, accepted by the employer." }))).toEqual([]);
  });
  it("a save stating it otherwise with no reason is refused, with both figures in words", () => {
    const r = reasonsOnSave(B, terms({ wcSumInsured: RM("400000") }), new Set(["wcInsured"] as const), {}, {});
    expect(r.missing).toEqual(["wcInsured"]);
    expect(differsRefusal("wcInsured", tenderTermText("wcInsured", B)!)).toBe("The workmen's compensation sum insured differs from the tender Appendix's minimum (RM500,000: the Appendix's minimum): say why, or state it as the tender did.");
    expect(tenderTermText("worksInsured", B)).toBe("RM1,185,259.46: the awarded sum plus the Appendix's uplift");
  });
  it("set back to the governed figure, the reason is cleared", () => {
    expect(reasonsOnSave(B, terms({ wcSumInsured: RM("500000") }), new Set(["wcInsured"] as const), { wcInsured: "old" }, { wcInsured: "old" }).reasons.wcInsured).toBeNull();
  });
});

describe("6.13A residual: a cleared sum insured clears its stored reason", () => {
  const WC = new Set(["wcInsured"] as const);
  it("cleared: its reason goes, whatever was stored or given", () => {
    expect(reasonsOnSave(B, terms({ wcSumInsured: null }), WC, {}, { wcInsured: "Insurer's limit" }).reasons.wcInsured).toBeNull();
    expect(reasonsOnSave(B, terms(), WC, { wcInsured: "typed anyway" }, { wcInsured: "Insurer's limit" })).toEqual({ reasons: { lad: null, dlp: null, regulated: null, worksInsured: null, liabilityInsured: null, wcInsured: null }, missing: [] });
  });
  it("a later figure other than the Appendix's then needs a new reason (the old one is not revived)", () => {
    const first = reasonsOnSave(B, terms({ wcSumInsured: null }), WC, {}, { wcInsured: "Insurer's limit" }).reasons;
    const later = reasonsOnSave(B, terms({ wcSumInsured: RM("450000") }), WC, {}, first);
    expect(later.missing).toEqual(["wcInsured"]);
    expect(reasonsOnSave(B, terms({ wcSumInsured: RM("450000") }), WC, { wcInsured: "New insurer" }, first).reasons.wcInsured).toBe("New insurer");
  });
  it("the Appendix silent: cleared, its reason goes too", () => {
    expect(reasonsOnSave(SILENT, terms(), new Set(["liabilityInsured"] as const), {}, { liabilityInsured: "old" }).reasons.liabilityInsured).toBeNull();
  });
  it("a save that did not carry the sum keeps its stored reason", () => {
    expect(reasonsOnSave(B, terms(), new Set(["dlp"] as const), {}, { wcInsured: "Insurer's limit" }).reasons.wcInsured).toBe("Insurer's limit");
  });
});

describe("6.13A residual: a difference with no reason on an award already issued", () => {
  it("before issue: issue waits for one; issued: it was issued before a reason was required, never 'is not issued'", () => {
    expect(noReasonText(false)).toBe("Reason required before issue."); // wording shortened by note 0005, founder 2026-10-19; the meaning pinned is unchanged
    expect(noReasonText(true)).toBe("No reason recorded for this difference.");
    expect(noReasonText(true)).not.toMatch(/is not issued/);
  });
  it("the award page words both places through it, from the award's issuedAt", () => {
    // C-3: the panels moved out of the award page (wave C step C4); the two words are in shared.tsx, the four flags in OverviewPanel.
    const dir = path.join(__dirname, "../../../src/app/projects/[id]/award/");
    const page = readFileSync(dir + "shared.tsx", "utf8") + readFileSync(dir + "overview-panel.tsx", "utf8");
    expect(page).not.toMatch(/No reason recorded: the instrument is not issued/);
    expect(page.match(/noReasonText\(issued\)/g)?.length).toBe(2);
    expect(page.match(/issued=\{award\.issuedAt != null\}/g)?.length).toBe(4);
  });
});
