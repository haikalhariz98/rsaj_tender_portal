import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { applyEntered, baselineFaults, baselineFor, buildBaseline, changedFields, dateForCompletion, derive, enterFault, enteredFaults, ladDailyOf, nextVersionNo, sourceOf, type BaselineInputs } from "./baseline";

/**
 * The contract baseline (FR-CON-014, ADR 0021). The spec's worked examples are in bold in the plan and
 * are tested here exactly as printed. Every policy figure (the interim floor and percentage, the band)
 * is a fixture, never a seed.
 *
 * WORKED EXAMPLE (for a finance reader to check by hand), §8.3 and 6.2's example 2:
 *   Contract sum                          317,973.70
 *   less prime cost sums                   18,000.00
 *   less provisional sums                   6,500.00
 *   = builders' works value               293,473.70
 *   First interim minimum: the lesser of the floor RM1,000.00 and 10% of 293,473.70 (= 29,347.37) → 1,000.00.
 *   On a builders' works value of 8,500.00, 10% is 850.00, below the floor → 850.00.
 *   LAD at 0.025% of 1,077,508.60 a day = 269.377 15 → 269.38 (half up to the sen, §8.6).
 */

const S = parseSen;
const FIXTURE_POLICY = { floor: S("1000.00"), pct: "10", provenance: "ASSUMED" as const };

const inputs = (x: Partial<BaselineInputs> = {}): BaselineInputs => ({
  contractSum: S("317973.70"),
  award: { completionPeriod: 29, completionUnit: "WEEKS", ladAmount: null, ladUnit: "", retentionPercent: null, retentionCapPercent: null, dlpMonths: null, termsProvenance: null },
  appendix: null,
  bq: { versionNo: 2, primeCostSums: S("18000.00"), provisionalSums: S("6500.00"), incompleteLines: 0 },
  band: null,
  type: { name: "Works", defectsLiabilityApplies: true },
  interimPolicy: FIXTURE_POLICY,
  ...x,
});

const fields = (fs: { code: string; level: string; data?: Record<string, unknown> }[]) => fs.filter((f) => f.level === "block").map((f) => (f.code === "NOT_SET" ? `NOT_SET:${f.data?.field}${f.data?.part ? `.${f.data.part}` : ""}` : f.code));

describe("the builders' works value and the first interim minimum (§8.3)", () => {
  it("BWV = 317,973.70 − 18,000.00 − 6,500.00 = 293,473.70, from the bill", () => {
    const b = buildBaseline(inputs());
    expect(b.sumsSource).toBe("BQ");
    expect(b.buildersWorksValue).toBe(S("293473.70"));
  });

  it("first interim minimum = lesser of floor 1,000.00 and 10% × 293,473.70 → 1,000.00, derived", () => {
    const b = buildBaseline(inputs());
    expect(b.firstInterimMinimum).toBe(S("1000.00"));
    expect(b.firstInterimSource).toBe("DERIVED");
  });

  it("BWV 8,500.00 → 850.00 (10% is below the floor)", () => {
    const b = buildBaseline(inputs({ contractSum: S("8500.00"), bq: { versionNo: 1, primeCostSums: 0n, provisionalSums: 0n, incompleteLines: 0 } }));
    expect(b.buildersWorksValue).toBe(S("8500.00"));
    expect(b.firstInterimMinimum).toBe(S("850.00"));
  });

  it("the policy unset: no first interim minimum, NOT_SET, and it may be keyed; the policy set, it may not", () => {
    const unset = inputs({ interimPolicy: { floor: null, pct: null, provenance: null } });
    expect(buildBaseline(unset).firstInterimMinimum).toBeNull();
    expect(fields(baselineFaults(buildBaseline(unset), { defectsLiabilityApplies: true }))).toContain("NOT_SET:firstInterim");
    expect(enterFault("firstInterim", unset)).toBeNull();
    expect(enterFault("firstInterim", inputs())).toBe("DERIVED_BY_POLICY");
  });

  it("an Appendix that states the minimum wins over the policy's derivation", () => {
    const b = buildBaseline(inputs({ appendix: { packVersion: 1, ladKind: null, ladAmount: null, ladPct: null, dlpApplies: null, dlpMonths: null, sectionalCompletion: null, sections: [], firstInterimMinimum: S("5000.00"), subsequentInterimMinimum: null, honourCertificateDays: null } }));
    expect(b.firstInterimMinimum).toBe(S("5000.00"));
    expect(b.firstInterimSource).toBe("APPENDIX");
  });

  it("a bill with lines not complete does not state the sums", () => {
    expect(sourceOf("sums", inputs({ bq: { versionNo: 1, primeCostSums: 0n, provisionalSums: 0n, incompleteLines: 2 } }))).toBeNull();
  });
});

