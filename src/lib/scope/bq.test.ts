import { describe, expect, it } from "vitest";

import { formatSen, parseSen } from "@/lib/money";

import { bqTotals, currentBq, draftEditFaults, exerciseAllowsBq, finaliseFaults, holdingOn, isQuantity, itemAmount, keyedMismatch, lineSizeFaults, quantityFits, repeatedSectionNumbers, reviseFaults, sharePct, startBqFaults, totalsSnapshot, unpricedBq, type BqVersionFacts } from "./bq";
import { UNSET_SCOPE_POLICY, type BqLine, type ScopePolicy } from "./types";

const sen = parseSen;
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const line = (x: Partial<BqLine> & Pick<BqLine, "quantity" | "rate">): BqLine => ({ itemRef: "", description: "A line", unit: "item", kind: "MEASURED", provisional: false, ...x });

/**
 * The worked example, for a finance reader to check by hand (spec FR-EST-002 and SK011
 * §7.2.4 on builders' works value; RSAJ figures, kept as a test fixture only — X-10(d)):
 *
 *   A  Preliminaries                         1 item  × 45,000.00  =  45,000.00
 *   B  Pipe laying                    1,250.5 m      ×    182.40  = 228,091.20
 *   C  Excavation under road (provisional) 310 m³    ×     65.75  =  20,382.50
 *   D  Prime cost sum                        1 sum   × 18,000.00  =  18,000.00
 *   E  Provisional sum                       1 sum   ×  6,500.00  =   6,500.00
 *                                                          Total  = 317,973.70
 *   Builders' works value (§8.3): total − PC sums − provisional sums
 *                     = 317,973.70 − 18,000.00 − 6,500.00          = 293,473.70
 *   Provisional quantities as a share of the total: 20,382.50 / 317,973.70 = 6.4101 %
 *   Firm value: provisional quantities left out → 317,973.70 − 20,382.50 = 297,591.20;
 *               not left out → 317,973.70;  not stated → no firm value.
 */
const example: BqLine[] = [
  line({ itemRef: "A", description: "Preliminaries", unit: "item", quantity: "1", rate: sen("45000.00") }),
  line({ itemRef: "B", description: "Pipe laying", unit: "m", quantity: "1250.5", rate: sen("182.40") }),
  line({ itemRef: "C", description: "Excavation under road", unit: "m3", quantity: "310", rate: sen("65.75"), provisional: true }),
  line({ itemRef: "D", description: "Prime cost sum", unit: "sum", kind: "PRIME_COST_SUM", quantity: "1", rate: sen("18000.00") }),
  line({ itemRef: "E", description: "Provisional sum", unit: "sum", kind: "PROVISIONAL_SUM", quantity: "1", rate: sen("6500.00") }),
];

describe("a line's amount: quantity to three places times the rate, half up to the sen, never keyed", () => {
  it("1,250.5 m × RM182.40 = RM228,091.20", () => {
    expect(itemAmount("1250.5", sen("182.40"))).toBe(sen("228091.20"));
    expect(itemAmount("1,250.500", sen("182.40"))).toBe(sen("228091.20"));
  });
  it("1.5 × RM0.03 = 4.5 sen, which rounds half up to 5 sen", () => {
    expect(itemAmount("1.5", sen("0.03"))).toBe(5n);
    expect(itemAmount("1.4", sen("0.03"))).toBe(4n);
    expect(itemAmount("0.001", sen("0.01"))).toBe(0n);
  });
  it("no amount until both are given, and none for a quantity that is not one", () => {
    expect(itemAmount(null, sen("1.00"))).toBeNull();
    expect(itemAmount("2", null)).toBeNull();
    expect(itemAmount("1.2345", sen("1.00"))).toBeNull();
    expect(itemAmount("-1", sen("1.00"))).toBeNull();
    expect(itemAmount("2", -100n)).toBeNull();
    expect(isQuantity("1,250.5")).toBe(true);
    expect(isQuantity("1.2345")).toBe(false);
    expect(isQuantity("abc")).toBe(false);
  });
  it("a keyed amount that differs is reported and ignored; one that agrees is not reported", () => {
    const computed = itemAmount("1250.5", sen("182.40"));
    expect(keyedMismatch(sen("228091.00"), computed)).toEqual({ keyed: sen("228091.00"), computed: sen("228091.20") });
    expect(keyedMismatch(sen("228091.20"), computed)).toBeNull();
    expect(keyedMismatch(null, computed)).toBeNull();
    // The totals never read a keyed figure: there is nowhere to put one.
    expect(bqTotals([line({ quantity: "1250.5", rate: sen("182.40") })], null).total).toBe(sen("228091.20"));
  });
});

