import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { applyEntered, buildBaseline, derive, type BaselineInputs } from "./baseline";
import { correctableFaults, groupChange, groupText } from "./baseline-entry";
import { contractFaultWords } from "./fault-text";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * 6.12 review R-2 and R-3. The trail of a keyed or corrected group carries the group's values before and
 * after; and a correction never keys over a value the award, the Appendix or the bill states.
 *
 * WORKED EXAMPLE (a pre-6.4 contract: no Appendix, so liquidated damages are keyed at baseline):
 *   draft:        liquidated damages not set                 (source: not set)
 *   keyed:        RM500.00 per day, Stated by the officer      (source: entered at baseline)
 *   corrected:    RM450.00 per day, Observed, with a reason    (version 2, CORRECTION)
 *   The award's own LAD of RM600.00 a day on another contract is never corrected here: refused, naming the
 *   Letter of Acceptance.
 */

const S = parseSen;
const policy = { floor: S("1000.00"), pct: "10", provenance: "ASSUMED" as const };
const inputs = (x: Partial<BaselineInputs> = {}): BaselineInputs => ({
  contractSum: S("317973.70"),
  award: { completionPeriod: 29, completionUnit: "WEEKS", ladAmount: null, ladUnit: "", retentionPercent: null, retentionCapPercent: null, dlpMonths: null, termsProvenance: null },
  appendix: null,
  bq: { versionNo: 2, primeCostSums: S("18000.00"), provisionalSums: S("6500.00"), incompleteLines: 0 },
  band: null,
  type: { name: "Works", defectsLiabilityApplies: true },
  interimPolicy: policy,
  ...x,
});

describe("the trail of a keyed group carries its before and after (R-2)", () => {
  it("not set → RM500.00 a day, entered at baseline, Stated", () => {
    const i = inputs();
    const before = buildBaseline(i);
    const after = buildBaseline(i, { lad: { kind: "AMOUNT_PER_DAY", amount: S("500.00"), pct: null } });
    expect(groupChange("lad", before, after, { before: null, after: "STATED" })).toEqual({
      before: { lad: "not set", source: "Not set", provenance: null },
      after: { lad: "RM500 per day", source: "Entered at baseline, not from a tender Appendix", provenance: "STATED" },
    });
  });
  it("a group keyed again shows the earlier value and provenance", () => {
    const i = inputs();
    const first = buildBaseline(i, { honourDays: 21 });
    const second = buildBaseline(i, { honourDays: 14 });
    const c = groupChange("honourDays", first, second, { before: "ASSUMED", after: "STATED" });
    expect(c.before).toEqual({ honourDays: "21 days", source: "Entered at baseline, not from a tender Appendix", provenance: "ASSUMED" });
    expect(c.after.honourDays).toBe("14 days");
  });
  it("every group reads in words, never 0 for unset", () => {
    const b = buildBaseline(inputs());
    expect(groupText(b, "dlp")).toBe("not set");
    expect(groupText(b, "sums")).toBe("prime cost RM18,000, provisional RM6,500");
    expect(groupText(b, "firstInterim")).toBe("RM1,000");
    expect(groupText(buildBaseline(inputs(), { dlp: { applies: false, months: null } }), "dlp")).toBe("none");
    expect(groupText(buildBaseline(inputs(), { retention: { applies: true, percent: "5", cap: "5" } }), "retention")).toBe("5%, capped at 5%");
  });
});

