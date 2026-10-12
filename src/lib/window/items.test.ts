import { describe, expect, it } from "vitest";

import { itemFaults, noticeSubmitFaults, type NoticeSubmitInput, type WindowItems } from "./items";

/**
 * The notice's items judged for the submit gate (Sourcing Requirements v2, SR-06, ruling 9). Invented values throughout: the fee floors, the
 * regime and whether mandatory attendance is permitted are the customer's policy, passed in.
 */

const items: WindowItems & { bidValidityDays: number | null } = {
  inspectionPlace: "The procurement office",
  purchasePlace: "The finance counter",
  inspectionHours: "Weekdays, 9 to 4",
  purchaseFromDay: "2026-11-02",
  purchaseCloseDay: "2026-11-20",
  fee: 20000n,
  feePaymentMethods: "Bank draft",
  submissionPlace: "The tender box",
  closingTimeReason: "",
  bidValidityDays: 90,
};

const base: NoticeSubmitInput = {
  window: items,
  events: [],
  mandatoryAttendancePermitted: false,
  proposedClosingAt: null,
  regime: "ONE",
  floors: [{ regime: "ONE", minimum: 10000n }],
  basisTotal: 0n,
};

const codes = (i: NoticeSubmitInput) => noticeSubmitFaults(i).map((f) => f.code);

describe("noticeSubmitFaults (SR-06)", () => {
  it("passes a prepared window with a validity and a fee above the floor", () => {
    expect(noticeSubmitFaults(base).filter((f) => f.level === "block")).toEqual([]);
  });

  it("folds a window with nothing written under one finding, with the count it folds, and still asks for a validity", () => {
    const out = noticeSubmitFaults({ ...base, window: null });
    expect(out[0]).toMatchObject({ code: "WINDOW_ITEMS_NOT_PREPARED", level: "block" });
    // The six items the notice states and the fee: the count says how many the one finding stands for.
    expect((out[0].data as { count: number }).count).toBe(7);
    expect(out.map((f) => f.code)).toContain("BID_VALIDITY_NOT_SET");
    expect(out.map((f) => f.code)).not.toContain("INSPECTION_PLACE_MISSING");
    expect(out.map((f) => f.code)).not.toContain("FEE_NOT_SET");
  });

  it("asks for the bid validity when only it is missing: there is no default", () => {
    expect(codes({ ...base, window: { ...items, bidValidityDays: null } })).toEqual(["BID_VALIDITY_NOT_SET"]);
  });

  it("says each missing item on its own once a window exists", () => {
    const out = codes({ ...base, window: { ...items, inspectionPlace: " ", purchaseFromDay: null, submissionPlace: "" } });
    expect(out).toEqual(expect.arrayContaining(["INSPECTION_PLACE_MISSING", "PURCHASE_FROM_NOT_SET", "SUBMISSION_PLACE_MISSING"]));
    expect(out).not.toContain("WINDOW_ITEMS_NOT_PREPARED");
  });

  it("refuses the last day of sale before the first", () => {
    expect(codes({ ...base, window: { ...items, purchaseFromDay: "2026-11-20", purchaseCloseDay: "2026-11-02" } })).toContain("PURCHASE_DAYS_OUT_OF_ORDER");
    expect(itemFaults({ ...items, purchaseFromDay: "2026-11-02", purchaseCloseDay: "2026-11-02" })).toEqual([]);
  });

  it("passes the fee's findings through: a fee not set, and a fee below the customer's floor", () => {
    expect(codes({ ...base, window: { ...items, fee: null } })).toContain("FEE_NOT_SET");
    expect(codes({ ...base, window: { ...items, fee: 5000n } })).toContain("BELOW_FLOOR");
  });

  it("passes a site event's findings through, judged against the closing the documents propose", () => {
    const closing = new Date("2026-12-01T07:00:00Z");
    const event = { kind: "BRIEFING" as const, startsAt: new Date("2026-12-02T02:00:00Z"), place: "Room 1", mandatory: false, cancelled: false };
    expect(codes({ ...base, events: [event], proposedClosingAt: closing })).toContain("EVENT_AFTER_CLOSING");
    expect(codes({ ...base, events: [{ ...event, place: "" }] })).toContain("EVENT_PLACE_MISSING");
    expect(codes({ ...base, events: [{ ...event, cancelled: true, place: "" }] })).toEqual([]);
  });
});
