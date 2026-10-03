import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen, senToDecimalString } from "@/lib/money";

import { applyTerm, AWARD_TERM_WORDS, AWARD_TERMS, awardCorrectionFaults, correctedAfter, correctedColumns, readCorrectionMark, TERM_FIELD, termSource, termText, type AwardTermColumns, type TermInput } from "./award-correction";
import { baselineFaults, buildBaseline, changedFields, derive, type BaselineInputs } from "./baseline";
import { contractFaultWords } from "./fault-text";

/**
 * 612-C1 (ruled at 6.13 planning; ADR 0021 Amendment 1): correcting the award's recorded terms after issue.
 *
 * WORKED EXAMPLE (figures a test fixture). The signed Letter of Acceptance states liquidated damages of RM450.00
 * a day; the award recorded RM500.00 a day. The baseline (version 2, EXECUTED) reads RM500.00 a day from the
 * Letter of Acceptance. Corrected with a reason: the award records RM450.00 per day; version 3, CORRECTION, reads
 * RM450.00 a day, still from the Letter of Acceptance, and says "corrected from RM500 per day to RM450 per day".
 * Version 2 and a certificate that read it stay as they were; that certificate says its baseline was corrected
 * after (version 3). The contract sum is not one of the terms (BD-613-3).
 */

const S = parseSen;
const inputs = (x: Partial<BaselineInputs> = {}): BaselineInputs => ({
  contractSum: S("317973.70"),
  award: { completionPeriod: 29, completionUnit: "WEEKS", ladAmount: S("500.00"), ladUnit: "per day", retentionPercent: "10", retentionCapPercent: "5", dlpMonths: 12, termsProvenance: "STATED" },
  appendix: null,
  bq: { versionNo: 2, primeCostSums: S("18000.00"), provisionalSums: S("6500.00"), incompleteLines: 0 },
  band: null,
  type: { name: "Works", defectsLiabilityApplies: true },
  interimPolicy: { floor: S("1000.00"), pct: "10", provenance: "ASSUMED" },
  ...x,
});
const cols: AwardTermColumns = { ladAmount: "500.00", ladUnit: "per day", dlpMonths: 12, retentionPercent: "10.0000", retentionCapPercent: "5.0000", completionPeriod: 29, completionUnit: "WEEKS" };
const ok: Parameters<typeof awardCorrectionFaults>[0] = { awardStatus: "ACCEPTED", awardIssued: true, versions: 2, source: "AWARD", term: "LAD", input: { term: "LAD", amount: S("450.00") } as TermInput, reason: "Recorded wrongly from the signed letter.", changed: true, blocks: 0 };
const codes = (x: Partial<typeof ok>) => awardCorrectionFaults({ ...ok, ...x }).map((f) => f.code);

describe("the worked example", () => {
  const i = inputs();
  const v2 = buildBaseline(i);
  it("the baseline reads the award's RM500.00 a day, from the Letter of Acceptance", () => {
    expect(v2.ladAmount).toBe(S("500.00"));
    expect(termSource("LAD", v2)).toBe("AWARD");
  });
  it("the correction changes only the term, still sourced AWARD, and words both sides", () => {
    const v3 = derive(applyTerm(v2, { term: "LAD", amount: S("450.00") }), i.interimPolicy);
    expect(changedFields(v2, v3)).toEqual(["lad"]);
    expect(v3.ladDaily).toBe(S("450.00"));
    expect(v3.ladSource).toBe("AWARD");
    const next = correctedColumns(cols, { term: "LAD", amount: S("450.00") }, senToDecimalString);
    expect(termText("LAD", cols, S)).toBe("RM500 per day");
    expect(termText("LAD", next, S)).toBe("RM450 per day");
    expect(next).toEqual({ ...cols, ladAmount: "450.00" });
    expect(baselineFaults(v3, { defectsLiabilityApplies: true }).filter((f) => f.level === "block" && (f.data?.field === "lad" || /^LAD_/.test(f.code)))).toEqual([]);
  });
  it("allowed with a reason on an issued award and a versioned baseline", () => {
    expect(codes({})).toEqual([]);
  });
});

describe("each term", () => {
  const v = buildBaseline(inputs());
  it("the defects liability period: 0 months is none", () => {
    expect(applyTerm(v, { term: "DLP", months: 0 })).toMatchObject({ dlpApplies: false, dlpMonths: null, dlpSource: "AWARD" });
    expect(applyTerm(v, { term: "DLP", months: 24 })).toMatchObject({ dlpApplies: true, dlpMonths: 24 });
    expect(termText("DLP", { ...cols, dlpMonths: 0 }, S)).toBe("None");
    expect(termText("DLP", cols, S)).toBe("12 months");
  });
  it("retention and its cap together", () => {
    expect(applyTerm(v, { term: "RETENTION", percent: "5", cap: "5" })).toMatchObject({ retentionApplies: true, retentionPercent: "5", retentionCapPercent: "5", retentionSource: "AWARD" });
    expect(termText("RETENTION", cols, S)).toBe("10%, capped at 5% of the contract sum");
  });
  it("the completion period, always the award's", () => {
    expect(termSource("COMPLETION", v)).toBe("AWARD");
    expect(applyTerm(v, { term: "COMPLETION", period: 30, unit: "WEEKS" })).toMatchObject({ completionPeriod: 30, completionUnit: "WEEKS" });
    expect(termText("COMPLETION", cols, S)).toBe("29 weeks");
  });
  it("every term has its words and its baseline row (exhaustive)", () => {
    for (const t of AWARD_TERMS) {
      expect(AWARD_TERM_WORDS[t].en.length).toBeGreaterThan(0);
      expect(AWARD_TERM_WORDS[t].ms.length).toBeGreaterThan(0);
      expect(TERM_FIELD[t]).toMatch(/^(lad|dlp|retention|completion)$/);
    }
  });
});