describe("liquidated damages a day (§8.6, Q-6)", () => {
  it("LAD 0.025% × 1,077,508.60 = 269.38 a day (half up)", () => {
    expect(ladDailyOf("PERCENT_OF_SUM_PER_DAY", null, "0.025", S("1077508.60"))).toBe(S("269.38"));
    const b = buildBaseline(inputs({ contractSum: S("1077508.60"), appendix: { packVersion: 3, ladKind: "PERCENT_OF_SUM_PER_DAY", ladAmount: null, ladPct: "0.025", dlpApplies: true, dlpMonths: 12, sectionalCompletion: false, sections: [], firstInterimMinimum: null, subsequentInterimMinimum: null, honourCertificateDays: null } }));
    expect(b.ladSource).toBe("APPENDIX");
    expect(b.ladDaily).toBe(S("269.38"));
  });

  it("a percentage with no contract sum is fixed at award, never computed on an estimate", () => {
    expect(ladDailyOf("PERCENT_OF_SUM_PER_DAY", null, "0.025", null)).toBe("FIXED_AT_AWARD");
    expect(ladDailyOf(null, null, null, S("100.00"))).toBe("NOT_SET");
  });

  it("the Letter of Acceptance's amount a day wins over the Appendix", () => {
    const b = buildBaseline(inputs({
      award: { ...inputs().award, ladAmount: S("300.00"), ladUnit: "per day" },
      appendix: { packVersion: 1, ladKind: "PERCENT_OF_SUM_PER_DAY", ladAmount: null, ladPct: "0.025", dlpApplies: null, dlpMonths: null, sectionalCompletion: null, sections: [], firstInterimMinimum: null, subsequentInterimMinimum: null, honourCertificateDays: null },
    }));
    expect([b.ladSource, b.ladKind, b.ladDaily]).toEqual(["AWARD", "AMOUNT_PER_DAY", S("300.00")]);
  });

  it("an amount not stated a day is not a daily rate", () => {
    const b = buildBaseline(inputs({ award: { ...inputs().award, ladAmount: S("2000.00"), ladUnit: "per week" } }));
    expect(b.ladDaily).toBeNull();
    expect(fields(baselineFaults(b, { defectsLiabilityApplies: true }))).toContain("LAD_UNIT_NOT_DAILY");
  });

  it("nothing states it: NOT_SET, named", () => {
    expect(fields(baselineFaults(buildBaseline(inputs()), { defectsLiabilityApplies: true }))).toContain("NOT_SET:lad");
  });
});

describe("the defects liability period and the contract type (FR-MTD-012)", () => {
  const appendix = (dlpApplies: boolean | null, dlpMonths: number | null) => ({ packVersion: 1, ladKind: null, ladAmount: null, ladPct: null, dlpApplies, dlpMonths, sectionalCompletion: null, sections: [], firstInterimMinimum: null, subsequentInterimMinimum: null, honourCertificateDays: null });

  it("DLP false with months → refused", () => {
    const b = { ...buildBaseline(inputs()), dlpApplies: false, dlpMonths: 12 };
    expect(fields(baselineFaults(b, { defectsLiabilityApplies: null }))).toContain("DLP_MONTHS_NOT_EXPECTED");
  });

  it("DLP true without months → NOT_SET", () => {
    const b = buildBaseline(inputs({ appendix: appendix(true, null) }));
    expect(fields(baselineFaults(b, { defectsLiabilityApplies: true }))).toContain("NOT_SET:dlp.months");
  });

  it("a type with no DLP cannot carry one; a type with one cannot go without", () => {
    const withDlp = buildBaseline(inputs({ appendix: appendix(true, 12) }));
    expect(fields(baselineFaults(withDlp, { defectsLiabilityApplies: false }))).toContain("DLP_NOT_FOR_TYPE");
    const without = buildBaseline(inputs({ appendix: appendix(false, null) }));
    expect(fields(baselineFaults(without, { defectsLiabilityApplies: true }))).toContain("DLP_REQUIRED_BY_TYPE");
    expect(baselineFaults(without, { defectsLiabilityApplies: null }).map((f) => f.code)).toContain("DLP_BEHAVIOUR_NOT_SET");
  });

  it("the award's 0 months (BD-64-40) reads as no defects liability period, never '0 months'", () => {
    const b = buildBaseline(inputs({ award: { ...inputs().award, dlpMonths: 0 } }));
    expect([b.dlpSource, b.dlpApplies, b.dlpMonths]).toEqual(["AWARD", false, null]);
  });

  it("a band with no DLP derives none", () => {
    const b = buildBaseline(inputs({ band: { label: "Short form", retentionApplies: null, defectsLiabilityApplies: false, provenance: "ASSUMED" } }));
    expect([b.dlpSource, b.dlpApplies]).toEqual(["DERIVED", false]);
  });
});