describe("the bill's totals: the worked example", () => {
  it("total RM317,973.70, builders' works RM293,473.70, provisional share 6.4101", () => {
    const t = bqTotals(example, null);
    expect(formatSen(t.total)).toBe("RM317,973.70");
    expect(formatSen(t.buildersWorks)).toBe("RM293,473.70");
    expect(t.measuredFirm).toBe(sen("273091.20"));
    expect(t.provisionalQuantities).toBe(sen("20382.50"));
    expect(t.primeCostSums).toBe(sen("18000.00"));
    expect(t.provisionalSums).toBe(sen("6500.00"));
    expect(t.provisionalSharePct).toBe("6.4101");
    expect(t.incompleteLines).toBe(0);
  });
  it("firm value: 297,591.20 when provisional quantities are left out, 317,973.70 when not, none when not stated (OD-7)", () => {
    expect(bqTotals(example, true).firmValue).toBe(sen("297591.20"));
    expect(bqTotals(example, false).firmValue).toBe(sen("317973.70"));
    expect(bqTotals(example, null).firmValue).toBeNull();
  });
  it("the share counts provisional quantities only, never prime cost or provisional sums", () => {
    const sumsOnly = bqTotals([example[0], example[3], example[4]], true);
    expect(sumsOnly.provisionalSharePct).toBe("0.0000");
    expect(sumsOnly.firmValue).toBe(sumsOnly.total);
  });
  it("an incomplete line is in no total, and is counted", () => {
    const t = bqTotals([...example, line({ quantity: "3", rate: null })], null);
    expect(t.total).toBe(sen("317973.70"));
    expect(t.incompleteLines).toBe(1);
  });
  it("the frozen totals are decimal strings", () => {
    expect(totalsSnapshot(bqTotals(example, true))).toEqual({
      measuredFirm: "273091.20", provisionalQuantities: "20382.50", primeCostSums: "18000.00", provisionalSums: "6500.00",
      total: "317973.70", buildersWorks: "293473.70", firmValue: "297591.20", provisionalSharePct: "6.4101",
    });
  });
});

describe("a share as a percentage, four places, exact (FR-EST-002 note)", () => {
  it("350,000.00 of 1,000,000.00 is 35.0000; the 30% routing stays in 6.13's configured rows", () => {
    expect(sharePct(sen("350000.00"), sen("1000000.00"))).toBe("35.0000");
  });
  it("rounds half up at the fourth place, and states no share of nothing", () => {
    expect(sharePct(1n, 3n)).toBe("33.3333");
    expect(sharePct(2n, 3n)).toBe("66.6667");
    expect(sharePct(1n, 200000000n)).toBe("0.0000");
    expect(sharePct(1n, 2000000n)).toBe("0.0001");
    expect(sharePct(0n, 0n)).toBeNull();
  });
  it("property: the share of the whole is 100.0000, and never more for a part no bigger", () => {
    for (const w of [1n, 7n, 99n, 31797370n, 123456789n]) {
      expect(sharePct(w, w)).toBe("100.0000");
      expect(Number(sharePct(w - 1n, w))).toBeLessThanOrEqual(100);
    }
  });
});

