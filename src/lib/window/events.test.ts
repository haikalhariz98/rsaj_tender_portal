import { describe, expect, it } from "vitest";

import { attendanceCsv, attendanceFaults, eventFaults, heldFault, isMandatory } from "./events";
import { event, klAt } from "./fixture";
import { windowFindingText } from "./labels";

/**
 * FR-ADV-013, OD-8 refined: mandatory attendance only where the policy permits it; unset or no
 * means no event is mandatory and none gates the sale ("Not mandatory: mandatory attendance not
 * set"). Where permitted, every scheduled event answers; a mandatory one gates the sale.
 */

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const closing = klAt("2026-11-17");

describe("a scheduled event", () => {
  it("needs its day and time, and its place, together", () => {
    expect(codes(eventFaults(event({ startsAt: null }), true, closing))).toEqual(["EVENT_TIME_MISSING"]);
    expect(codes(eventFaults(event({ place: " " }), true, closing))).toEqual(["EVENT_PLACE_MISSING"]);
    expect(eventFaults(event(), true, closing)).toEqual([]);
  });
  it("is before the closing", () => {
    expect(codes(eventFaults(event({ startsAt: klAt("2026-11-17", "15:00") }), true, closing))).toEqual(["EVENT_AFTER_CLOSING"]);
  });
  it("marked mandatory while the policy is not set, or no, is refused", () => {
    expect(eventFaults(event({ mandatory: true }), null, closing)[0]).toMatchObject({ code: "MANDATORY_NOT_PERMITTED", data: { permitted: "not set" } });
    expect(eventFaults(event({ mandatory: true }), false, closing)[0]).toMatchObject({ code: "MANDATORY_NOT_PERMITTED", data: { permitted: "no" } });
  });
  it("unanswered where mandatory attendance is permitted blocks publication", () => {
    expect(codes(eventFaults(event({ mandatory: null }), true, closing))).toEqual(["MANDATORY_NOT_ANSWERED"]);
  });
  it("where the policy is not set it is simply not mandatory, and says so (info only)", () => {
    const fs = eventFaults(event({ mandatory: null }), null, closing);
    expect(fs).toEqual([{ code: "MANDATORY_NOT_OFFERED", level: "info", data: { kind: "BRIEFING", permitted: "not set" } }]);
    expect(windowFindingText(fs[0])).toBe("Not mandatory: mandatory attendance not set.");
  });
  it("a cancelled event is judged no further", () => {
    expect(eventFaults(event({ cancelled: true, place: "" }), true, closing)).toEqual([]);
  });
});

describe("the sale's attendance gate", () => {
  const held = event({ mandatory: true, heldOn: "2026-11-06", attendeePartyIds: ["p1"] });
  it("a party absent from a held mandatory event is refused", () => {
    expect(codes(attendanceFaults("p2", [held], true))).toEqual(["ATTENDANCE_REQUIRED"]);
    expect(codes(attendanceFaults(null, [held], true))).toEqual(["ATTENDANCE_REQUIRED"]);
    expect(attendanceFaults("p1", [held], true)).toEqual([]);
  });
  it("a mandatory event not yet held refuses until it is", () => {
    expect(codes(attendanceFaults("p1", [event({ mandatory: true })], true))).toEqual(["EVENT_NOT_HELD"]);
  });
  it("not mandatory never refuses; nor does a mandatory answer the policy does not permit", () => {
    expect(attendanceFaults("p2", [event({ mandatory: false, heldOn: "2026-11-06" })], true)).toEqual([]);
    expect(attendanceFaults("p2", [held], null)).toEqual([]);
    expect(isMandatory(held, false)).toBe(false);
  });
});

describe("marking an event held", () => {
  const TZ = "Asia/Kuala_Lumpur";
  it("not before its day, not after today, once", () => {
    expect(heldFault(event(), "2026-11-06", "2026-11-07", TZ)).toBeNull();
    expect(heldFault(event(), "2026-11-05", "2026-11-07", TZ)?.code).toBe("HELD_BEFORE_START");
    expect(heldFault(event(), "2026-11-08", "2026-11-07", TZ)?.code).toBe("HELD_IN_FUTURE");
    expect(heldFault(event({ heldOn: "2026-11-06" }), "2026-11-06", "2026-11-07", TZ)?.code).toBe("ALREADY_HELD");
    expect(heldFault(event({ cancelled: true }), "2026-11-06", "2026-11-07", TZ)?.code).toBe("EVENT_CANCELLED");
    expect(heldFault(event(), "2026-11-06", null, null)?.code).toBe("TIME_ZONE_UNSET");
  });
});

describe("the attendance register as CSV (Lampiran E)", () => {
  it("heads with the event and lists each attendee, quoting what must be quoted and defusing formulas", () => {
    const csv = attendanceCsv(
      { exerciseReference: "SX/2026/1", kindLabel: "Tender briefing", startsText: "06 Nov 2026 · 10:00", place: "Room 2, Level 3", heldText: "06 Nov 2026", mandatoryText: "Mandatory" },
      [
        { name: "Alpha Works", registrationNo: "A-1", representative: "Siti", recordedBy: "Officer One", recordedText: "06 Nov 2026" },
        { name: "=HYPERLINK(1)", registrationNo: "B-2", representative: 'Ali "Boss"', recordedBy: "Officer One", recordedText: "06 Nov 2026" },
      ],
    );
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("Exercise,SX/2026/1");
    expect(lines[3]).toBe('Place,"Room 2, Level 3"');
    expect(lines[8]).toBe("1,Alpha Works,A-1,Siti,Officer One,06 Nov 2026");
    expect(lines[9]).toBe(`2,'=HYPERLINK(1),B-2,"Ali ""Boss""",Officer One,06 Nov 2026`);
  });
});