describe("retention (B3: never 0)", () => {
  const NO_RETENTION_BAND = { label: "Below RM50,000: no retention (fixture)", retentionApplies: false, defectsLiabilityApplies: null, provenance: "ASSUMED" as const };

  it("the band says none (§8.5, fixture band) → retentionApplies false, nothing asked, the retention complete", () => {
    const b = buildBaseline(inputs({ band: NO_RETENTION_BAND }));
    expect([b.retentionSource, b.retentionApplies, b.retentionPercent, b.retentionCapPercent]).toEqual(["DERIVED", false, null, null]);
    expect(fields(baselineFaults(b, { defectsLiabilityApplies: true })).filter((f) => f.startsWith("NOT_SET:retention"))).toEqual([]);
  });

  it("applies with the percentage or the cap unset → NOT_SET for each, never 0", () => {
    const b = buildBaseline(inputs({ band: { ...NO_RETENTION_BAND, retentionApplies: true }, award: { ...inputs().award, retentionPercent: "10", retentionCapPercent: null } }));
    expect(b.retentionApplies).toBe(true);
    expect(fields(baselineFaults(b, { defectsLiabilityApplies: true }))).toContain("NOT_SET:retention.cap");
    expect(b.retentionCapPercent).toBeNull();
  });

  it("applies not answered → NOT_SET", () => {
    const b = buildBaseline(inputs());
    expect(b.retentionApplies).toBeNull();
    expect(fields(baselineFaults(b, { defectsLiabilityApplies: true }))).toContain("NOT_SET:retention");
  });

  it("the letter states both figures → applies, from the award", () => {
    const b = buildBaseline(inputs({ award: { ...inputs().award, retentionPercent: "10", retentionCapPercent: "5" } }));
    expect([b.retentionSource, b.retentionApplies, b.retentionPercent, b.retentionCapPercent]).toEqual(["AWARD", true, "10", "5"]);
  });

  it("a letter stating retention where the band says none warns", () => {
    const i = inputs({ band: NO_RETENTION_BAND, award: { ...inputs().award, retentionPercent: "10", retentionCapPercent: "5" } });
    expect(baselineFaults(buildBaseline(i), { defectsLiabilityApplies: true }, i.band, i.award).find((f) => f.code === "RETENTION_STATED_BUT_BAND_SAYS_NONE")?.level).toBe("warn");
  });
});