describe("finalising a draft (FR-EST-001, 003)", () => {
  const policy: ScopePolicy = { ...UNSET_SCOPE_POLICY, measurementStandardLabel: "A measurement standard", bqPreparerQualificationCode: "QS" };
  const holdings = [{ personId: "p11", qualificationCode: "QS", validFrom: "2025-01-01", validTo: "2026-09-30" }];
  const qualifications = [{ code: "QS", nameEn: "Qualified measurer", retiredOn: null }];
  const draft = (x: Partial<BqVersionFacts> = {}): BqVersionFacts => ({ status: "DRAFT", scopedBy: "IMPLEMENTING_DEPARTMENT", followsStandard: true, departuresText: "", preparerPersonId: "p11", lines: example, sectionNumbers: ["1", "2", "3", "4"], ...x });
  const judge = (v: BqVersionFacts, x: Partial<Parameters<typeof finaliseFaults>[1]> = {}) =>
    codes(finaliseFaults(v, { policy, holdings, qualifications, today: "2026-09-30", exerciseStatus: "DRAFT", ...x }));

  it("a section number used twice in the version is refused, naming it (an import into a template's sections must not double them)", () => {
    expect(judge(draft({ sectionNumbers: ["1", "2", "1", "3", " 2 "] }))).toEqual(["SECTION_NUMBER_REPEATED"]);
    expect(finaliseFaults(draft({ sectionNumbers: ["1", "2", "1"] }), { policy, holdings, qualifications, today: "2026-09-30", exerciseStatus: "DRAFT" })[0]).toEqual({ code: "SECTION_NUMBER_REPEATED", level: "block", data: { numbers: "1" } });
    expect(repeatedSectionNumbers(["1", "2", "1", "3", " 2 ", "1"])).toEqual(["1", "2"]);
    expect(repeatedSectionNumbers(["1", "1.1", "10"])).toEqual([]);
  });
  it("a complete draft by a qualified preparer finalises", () => {
    expect(judge(draft())).toEqual([]);
    // Departing from the standard, with the departures stated.
    expect(judge(draft({ followsStandard: false, departuresText: "Pipework measured by the length laid." }))).toEqual([]);
  });
  it("refuses an unset standard, an unanswered standard, and 'no' without departures", () => {
    expect(judge(draft(), { policy: { ...policy, measurementStandardLabel: null } })).toEqual(["STANDARD_NOT_SET"]);
    expect(judge(draft({ followsStandard: null }))).toEqual(["STANDARD_UNANSWERED"]);
    expect(judge(draft({ followsStandard: false, departuresText: "  " }))).toEqual(["DEPARTURES_REQUIRED"]);
  });
  it("refuses an unset qualification, and a qualification that lapsed the day before", () => {
    expect(judge(draft(), { policy: { ...policy, bqPreparerQualificationCode: null } })).toEqual(["QUALIFICATION_NOT_SET"]);
    expect(judge(draft(), { today: "2026-10-01" })).toEqual(["PREPARER_NOT_QUALIFIED"]);
    // The holding's last day still counts (inclusive, BD-62-4).
    expect(judge(draft(), { today: "2026-09-30" })).toEqual([]);
    expect(judge(draft({ preparerPersonId: "p10" }))).toEqual(["PREPARER_NOT_QUALIFIED"]);
    expect(judge(draft({ preparerPersonId: null }))).toEqual(["PREPARER_REQUIRED"]);
  });
  it("a qualification the organisation retired counts for nobody from that day", () => {
    expect(judge(draft(), { qualifications: [{ ...qualifications[0], retiredOn: "2026-09-30" }] })).toEqual(["PREPARER_NOT_QUALIFIED"]);
    expect(holdingOn(holdings, "p11", "QS", "2026-09-29", [{ ...qualifications[0], retiredOn: "2026-09-30" }])).not.toBeNull();
  });
  it("is judged on the organisation's day: none while the time zone is unset", () => {
    expect(judge(draft(), { today: null })).toEqual(["TIME_ZONE_NOT_SET"]);
  });
  it("refuses an empty bill, an incomplete line, no scoping body, a cancelled exercise, and anything not a draft", () => {
    expect(judge(draft({ lines: [] }))).toEqual(["NO_ITEMS"]);
    expect(judge(draft({ lines: [...example, line({ itemRef: "F", quantity: null, rate: sen("1.00") })] }))).toEqual(["ITEM_INCOMPLETE"]);
    expect(judge(draft({ lines: [line({ description: " ", quantity: "1", rate: 100n })] }))).toEqual(["ITEM_INCOMPLETE"]);
    expect(judge(draft({ scopedBy: null }))).toEqual(["SCOPED_BY_NOT_SET"]);
    expect(judge(draft(), { exerciseStatus: "CANCELLED" })).toEqual(["EXERCISE_CANCELLED"]);
    expect(judge(draft({ status: "FINALISED" }))).toEqual(["NOT_DRAFT"]);
  });
  it("whether provisional quantities are left out of the firm value is not needed to finalise (OD-7)", () => {
    // BqVersionFacts carries no such field: the rule cannot block on it.
    expect(judge(draft())).toEqual([]);
  });
});

