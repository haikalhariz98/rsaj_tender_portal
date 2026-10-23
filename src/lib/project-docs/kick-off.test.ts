import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AGENDA_MAX, ATTENDEE_NAME_MAX, attendanceOf, changeFaults, heldFaults, KICK_OFF_STATE_TONE, KICK_OFF_STATE_WORDS, kickOffFaultText, kickOffState, LINK_MAX, offSideAttendees, PLACE_MAX, scheduleFaults, type KickOffFault, type KickOffState } from "./kick-off";
import type { Finding } from "./types";

/**
 * The kick-off meeting's rules (ADR 0042 D10, PW-18, PW-29; plan step 7 §8.2), every fault at once, each bound on both sides, and how the card reads a meeting
 * whose day has passed. A worked example a contract officer can check by hand closes the file.
 */

const codes = (fs: readonly Finding[]) => fs.map((f) => f.code).sort();
const x = (n: number) => "x".repeat(n);
const MEETS = new Date("2026-11-02T01:30:00.000Z");
const fine = { meetsAt: MEETS, place: "Site office", onlineLink: "", agenda: "Introductions. Programme. Safety." };

describe("scheduleFaults", () => {
  it("accepts a meeting with a place, or with an online link alone, and an agenda, by a person with PW-5 authority", () => {
    expect(scheduleFaults({ authorityToday: true, exists: false, ...fine })).toEqual([]);
    expect(scheduleFaults({ authorityToday: true, exists: false, ...fine, place: "", onlineLink: "meet.example.test/kick-off" })).toEqual([]);
  });

  it("refuses a person without PW-5 authority, and a second meeting for the contract (the unique key is the backstop)", () => {
    expect(codes(scheduleFaults({ authorityToday: false, exists: false, ...fine }))).toEqual(["NO_AUTHORITY"]);
    expect(codes(scheduleFaults({ authorityToday: true, exists: true, ...fine }))).toEqual(["ALREADY_SCHEDULED"]);
  });

  it("needs a time, a place or a link, and an agenda; blanks are spaces too (the CHECKs are the backstop); every fault at once", () => {
    expect(codes(scheduleFaults({ authorityToday: false, exists: true, meetsAt: null, place: "  ", onlineLink: " ", agenda: "\n" }))).toEqual(["AGENDA_REQUIRED", "ALREADY_SCHEDULED", "NO_AUTHORITY", "PLACE_OR_LINK_REQUIRED", "WHEN_REQUIRED"]);
    expect(codes(scheduleFaults({ authorityToday: true, exists: false, ...fine, meetsAt: new Date("not a time") }))).toEqual(["WHEN_REQUIRED"]);
  });

  it("holds each length bound exactly: at the limit is accepted, one over is TOO_LONG, naming the field and the limit", () => {
    expect(scheduleFaults({ authorityToday: true, exists: false, ...fine, place: x(PLACE_MAX), onlineLink: x(LINK_MAX), agenda: x(AGENDA_MAX) })).toEqual([]);
    const over = scheduleFaults({ authorityToday: true, exists: false, ...fine, place: x(PLACE_MAX + 1), onlineLink: x(LINK_MAX + 1), agenda: x(AGENDA_MAX + 1) });
    expect(over.map((f) => [f.code, f.data])).toEqual([
      ["TOO_LONG", { field: "place", limit: PLACE_MAX }],
      ["TOO_LONG", { field: "onlineLink", limit: LINK_MAX }],
      ["TOO_LONG", { field: "agenda", limit: AGENDA_MAX }],
    ]);
    // Surrounding spaces are not counted: the stored value is trimmed.
    expect(scheduleFaults({ authorityToday: true, exists: false, ...fine, place: ` ${x(PLACE_MAX)} ` })).toEqual([]);
  });
});

