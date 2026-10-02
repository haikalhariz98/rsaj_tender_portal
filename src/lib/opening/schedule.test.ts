import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { jadualTawaran, lateCount, scheduleFromSnapshot, type ScheduleRowInput } from "./schedule";

/** FR-OPN-005, 007, OD-9, OD-5: the schedule from the record, versioned, the benchmark only once disclosed. */

const row = (listingNo: number, openingSequence = 1, over: Partial<ScheduleRowInput> = {}): ScheduleRowInput => ({ listingNo, bidderName: `Bidder ${listingNo}`, registrationClass: "G5", registrationStatus: "Active", price: parseSen(`${300000 + listingNo}.00`), period: { value: 12, unit: "MONTHS" }, isAlternative: false, parentListingNo: null, openingSequence, ...over });
const base = { version: 1, title: "Reservoir inlet works", reference: "DEMO/SX/0016/2026", startDay: "2026-10-20", closingAt: new Date("2026-11-17T06:30:00Z"), invited: { reading: "PURCHASERS" as const, purchasers: 5, invitees: 0 }, lateCount: 2, pages: 3, rows: [row(2), row(1), row(3)], benchmark: { sealed: true } as const, lockGap: { seconds: 730, text: "12 min 10 s" } };

describe("the Jadual Tawaran", () => {
  it("rows in listing order with the columns; the price as a two-place decimal", () => {
    const { schedule, faults } = jadualTawaran(base);
    expect(faults).toEqual([]);
    expect(schedule.rows.map((r) => r.listingNo)).toEqual([1, 2, 3]);
    expect(schedule.rows[0]).toEqual({ listingNo: 1, bidderName: "Bidder 1", registrationClass: "G5", registrationStatus: "Active", openingPrice: "300001.00", period: { value: 12, unit: "MONTHS" }, isAlternative: false, parentListingNo: null });
  });
  it("the late count is from the register: 2 late envelopes → 2, still 2 after one is admitted; never the estimate", () => {
    const late = [{ kind: "BID" as const, late: true }, { kind: "BID" as const, late: true }, { kind: "BID" as const, late: false }, { kind: "COMPANY_ESTIMATE" as const, late: false }];
    expect(lateCount(late)).toBe(2);
    expect(jadualTawaran({ ...base, lateCount: lateCount(late) }).schedule.header.lateCount).toBe(2);
  });
  it("the benchmark row only when disclosed; before, sealed, with no figure", () => {
    expect(jadualTawaran(base).schedule.benchmark).toEqual({ sealed: true });
    expect(jadualTawaran({ ...base, benchmark: { sealed: false, label: null, value: parseSen("420000.00") } }).schedule.benchmark).toEqual({ sealed: false, label: null, companyEstimate: "420000.00" });
    expect(jadualTawaran({ ...base, benchmark: { notRequired: true } }).schedule.benchmark).toEqual({ notRequired: true });
  });
  it("the invited count by the reading; unset → READING_NOT_SET", () => {
    expect(jadualTawaran({ ...base, invited: { reading: "INVITEES", purchasers: 5, invitees: 4 } }).schedule.header.invitedCount).toBe(4);
    const r = jadualTawaran({ ...base, invited: { reading: null, purchasers: 5, invitees: 4 } });
    expect(r.faults.map((f) => f.code)).toEqual(["READING_NOT_SET"]);
    expect(r.schedule.header.invitedCount).toBeNull();
  });
  it("a supplementary opening produces version 2 with the admitted bid at the next Bil.; version 1 kept", () => {
    const rows = [row(1), row(2), row(3), row(4, 2)];
    expect(jadualTawaran({ ...base, rows }).schedule.rows.map((r) => r.listingNo)).toEqual([1, 2, 3]);
    expect(jadualTawaran({ ...base, rows, version: 2 }).schedule.rows.map((r) => r.listingNo)).toEqual([1, 2, 3, 4]);
  });
  it("round-trips through its frozen snapshot", () => {
    const s = jadualTawaran(base).schedule;
    expect(scheduleFromSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(scheduleFromSnapshot({})).toBeNull();
  });
});