describe("the bill's versions: one draft at a time", () => {
  it("the first bill starts once, on an open exercise", () => {
    expect(startBqFaults([], "DRAFT")).toEqual([]);
    expect(codes(startBqFaults([{ status: "DRAFT" }], "DRAFT"))).toEqual(["ALREADY_STARTED"]);
    expect(codes(startBqFaults([], "CANCELLED"))).toEqual(["EXERCISE_CANCELLED"]);
  });
  it("a revision needs a finalised version, no draft, and a reason", () => {
    expect(reviseFaults([{ status: "FINALISED" }], "DOCUMENTS_IN_PREPARATION", "Quantity of excavation re-measured.")).toEqual([]);
    expect(codes(reviseFaults([{ status: "SUPERSEDED" }, { status: "FINALISED" }, { status: "DRAFT" }], "DRAFT", "x"))).toEqual(["DRAFT_EXISTS"]);
    expect(codes(reviseFaults([{ status: "DRAFT" }], "DRAFT", "x"))).toEqual(["DRAFT_EXISTS"]);
    expect(codes(reviseFaults([], "DRAFT", "x"))).toEqual(["NOTHING_FINALISED"]);
    expect(codes(reviseFaults([{ status: "FINALISED" }], "DRAFT", " "))).toEqual(["REASON_REQUIRED"]);
    expect(codes(reviseFaults([{ status: "FINALISED" }], "CANCELLED", "x"))).toEqual(["EXERCISE_CANCELLED"]);
  });
  it("only a draft is edited, and not on a cancelled exercise", () => {
    expect(draftEditFaults({ status: "DRAFT" }, "DOCUMENTS_IN_PREPARATION")).toEqual([]);
    expect(codes(draftEditFaults({ status: "FINALISED" }, "DRAFT"))).toEqual(["NOT_DRAFT"]);
    expect(codes(draftEditFaults({ status: "SUPERSEDED" }, "CANCELLED"))).toEqual(["EXERCISE_CANCELLED", "NOT_DRAFT"]);
  });
  it("every exercise status is answered (X-8)", () => {
    expect(exerciseAllowsBq("DRAFT")).toBe("OPEN");
    expect(exerciseAllowsBq("DOCUMENTS_IN_PREPARATION")).toBe("OPEN");
    expect(exerciseAllowsBq("CANCELLED")).toBe("EXERCISE_CANCELLED");
  });
  it("the bill a reader sees: the finalised one and the draft revising it", () => {
    const vs = [{ versionNo: 1, status: "SUPERSEDED" as const }, { versionNo: 2, status: "FINALISED" as const }, { versionNo: 3, status: "DRAFT" as const }];
    expect(currentBq(vs)).toEqual({ finalised: vs[1], draft: vs[2] });
    expect(currentBq([])).toEqual({ finalised: null, draft: null });
  });
});

describe("the unpriced bill 6.4 issues to tenderers (OD-8)", () => {
  it("keeps every line's description, unit and quantity, and drops every rate, amount and total", () => {
    const u = unpricedBq({ versionNo: 2, sections: [{ number: "1", title: "Pipework", items: example.map((l) => ({ ...l, amount: itemAmount(l.quantity, l.rate) })) }], totals: { total: "317973.70" } });
    expect(u.versionNo).toBe(2);
    expect(u.sections[0].items[1]).toEqual({ itemRef: "B", description: "Pipe laying", unit: "m", kind: "MEASURED", quantity: "1250.5", provisional: false });
    expect(JSON.stringify(u)).not.toMatch(/rate|amount|total|18240|317973/);
  });
});

describe("a line's figures fit their columns (quantity Decimal(18, 3), rate and amount Decimal(18, 2))", () => {
  const fields = (q: string | null, r: bigint | null) => lineSizeFaults(q, r).map((f) => [f.code, f.field]);
  it("a quantity of 15 digits before the point fits; 16 do not; leading zeros and commas do not count", () => {
    expect(quantityFits("999999999999999.999")).toBe(true);
    expect(quantityFits("1000000000000000")).toBe(false);
    expect(quantityFits("000000000000000000001.5")).toBe(true);
    expect(quantityFits("999,999,999,999,999")).toBe(true);
    expect(fields("999999999999999.999", null)).toEqual([]);
    expect(fields("1000000000000000", null)).toEqual([["TOO_LARGE", "quantity"]]);
  });
  it("a rate of 16 digits before the point fits; 17 do not", () => {
    expect(fields(null, parseSen("9999999999999999.99"))).toEqual([]);
    expect(fields(null, parseSen("10000000000000000.00"))).toEqual([["TOO_LARGE", "rate"]]);
  });
  it("two figures that each fit can multiply past the amount's column: refused as the amount", () => {
    expect(fields("1", parseSen("9999999999999999.99"))).toEqual([]);
    expect(fields("1.001", parseSen("9999999999999999.99"))).toEqual([["TOO_LARGE", "amount"]]);
    expect(fields("100000000", parseSen("100000000.00"))).toEqual([["TOO_LARGE", "amount"]]);
    expect(fields("99999999", parseSen("100000000.00"))).toEqual([]);
  });
  it("a quantity that is not a quantity is QUANTITY_INVALID's to say, not a size", () => {
    expect(fields("abc", parseSen("1.00"))).toEqual([]);
  });
});