describe("what refuses it, each naming the way out", () => {
  it("a cancelled award keeps its record; before issue the terms are edited on the award", () => {
    expect(codes({ awardStatus: "CANCELLED" })).toEqual(["AWARD_CANCELLED"]);
    expect(codes({ awardStatus: "APPROVED", awardIssued: false })).toEqual(["AWARD_NOT_ISSUED"]);
  });
  it("no version: nothing to correct, confirm first", () => {
    expect(codes({ versions: 0 })).toEqual(["NO_BASELINE_VERSION"]);
  });
  it("a term the baseline does not take from the award (entered, the Appendix's, derived) is not the award's to correct", () => {
    for (const source of ["ENTERED", "APPENDIX", "DERIVED", null] as const) expect(codes({ source })).toEqual(["NOT_AWARD_SOURCED"]);
  });
  it("a reason is required; nothing changed is refused; a baseline left incomplete is refused", () => {
    expect(codes({ reason: "  " })).toEqual(["REASON_REQUIRED"]);
    expect(codes({ changed: false })).toEqual(["NOTHING_CHANGED"]);
    expect(codes({ blocks: 2 })).toEqual(["BASELINE_INCOMPLETE"]);
  });
  it("an invalid figure", () => {
    expect(codes({ input: { term: "LAD", amount: 0n } })).toEqual(["VALUE_NOT_VALID"]);
    expect(codes({ term: "RETENTION", input: { term: "RETENTION", percent: "101", cap: "5" } })).toEqual(["VALUE_NOT_VALID"]);
    expect(codes({ term: "COMPLETION", input: { term: "COMPLETION", period: 0, unit: "DAYS" } })).toEqual(["VALUE_NOT_VALID"]);
    expect(codes({ term: "DLP", input: { term: "DLP", months: -1 } })).toEqual(["VALUE_NOT_VALID"]);
  });
  it("every refusal is worded in both languages and names what to do", () => {
    for (const code of ["AWARD_NOT_ISSUED", "AWARD_CANCELLED", "NO_BASELINE_VERSION", "NOT_AWARD_SOURCED", "VALUE_NOT_VALID"]) {
      const t = contractFaultWords({ code, level: "block", data: { term: "LAD", source: "ENTERED" } });
      expect(t.en, code).not.toBe("Refused.");
      expect(t.ms, code).not.toBe("Ditolak.");
    }
    expect(contractFaultWords({ code: "NOT_AWARD_SOURCED", level: "block", data: { term: "LAD", source: "ENTERED" } }).en).toMatch(/^Liquidated damages in the baseline is not taken from the Letter of Acceptance/);
  });
});

describe("a version says what it corrected; a certificate pinned earlier says so", () => {
  const mark = { awardCorrection: { term: "LAD", from: "RM500 per day", to: "RM450 per day" } };
  it("read back from the version's snapshot, and nothing from any other", () => {
    expect(readCorrectionMark(mark)).toEqual({ term: "LAD", from: "RM500 per day", to: "RM450 per day" });
    expect(readCorrectionMark({ correctedField: "contractDate" })).toBeNull();
    expect(readCorrectionMark(null)).toBeNull();
  });
  it("only corrections in versions after the one pinned", () => {
    const versions = [
      { version: null, snapshot: {} },
      { version: 1, snapshot: {} },
      { version: 2, snapshot: mark },
      { version: 3, snapshot: {} },
      { version: 4, snapshot: { awardCorrection: { term: "DLP", from: "12 months", to: "24 months" } } },
    ];
    expect(correctedAfter(1, versions).map((m) => [m.version, m.term])).toEqual([
      [2, "LAD"],
      [4, "DLP"],
    ]);
    expect(correctedAfter(2, versions).map((m) => m.version)).toEqual([4]);
    expect(correctedAfter(4, versions)).toEqual([]);
  });
});

describe("the act (source)", () => {
  const src = readFileSync(path.join(__dirname, "../../app/projects/[id]/actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function correctAwardTerm("));
  it("runs under the award's and the contract's locks, judges with the rule, writes the award, a CORRECTION version and the record, and audits", () => {
    expect(body).toMatch(/return inContract\(/);
    expect(body).toMatch(/awardCorrectionFaults\(/);
    expect(body).toMatch(/c\.tx\.award\.updateMany\(\{ where: \{ id: a\.id, updatedAt: a\.updatedAt \}/);
    expect(body).toMatch(/writeVersion\(c, after!, "CORRECTION", reason,/);
    expect(body).toMatch(/c\.tx\.awardTermCorrection\.create\(/);
    expect(body).toMatch(/entity: "Award", entityId: a\.id/);
    expect(body).toMatch(/audit\(c, "AwardTermCorrection"/);
  });
  it("never writes the contract sum, the Contract Date or the issued letter", () => {
    const upd = body.slice(body.indexOf("c.tx.award.updateMany("), body.indexOf("if (moved.count !== 1)"));
    expect(upd).not.toMatch(/awardedValue|contractSum|contractDate/);
    expect(body).not.toMatch(/awardDocument\./);
  });
});