describe("changeFaults", () => {
  it("accepts a change before the meeting is held", () => {
    expect(changeFaults({ authorityToday: true, held: false, ...fine, place: "Head office" })).toEqual([]);
  });

  it("refuses any change once held (the trigger refuses it too, a no-op included), and a person without authority", () => {
    expect(codes(changeFaults({ authorityToday: true, held: true, ...fine }))).toEqual(["HELD"]);
    expect(codes(changeFaults({ authorityToday: false, held: false, ...fine }))).toEqual(["NO_AUTHORITY"]);
  });

  it("judges when, where and the agenda as scheduling does", () => {
    expect(codes(changeFaults({ authorityToday: true, held: false, meetsAt: null, place: "", onlineLink: "", agenda: "" }))).toEqual(["AGENDA_REQUIRED", "PLACE_OR_LINK_REQUIRED", "WHEN_REQUIRED"]);
    expect(codes(changeFaults({ authorityToday: true, held: false, ...fine, agenda: x(AGENDA_MAX + 1) }))).toEqual(["TOO_LONG"]);
  });
});

describe("heldFaults (PW-29: the minutes and the attendance are required, in one act)", () => {
  const ok = { authorityToday: true, scheduled: true, held: false, heldOn: "2026-11-02", today: "2026-11-03", attendees: 1, minutesFiles: 1 };

  it("accepts a scheduled meeting held on a day not after today, with one attendee and one file of minutes", () => {
    expect(heldFaults(ok)).toEqual([]);
  });

  it("the held day may be today, and not one day after (the boundary on both sides)", () => {
    expect(heldFaults({ ...ok, heldOn: "2026-11-03" })).toEqual([]);
    expect(codes(heldFaults({ ...ok, heldOn: "2026-11-04" }))).toEqual(["HELD_IN_FUTURE"]);
  });

  it("needs at least one attendee and at least one file of minutes: zero is refused, one is enough", () => {
    expect(codes(heldFaults({ ...ok, attendees: 0 }))).toEqual(["NO_ATTENDANCE"]);
    expect(codes(heldFaults({ ...ok, minutesFiles: 0 }))).toEqual(["NO_MINUTES"]);
  });

  it("refuses a meeting not scheduled, one already held, a person without authority, and a missing or unreadable day; every fault at once", () => {
    expect(codes(heldFaults({ authorityToday: false, scheduled: false, held: true, heldOn: null, today: "2026-11-03", attendees: 0, minutesFiles: 0 }))).toEqual(["HELD", "NOT_SCHEDULED", "NO_ATTENDANCE", "NO_AUTHORITY", "NO_MINUTES", "WHEN_REQUIRED"]);
    expect(codes(heldFaults({ ...ok, heldOn: "2026-02-30" }))).toEqual(["WHEN_REQUIRED"]);
    expect(heldFaults({ ...ok, heldOn: null })[0]!.data).toEqual({ field: "heldOn" });
  });
});

describe("attendanceOf: the rows the form ticked, each once", () => {
  it("keeps each person and each account once, and each other name once, compared without case or inner spacing; blanks are dropped", () => {
    const a = attendanceOf({ personIds: ["p1", "p1", " p2 ", ""], accountIds: ["a1", "a1"], otherNames: ["  Consultant's  engineer ", "consultant's engineer", "", "   ", "Surveyor"] });
    expect(a.faults).toEqual([]);
    expect(a.rows).toEqual([
      { side: "ORGANISATION", personId: "p1" },
      { side: "ORGANISATION", personId: "p2" },
      { side: "CONTRACTOR", supplierAccountId: "a1" },
      { side: null, name: "Consultant's engineer" },
      { side: null, name: "Surveyor" },
    ]);
  });

  it("nobody ticked and no name is no rows (heldFaults says NO_ATTENDANCE)", () => {
    expect(attendanceOf({ personIds: [], accountIds: [], otherNames: [" "] }).rows).toEqual([]);
  });

  it("an other name at the bound is accepted; one over is TOO_LONG, said once", () => {
    expect(attendanceOf({ personIds: [], accountIds: [], otherNames: [x(ATTENDEE_NAME_MAX)] }).faults).toEqual([]);
    const over = attendanceOf({ personIds: [], accountIds: [], otherNames: [x(ATTENDEE_NAME_MAX + 1), `y${x(ATTENDEE_NAME_MAX + 1)}`] });
    expect(over.faults).toEqual([{ code: "TOO_LONG", level: "block", data: { field: "attendee", limit: ATTENDEE_NAME_MAX } }]);
  });
});

