import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { CLOSING_NOT_GIVEN, keyDatesView, NO_EVENTS_TEXT, NO_WINDOW_TEXT, START_NOT_GIVEN, type KeyDatesInput } from "./key-dates";

const base: KeyDatesInput = { tenderingStartOn: null, closing: null, proposed: { startOn: null, closingAt: null }, packs: [], noPack: false, canSchedule: true, defaultClosingTime: null, closingTimeProvenance: null, events: [], timeZone: "Asia/Kuala_Lumpur" };
// 06:30 UTC is 14:30 in Kuala Lumpur.
const closing = new Date("2026-10-15T06:30:00.000Z");

describe("Key dates on the Overview (founder, 2026-10-05)", () => {
  it("nothing given: both dates say they are proposed when the documents are submitted, not blank", () => {
    const v = keyDatesView(base);
    expect(v.start).toEqual({ state: "NOT_GIVEN", label: null, text: START_NOT_GIVEN });
    expect(v.closing).toEqual({ state: "NOT_GIVEN", label: null, text: CLOSING_NOT_GIVEN });
  });

  it("a proposal entered at submission reads as proposed, with its version, the closing on the organisation's clock", () => {
    const v = keyDatesView({ ...base, packs: [{ versionNo: 2, status: "SUBMITTED", proposedStartOn: dayToDate("2026-10-01"), proposedClosingAt: closing }] });
    expect(v.start).toEqual({ state: "PROPOSED", label: "Proposed", text: "01 Oct 2026 · version 2" });
    expect(v.closing).toEqual({ state: "PROPOSED", label: "Proposed", text: "15 Oct 2026 · 14:30 · version 2" });
  });

  it("SR-05 (ruling 8): dates proposed on Scope and estimate before submission read as proposed, with no version, and a submitted pack's frozen proposal wins over them", () => {
    const v = keyDatesView({ ...base, proposed: { startOn: dayToDate("2026-10-05"), closingAt: closing } });
    expect(v.start).toEqual({ state: "PROPOSED", label: "Proposed", text: "05 Oct 2026" });
    expect(v.closing).toEqual({ state: "PROPOSED", label: "Proposed", text: "15 Oct 2026 · 14:30" });
    const frozen = keyDatesView({ ...base, proposed: { startOn: dayToDate("2026-10-05"), closingAt: closing }, packs: [{ versionNo: 1, status: "SUBMITTED", proposedStartOn: dayToDate("2026-10-01"), proposedClosingAt: closing }] });
    expect(frozen.start.text).toBe("01 Oct 2026 · version 1");
  });

  it("the newest version that has a proposal counts; a newer draft with none does not hide it", () => {
    const v = keyDatesView({ ...base, packs: [{ versionNo: 3, status: "SUBMITTED", proposedStartOn: null, proposedClosingAt: null }, { versionNo: 2, status: "SUBMITTED", proposedStartOn: dayToDate("2026-10-01"), proposedClosingAt: closing }] });
    expect(v.start.text).toBe("01 Oct 2026 · version 2");
  });

  it("the approved dates win over any proposal", () => {
    const v = keyDatesView({ ...base, tenderingStartOn: dayToDate("2026-10-02"), closing, packs: [{ versionNo: 1, status: "SUBMITTED", proposedStartOn: dayToDate("2026-10-01"), proposedClosingAt: new Date("2026-10-14T06:30:00.000Z") }] });
    expect(v.start).toEqual({ state: "APPROVED", label: "Approved", text: "02 Oct 2026" });
    expect(v.closing).toEqual({ state: "APPROVED", label: "Approved", text: "15 Oct 2026 · 14:30" });
  });

  it("with the time zone unset the closing says its time is UTC rather than passing it off as the organisation's", () => {
    expect(keyDatesView({ ...base, timeZone: null, closing }).closing.text).toContain("UTC");
  });

  it("an organisation's closing time nobody has set is null with no provenance, never midnight", () => {
    expect(keyDatesView(base).cutoff).toEqual({ text: null, provenance: null });
    expect(keyDatesView({ ...base, defaultClosingTime: "  ", closingTimeProvenance: "ASSUMED" }).cutoff).toEqual({ text: null, provenance: null });
    expect(keyDatesView({ ...base, defaultClosingTime: "15:00", closingTimeProvenance: "ASSUMED" }).cutoff).toEqual({ text: "15:00", provenance: "ASSUMED" });
  });

  it("lists live briefings and site visits in time order, with the place and mandatory attendance where answered yes; a cancelled one is left out", () => {
    const ev = (id: string, kind: "BRIEFING" | "SITE_VISIT", at: string, extra: Partial<KeyDatesInput["events"][number]> = {}) => ({ id, kind, startsAt: new Date(at), place: "Site office", mandatory: null, cancelledAt: null, ...extra });
    const v = keyDatesView({
      ...base,
      events: [ev("b", "BRIEFING", "2026-10-08T03:00:00.000Z", { mandatory: true, place: "" }), ev("a", "SITE_VISIT", "2026-10-07T02:00:00.000Z"), ev("c", "SITE_VISIT", "2026-10-06T02:00:00.000Z", { cancelledAt: new Date("2026-10-05T00:00:00.000Z") })],
    });
    expect(v.events).toEqual([
      { id: "a", text: "Site visit · 07 Oct 2026 · 10:00 · Site office" },
      { id: "b", text: "Tender briefing · 08 Oct 2026 · 11:00 · place not recorded · attendance is mandatory" },
    ]);
    expect(keyDatesView(base).events).toEqual([]);
    expect(NO_EVENTS_TEXT).toBe("None scheduled");
  });

  it("a returned version's proposal was refused, so a draft that follows it shows no proposal", () => {
    const v = keyDatesView({ ...base, packs: [{ versionNo: 2, status: "DRAFT", proposedStartOn: null, proposedClosingAt: null }, { versionNo: 1, status: "RETURNED", proposedStartOn: dayToDate("2026-11-01"), proposedClosingAt: closing }] });
    expect(v.start.state).toBe("NOT_GIVEN");
    expect(v.closing.state).toBe("NOT_GIVEN");
  });

  it("an exercise that issues no documents has no window: dates are not applicable, with no briefing to schedule", () => {
    const v = keyDatesView({ ...base, noPack: true, canSchedule: true, events: [] });
    expect(v.start).toEqual({ state: "NOT_APPLICABLE", label: null, text: NO_WINDOW_TEXT });
    expect(v.closing.state).toBe("NOT_APPLICABLE");
    expect(v.canSchedule).toBe(false);
  });

  it("offers scheduling only where the server would allow it", () => {
    expect(keyDatesView({ ...base, canSchedule: false }).canSchedule).toBe(false);
    expect(keyDatesView(base).canSchedule).toBe(true);
  });
});
