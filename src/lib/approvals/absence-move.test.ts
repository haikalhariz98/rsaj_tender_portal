import { describe, expect, it } from "vitest";

import type { ReportingLine } from "@/lib/people/reporting-lines";

import { absenceVerdict, reportWords, stayText } from "./absence-move";

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const L = (id: string, personId: string, superiorPersonId: string | null): ReportingLine => ({ id, personId, superiorPersonId, effectiveFrom: day("2026-01-01"), effectiveTo: null });
const ON = day("2026-10-01");

describe("when an absence may move a pending step by itself (FR-APR-012, FR-APR-010)", () => {
  it("moves it when every holder's line names a superior", () => {
    expect(absenceVerdict({ holderIds: ["h1"], lines: [L("1", "h1", "boss")], on: ON })).toEqual({ move: true, superiorIds: ["boss"] });
    expect(absenceVerdict({ holderIds: ["h1", "h2"], lines: [L("1", "h1", "boss"), L("2", "h2", "boss")], on: ON })).toEqual({ move: true, superiorIds: ["boss"] });
  });

  it("an unset reporting line warns and does not route: the step stays put", () => {
    const v = absenceVerdict({ holderIds: ["h1"], lines: [], on: ON });
    expect(v).toMatchObject({ move: false, why: "LINES_NOT_SET" });
    expect(stayText("LINES_NOT_SET", [])).toMatch(/^Reporting line not set/);
  });

  it("does not move on a line recorded for someone else: lines recorded but not for the holder is NOT SET for them", () => {
    const v = absenceVerdict({ holderIds: ["h1", "h2"], lines: [L("1", "h1", "boss")], on: ON });
    expect(v).toEqual({ move: false, why: "LINE_NOT_SET_FOR", holderIdsWithoutLine: ["h2"] });
    expect(stayText("LINE_NOT_SET_FOR", ["Siti"])).toContain("Reporting line not set for Siti");
  });

  it("does not move a step whose holders are all recorded as having nobody above them", () => {
    expect(absenceVerdict({ holderIds: ["h1"], lines: [L("1", "h1", null)], on: ON })).toMatchObject({ move: false, why: "NO_SUPERIOR_ON_LINE" });
  });

  it("leaves a vacancy to an officer's escalation: nobody was marked absent", () => {
    expect(absenceVerdict({ holderIds: [], lines: [L("1", "h1", "boss")], on: ON })).toMatchObject({ move: false, why: "NO_HOLDER" });
  });

  it("is judged on the day given, not on today's clock", () => {
    const ended: ReportingLine = { ...L("1", "h1", "boss"), effectiveTo: day("2026-09-01") };
    expect(absenceVerdict({ holderIds: ["h1"], lines: [ended], on: ON })).toMatchObject({ move: false, why: "LINE_NOT_SET_FOR" });
    expect(absenceVerdict({ holderIds: ["h1"], lines: [ended], on: day("2026-08-01") })).toMatchObject({ move: true });
  });
});

describe("the report of a sweep", () => {
  it("names what moved and what stayed, with why", () => {
    const words = reportWords({
      moved: [{ stepId: "s1", matter: "REQ-1 · Roof", from: "Head of Department", to: "Functional Director" }],
      stayed: [{ stepId: "s2", matter: "REQ-2 · Lift", why: "Reporting line not set." }],
    });
    expect(words).toEqual(["Moved: REQ-1 · Roof from Head of Department to Functional Director.", "Stays: REQ-2 · Lift. Reporting line not set."]);
  });

  it("counts, and does not name, the steps on records restricted to those named on them", () => {
    const words = reportWords({ moved: [{ stepId: "s1", matter: null, from: "A", to: "B" }], stayed: [] });
    expect(words).toEqual(["1 more step is on records restricted to the people named on them, and is not listed here."]);
    expect(words.join(" ")).not.toContain("A to B");
  });

  it("says plainly when nothing was waiting", () => {
    expect(reportWords({ moved: [], stayed: [] })).toEqual(["No pending step was waiting on that office."]);
  });
});