describe("keyed at baseline (OD-5 A)", () => {
  it("only what nothing else states is keyed; a stated value is never overwritten", () => {
    const i = inputs({ award: { ...inputs().award, ladAmount: S("300.00"), ladUnit: "per day" } });
    expect(enterFault("lad", i)).toBe("STATED_ELSEWHERE");
    const b = buildBaseline(i, { lad: { kind: "AMOUNT_PER_DAY", amount: S("999.00"), pct: null } });
    expect(b.ladAmount).toBe(S("300.00"));
  });

  it("a keyed value is ENTERED and the derived values follow it", () => {
    const b = buildBaseline(inputs({ bq: null }), { sums: { pc: S("18000.00"), ps: S("6500.00") }, dlp: { applies: true, months: 12 }, lad: { kind: "AMOUNT_PER_DAY", amount: S("250.00"), pct: null }, retention: { applies: true, percent: "10", cap: "5" }, subsequentInterim: S("500.00"), sectional: { applies: false, sections: [] } });
    expect([b.sumsSource, b.buildersWorksValue, b.firstInterimMinimum, b.ladSource, b.ladDaily, b.dlpSource]).toEqual(["ENTERED", S("293473.70"), S("1000.00"), "ENTERED", S("250.00"), "ENTERED"]);
    expect(fields(baselineFaults(b, { defectsLiabilityApplies: true }))).toEqual([]);
  });

  it("sectional completion keyed with a section whose damages are not stated is refused, named", () => {
    const b = buildBaseline(inputs(), { sectional: { applies: true, sections: [{ ref: "A", description: "Pump house", ladKind: null, ladAmount: null, ladPct: null }] } });
    expect(baselineFaults(b, { defectsLiabilityApplies: true }).find((f) => f.code === "SECTION_LAD_NOT_SET")?.data).toEqual({ section: "Pump house" });
    const none = buildBaseline(inputs(), { sectional: { applies: true, sections: [] } });
    expect(fields(baselineFaults(none, { defectsLiabilityApplies: true }))).toContain("SECTIONS_REQUIRED");
  });

  it("a keyed group needs the provenance the officer chose: there is no default", () => {
    const i = inputs({ bq: null });
    const entered = { sums: { pc: S("18000.00"), ps: S("6500.00") }, onCost: "15" };
    expect(enteredFaults(i, entered, {}).map((f) => [f.code, f.data?.group])).toEqual([["PROVENANCE_NOT_CHOSEN", "sums"], ["PROVENANCE_NOT_CHOSEN", "onCost"]]);
    expect(enteredFaults(i, entered, { sums: { provenance: null, note: "" }, onCost: { provenance: "STATED", note: "" } }).map((f) => f.data?.group)).toEqual(["sums"]);
    expect(enteredFaults(i, entered, { sums: { provenance: "ASSUMED", note: "" }, onCost: { provenance: "STATED", note: "" } })).toEqual([]);
  });

  it("keying over a stated or derived value is refused, naming the group", () => {
    const i = inputs({ award: { ...inputs().award, ladAmount: S("300.00"), ladUnit: "per day" } });
    expect(enteredFaults(i, { lad: { kind: "AMOUNT_PER_DAY", amount: S("1.00"), pct: null }, firstInterim: S("5.00") }, { lad: { provenance: "STATED", note: "" }, firstInterim: { provenance: "STATED", note: "" } }).map((f) => [f.code, f.data?.group])).toEqual([["STATED_ELSEWHERE", "lad"], ["DERIVED_BY_POLICY", "firstInterim"]]);
  });

  it("the optional values are noted, never blocking", () => {
    const fs = baselineFaults(buildBaseline(inputs()), { defectsLiabilityApplies: true }).filter((f) => f.level === "info").map((f) => f.data?.field);
    expect(fs).toEqual(["honourDays", "unfixedMaterials", "onCost", "designWork"]);
  });
});

describe("the date for completion (dates)", () => {
  it("possession 2026-04-07 + 29 weeks → 2026-10-27 (the prototype contract)", () => {
    expect(dateForCompletion("2026-04-07", 29, "WEEKS")).toBe("2026-10-27");
  });
  it("2026-01-31 + 1 month → 2026-02-28 (clamped to the month's end)", () => {
    expect(dateForCompletion("2026-01-31", 1, "MONTHS")).toBe("2026-02-28");
  });
  it("possession not recorded → not set", () => {
    expect(dateForCompletion(null, 29, "WEEKS")).toBeNull();
    expect(buildBaseline(inputs()).dateForCompletion).toBeNull();
  });
  it("derive follows a possession day written into a version", () => {
    expect(derive({ ...buildBaseline(inputs()), possessionDate: "2026-04-07" }, FIXTURE_POLICY).dateForCompletion).toBe("2026-10-27");
  });
});

describe("versions and baselineFor", () => {
  const v = (version: number | null, recordedOn: string | null) => ({ version, reason: version ? ("CONFIRMED" as const) : null, recordedOn });

  it("the version in force on a day is the highest recorded on or before it; the draft never", () => {
    const vs = [v(null, null), v(1, "2026-03-02"), v(2, "2026-03-20"), v(3, "2026-05-01")];
    expect(baselineFor(vs, "2026-03-01")).toBeNull();
    expect(baselineFor(vs, "2026-03-02")?.version).toBe(1);
    expect(baselineFor(vs, "2026-04-30")?.version).toBe(2);
    expect(baselineFor(vs, "2026-10-01")?.version).toBe(3);
  });

  it("the next version number follows the highest", () => {
    expect(nextVersionNo([v(null, null)])).toBe(1);
    expect(nextVersionNo([v(1, "2026-03-02"), v(2, "2026-03-20")])).toBe(3);
  });

  it("changedFields names what a version changed (execution adds only the Contract Date)", () => {
    const a = buildBaseline(inputs());
    expect(changedFields(a, { ...a, contractDate: "2026-03-20" })).toEqual(["contractDate"]);
    expect(changedFields(a, applyEntered(a, { onCost: "15" }))).toEqual(["onCost"]);
  });
});