describe("a correction keeps what the award, the Appendix and the bill state (R-3, BD-612-23)", () => {
  it("a group entered at baseline may be corrected", () => {
    expect(correctableFaults("lad", inputs())).toEqual([]);
    expect(correctableFaults("honourDays", inputs())).toEqual([]);
  });
  it("the award's LAD is not corrected over: refused, naming the Letter of Acceptance", () => {
    const i = inputs({ award: { ...inputs().award, ladAmount: S("600.00"), ladUnit: "a day" } });
    const f = correctableFaults("lad", i);
    expect(f).toEqual([{ code: "STATED_NOT_CORRECTED", level: "block", data: { group: "lad", source: "AWARD" } }]);
    expect(contractFaultWords(f[0]).en).toMatch(/^Liquidated damages are stated by the Letter of Acceptance/);
  });
  it("the bill's sums and a policy-derived first interim minimum are not corrected over", () => {
    expect(correctableFaults("sums", inputs())[0].data).toEqual({ group: "sums", source: "BQ" });
    expect(correctableFaults("firstInterim", inputs())[0].data).toEqual({ group: "firstInterim", source: "DERIVED" });
  });
  it("a value a recorded rule derives says so, not 'stated'", () => {
    const t = contractFaultWords({ code: "STATED_NOT_CORRECTED", level: "block", data: { group: "retention", source: "DERIVED" } });
    // Ruling Q1 (faithful update): derived values change only when what they derive from does.
    expect(t.en).toBe("Retention and its cap is derived under a recorded rule from values the award, the Appendix or the bill state, so it changes only when they do.");
  });
  it("the words exist in both languages and say what to do instead", () => {
    // Ruling Q1 (faithful update): the words never point to variations as the way to fix a record.
    // 612-C1 (6.13 Part A step 0, a faithful change as ruled: "the STATED_NOT_CORRECTED refusal now points to
    // this act"): a value the Letter of Acceptance states points to correcting the award's recorded term; a value
    // the Appendix or the bill states is kept as frozen, only the award's terms being correctable after issue.
    for (const source of ["AWARD", "APPENDIX", "BQ"]) {
      const t = contractFaultWords({ code: "STATED_NOT_CORRECTED", level: "block", data: { group: "dlp", source } });
      expect(t.en).toMatch(/is not corrected here: the baseline keeps what the award, the Appendix and the bill state, in that order\. /);
      expect(t.en).toMatch(/A change to the terms themselves is a variation, not a correction\.$/);
      expect(t.en).not.toMatch(/variations and adjustments|recorded as a change to the contract|is not built/);
    }
    expect(contractFaultWords({ code: "STATED_NOT_CORRECTED", level: "block", data: { group: "dlp", source: "AWARD" } }).en).toMatch(/If it was recorded wrongly from the signed letter, correct the award's recorded term \(Correct the award's term, beside it\): a reasoned correction writes a new version, still from the Letter of Acceptance\./);
    expect(contractFaultWords({ code: "STATED_NOT_CORRECTED", level: "block", data: { group: "dlp", source: "APPENDIX" } }).en).toMatch(/Only the award's recorded terms are corrected after issue; the frozen tender Appendix is kept as frozen\./);
    expect(contractFaultWords({ code: "STATED_NOT_CORRECTED", level: "block", data: { group: "lad", source: "AWARD" } }).en).toMatch(/^Liquidated damages are stated by the Letter of Acceptance, so they are not corrected here/);
  });
  it("applyEntered then derive is what the correction writes: the corrected group only changes", () => {
    const i = inputs();
    const v1 = buildBaseline(i, { lad: { kind: "AMOUNT_PER_DAY", amount: S("500.00"), pct: null } });
    const v2 = derive(applyEntered(v1, { lad: { kind: "AMOUNT_PER_DAY", amount: S("450.00"), pct: null } }), i.interimPolicy);
    expect(groupText(v2, "lad")).toBe("RM450 per day");
    expect(groupText(v2, "sums")).toBe(groupText(v1, "sums"));
  });
});

describe("the acts use them", () => {
  const src = readFileSync(path.join(__dirname, "../../app/projects/[id]/actions.ts"), "utf8");
  const body = (name: string) => {
    const at = src.indexOf(`export async function ${name}(`);
    expect(at, name).toBeGreaterThan(-1);
    const end = src.indexOf("\nexport async function ", at + 10);
    return src.slice(at, end === -1 ? undefined : end);
  };
  it("saveBaselineEntry audits the group's before and after", () => {
    expect(body("saveBaselineEntry")).toContain("groupChange(");
  });
  it("correctBaseline asks correctableFaults before writing, and audits the group's before and after", () => {
    const b = body("correctBaseline");
    expect(b).toContain("correctableFaults(");
    expect(b).toContain("groupChange(");
    expect(b.indexOf("correctableFaults(")).toBeLessThan(b.indexOf("writeVersion("));
  });
  it("S-3: the corrected group's before and after go in the new version's CREATE entry, never an UPDATE of it", () => {
    const b = body("correctBaseline");
    expect(b).toMatch(/writeVersion\(c, after!, "CORRECTION", reason, \{ correctedField: group \}, stored, change\)/);
    expect(b).not.toMatch(/"UPDATE"/);
    const w = src.slice(src.indexOf("async function writeVersion("), src.indexOf("/// Correct the Contract Date"));
    expect(w).toMatch(/"CREATE", \[\.\.\.diffFields\(null, \{ version, reason, changed: [^\]]*\.\.\.\(change \? diffFields\(change\.before, change\.after\) : \[\]\)\]/);
  });
});
