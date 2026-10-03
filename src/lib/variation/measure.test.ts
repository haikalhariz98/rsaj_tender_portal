import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { dayworkFaults, dayworkFlags, measuredAmount, measurementFaults, parseQuantity, parseSignedPercent, removeMeasurementFaults, type MeasureInput } from "./measure";

/** Measurement and daywork (FR-VAR-017, 018, 019). Invented fixtures; a finance reader can check each amount. */

const S = parseSen;
const HEADING = "Additional valve chamber at CH 1+200";
const m = (x: Partial<MeasureInput> = {}): MeasureInput => ({ instruction: { description: HEADING, issued: true }, orderLive: false, heading: HEADING, itemRef: "V1/1", measuredRefs: [], rateSource: "CONTRACT_RATE", bqItemRef: "BQ 4/12", agreedRateApproved: false, quantity: parseQuantity("12.5"), baseRate: S("480.00"), adjustmentTt: null, coveredUp: false, recordsNote: "", measuredOn: "2026-06-10", today: "2026-06-11", ...x });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("the amount: quantity × rate × (100% + adjustment), half up to the sen once", () => {
  it("12.500 × RM480.00 = RM6,000.00", () => {
    expect(measuredAmount(parseQuantity("12.5"), S("480.00"), null)).toBe(S("6000.00"));
  });
  it("with the contract's adjustment of −7.5%: 12.500 × 480.00 × 92.5% = RM5,550.00", () => {
    expect(measuredAmount(parseQuantity("12.5"), S("480.00"), parseSignedPercent("-7.5"))).toBe(S("5550.00"));
  });
  it("rounded once, never the rate first: 3.333 × RM10.01 × 105% = 35.0300... → RM35.03", () => {
    // 3.333 × 10.01 = 33.36333; × 1.05 = 35.0314965 → 35.03. Rounding the rate first (10.51) would give 35.03 too;
    // 7.777 × 0.13 × 102.5% = 1.03628525 → 1.04, where the rate rounded first (0.13325→0.13) gives 1.01.
    expect(measuredAmount(parseQuantity("3.333"), S("10.01"), parseSignedPercent("5"))).toBe(S("35.03"));
    expect(measuredAmount(parseQuantity("7.777"), S("0.13"), parseSignedPercent("2.5"))).toBe(S("1.04"));
  });
  it("half up at exactly half a sen: 0.005 × RM1.00 = RM0.01", () => {
    expect(measuredAmount(parseQuantity("0.005"), S("1.00"), null)).toBe(S("0.01"));
    expect(measuredAmount(parseQuantity("0.004"), S("1.00"), null)).toBe(S("0.00"));
  });
});

describe("FR-VAR-017: under the instruction's heading, one item each, never merged", () => {
  it("a sound item", () => expect(measurementFaults(m())).toEqual([]));
  it("a heading not the instruction's, word for word, is refused", () => {
    expect(codes(measurementFaults(m({ heading: "Additional valve chamber" })))).toEqual(["HEADING_NOT_INSTRUCTION"]);
    expect(codes(measurementFaults(m({ heading: `${HEADING} ` })))).toEqual(["HEADING_NOT_INSTRUCTION"]);
  });
  it("an item measured already is refused (no merging)", () => {
    expect(codes(measurementFaults(m({ measuredRefs: ["V1/1"] })))).toEqual(["ITEM_ALREADY_MEASURED"]);
  });
  it("work to be covered up needs its detailed records", () => {
    expect(codes(measurementFaults(m({ coveredUp: true })))).toEqual(["RECORDS_REQUIRED"]);
    expect(measurementFaults(m({ coveredUp: true, recordsNote: "Photographs and dip records, 10 Jun" }))).toEqual([]);
  });
  it("not before the instruction is issued, nor once an order is raised from the lines", () => {
    expect(codes(measurementFaults(m({ instruction: { description: HEADING, issued: false } })))).toEqual(["INSTRUCTION_NOT_ISSUED"]);
    expect(codes(measurementFaults(m({ orderLive: true })))).toEqual(["ORDER_RAISED"]);
    expect(codes(removeMeasurementFaults({ orderLive: true, removed: false, reason: "x" }))).toEqual(["ORDER_RAISED"]);
    expect(codes(removeMeasurementFaults({ orderLive: false, removed: false, reason: "" }))).toEqual(["FIELD_REQUIRED"]);
  });
});

describe("FR-VAR-018: the rate's source", () => {
  it("a contract rate cites its item; an agreed rate only once its approval route is approved", () => {
    expect(codes(measurementFaults(m({ bqItemRef: "" })))).toEqual(["CONTRACT_ITEM_REQUIRED"]);
    expect(codes(measurementFaults(m({ rateSource: "AGREED_RATE", bqItemRef: "" })))).toEqual(["AGREED_RATE_NOT_APPROVED"]);
    expect(measurementFaults(m({ rateSource: "AGREED_RATE", bqItemRef: "", agreedRateApproved: true }))).toEqual([]);
    expect(codes(measurementFaults(m({ rateSource: "AGREED_RATE", agreedRateApproved: true, adjustmentTt: 1n })))).toEqual(["ADJUSTMENT_CONTRACT_RATE_ONLY"]);
  });
});

describe("FR-VAR-019: daywork", () => {
  it("not agreed on the day worked is flagged; substantiation against its frozen clock", () => {
    expect(dayworkFlags({ workedOn: "2026-06-01", agreedOn: "2026-06-01", substantiationDueOn: "2026-06-08", substantiationReceivedOn: "2026-06-08" }, "2026-06-20")).toEqual({ notAgreedSameDay: false, substantiation: { state: "RECEIVED", due: "2026-06-08", late: false } });
    expect(dayworkFlags({ workedOn: "2026-06-01", agreedOn: "2026-06-02", substantiationDueOn: "2026-06-08", substantiationReceivedOn: "2026-06-09" }, "2026-06-20")).toEqual({ notAgreedSameDay: true, substantiation: { state: "RECEIVED", due: "2026-06-08", late: true } });
    expect(dayworkFlags({ workedOn: "2026-06-01", agreedOn: null, substantiationDueOn: "2026-06-08", substantiationReceivedOn: null }, "2026-06-09").substantiation).toEqual({ state: "OPEN", due: "2026-06-08", overdue: true });
    expect(dayworkFlags({ workedOn: "2026-06-01", agreedOn: null, substantiationDueOn: null, substantiationReceivedOn: null }, "2026-06-09").substantiation).toEqual({ state: "NOT_SET" });
  });
  it("its days in order, none in the future; an agreement names who", () => {
    const d = { workedOn: "2026-06-01", agreedOn: "2026-06-01", agreedWith: "Site agent", receivedOn: null, description: "Excavator 6 h", today: "2026-06-02", instructed: true };
    expect(dayworkFaults(d)).toEqual([]);
    expect(codes(dayworkFaults({ ...d, agreedWith: "" }))).toEqual(["FIELD_REQUIRED"]);
    expect(codes(dayworkFaults({ ...d, agreedOn: "2026-05-31" }))).toEqual(["BEFORE_WORKED"]);
    expect(codes(dayworkFaults({ ...d, workedOn: "2026-06-03", agreedOn: null }))).toEqual(["FUTURE_DATE"]);
    expect(codes(dayworkFaults({ ...d, instructed: false }))).toEqual(["INSTRUCTION_NOT_ISSUED"]);
  });
});