describe("kickOffState: how the card reads the meeting (PW-29)", () => {
  const KL = "Asia/Kuala_Lumpur";
  // 2 November 2026, 09:30 in Kuala Lumpur (UTC+8).
  const meeting = { meetsAt: MEETS, held: false };

  it("no meeting is not scheduled; a held one is held, whatever the day", () => {
    expect(kickOffState(null, "2026-11-01", KL)).toBe("NOT_SCHEDULED");
    expect(kickOffState({ ...meeting, held: true }, "2027-01-01", KL)).toBe("HELD");
    expect(kickOffState({ ...meeting, held: true }, null, null)).toBe("HELD");
  });

  it("is upcoming before its day and ON its day (even after the hour), and 'Not recorded as held' from the next day: never upcoming once the day has passed", () => {
    expect(kickOffState(meeting, "2026-11-01", KL)).toBe("UPCOMING");
    expect(kickOffState(meeting, "2026-11-02", KL)).toBe("UPCOMING");
    expect(kickOffState(meeting, "2026-11-03", KL)).toBe("NOT_RECORDED_AS_HELD");
    expect(kickOffState(meeting, "2027-11-03", KL)).toBe("NOT_RECORDED_AS_HELD");
  });

  it("reads the meeting's day in the organisation's zone, not UTC's: 23:30 UTC on 1 November is 2 November in Kuala Lumpur", () => {
    const late = { meetsAt: new Date("2026-11-01T23:30:00.000Z"), held: false };
    expect(kickOffState(late, "2026-11-02", KL)).toBe("UPCOMING");
    expect(kickOffState(late, "2026-11-02", "UTC")).toBe("NOT_RECORDED_AS_HELD");
  });

  it("with no time zone the day is not known, so it claims neither upcoming nor passed", () => {
    expect(kickOffState(meeting, null, KL)).toBe("SCHEDULED");
    expect(kickOffState(meeting, "2027-01-01", null)).toBe("SCHEDULED");
  });

  it("every state has words and a tone; 'Not recorded as held' warns", () => {
    const all: KickOffState[] = ["NOT_SCHEDULED", "UPCOMING", "NOT_RECORDED_AS_HELD", "HELD", "SCHEDULED"];
    for (const s of all) expect(KICK_OFF_STATE_WORDS[s].length, s).toBeGreaterThan(2);
    expect(KICK_OFF_STATE_WORDS.NOT_RECORDED_AS_HELD).toBe("Not recorded as held");
    expect(KICK_OFF_STATE_TONE.NOT_RECORDED_AS_HELD).toBe("warn");
    // No code in the words.
    for (const s of all) expect(KICK_OFF_STATE_WORDS[s]).not.toMatch(/[A-Z]{2,}_/);
  });
});

describe("words", () => {
  it("every kick-off fault has words, with no code in them; another code is left to the caller", () => {
    const all: KickOffFault[] = ["NO_AUTHORITY", "ALREADY_SCHEDULED", "HELD", "NOT_SCHEDULED", "WHEN_REQUIRED", "PLACE_OR_LINK_REQUIRED", "AGENDA_REQUIRED", "TOO_LONG", "NO_MINUTES", "NO_ATTENDANCE", "HELD_IN_FUTURE"];
    for (const code of all) {
      const t = kickOffFaultText({ code, level: "block", data: code === "TOO_LONG" ? { field: "agenda", limit: AGENDA_MAX } : undefined });
      expect(t, code).toBeTruthy();
      expect(t, code).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    }
    expect(kickOffFaultText({ code: "TOO_LONG", level: "block", data: { field: "agenda", limit: 4000 } })).toBe("The agenda is longer than 4000 characters. Shorten it.");
    expect(kickOffFaultText({ code: "WHEN_REQUIRED", level: "block", data: { field: "heldOn" } })).toBe("Give the day it was held.");
    expect(kickOffFaultText({ code: "WHEN_REQUIRED", level: "block" })).toBe("Give the day and the time.");
    expect(kickOffFaultText({ code: "CLASS_NOT_SET", level: "block" })).toBeNull();
  });

  it("the briefing is never restated here: the card asks briefingMissing (src/lib/contract/sign.ts) itself (PW-18)", () => {
    const src = readFileSync(path.join(__dirname, "kick-off.ts"), "utf8");
    expect(src).not.toMatch(/isExecuted|briefingOpen|function briefing|briefingMissing\s*=/);
  });
});

/**
 * A worked example, to check by hand. Contract KOM/CON/1 is executed. Its kick-off meeting is scheduled for Monday 2 November 2026 at 09:30 in Kuala
 * Lumpur, at the site office, agenda "Introductions. Programme. Safety.".
 *
 * - On 1 and 2 November the card reads "Scheduled". On 3 November, with nothing recorded, it reads "Not recorded as held" (the day has passed).
 * - On 3 November the S.O. records it held on 2 November. Attending: the S.O., the S.O. again by mistake (one row), the contractor's site agent's account,
 *   and "Consultant's engineer" (typed twice, differently spaced: one row). That is 3 attendees, and one file of minutes: accepted.
 * - Typing 4 November as the held day on 3 November is refused: it cannot be after today.
 */
describe("worked example: KOM/CON/1's kick-off meeting", () => {
  it("reads, then records, as a contract officer would check by hand", () => {
    const tz = "Asia/Kuala_Lumpur";
    const m = { meetsAt: new Date("2026-11-02T01:30:00.000Z"), held: false };
    expect([kickOffState(m, "2026-11-01", tz), kickOffState(m, "2026-11-02", tz), kickOffState(m, "2026-11-03", tz)].map((s) => KICK_OFF_STATE_WORDS[s])).toEqual(["Scheduled", "Scheduled", "Not recorded as held"]);
    const who = attendanceOf({ personIds: ["so", "so"], accountIds: ["site-agent"], otherNames: ["Consultant's engineer", "Consultant's  engineer"] });
    expect(who.rows).toHaveLength(3);
    expect(heldFaults({ authorityToday: true, scheduled: true, held: false, heldOn: "2026-11-02", today: "2026-11-03", attendees: who.rows.length, minutesFiles: 1 })).toEqual([]);
    expect(kickOffState({ ...m, held: true }, "2026-11-03", tz)).toBe("HELD");
    expect(codes(heldFaults({ authorityToday: true, scheduled: true, held: false, heldOn: "2026-11-04", today: "2026-11-03", attendees: 3, minutesFiles: 1 }))).toEqual(["HELD_IN_FUTURE"]);
  });
});

describe("PW-34: the organisation's attendees are the people on its side today, exactly as the form offers them", () => {
  it("returns each ticked person not on the side, once; nobody off the side, nothing", () => {
    const side = ["so", "acting", "rep"];
    expect(offSideAttendees(["so", "rep"], side)).toEqual([]);
    expect(offSideAttendees([], side)).toEqual([]);
    expect(offSideAttendees(["so", "finance", "finance", "procurement"], side)).toEqual(["finance", "procurement"]);
    // With nobody on the side (no S.O. resolved, no representative in force), nobody may be ticked for the organisation: type them as other names.
    expect(offSideAttendees(["so"], [])).toEqual(["so"]);
  });
});
