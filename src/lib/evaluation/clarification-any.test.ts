import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { meetingEligible, openMeetingFaults } from "./meetings";

/**
 * 6.8 fix R-6 (OD-10 A): a clarification is available to any bidder — excluded above the ceiling or
 * out of the running included — as often as needed; a negotiation stays with a bid in the running.
 */

const base = { route: null, openAlready: false, heldOn: "2026-10-02", startedOn: "2026-10-01", today: "2026-10-02", place: "Room 3", personActive: true };

describe("who may be met (R-6)", () => {
  it("a clarification with a bid not in the running: recorded", () => {
    expect(meetingEligible("CLARIFICATION", false)).toBe(true);
    expect(openMeetingFaults({ ...base, kind: "CLARIFICATION", bidderEligible: meetingEligible("CLARIFICATION", false) })).toEqual([]);
  });
  it("a negotiation with a bid not in the running: refused, as before", () => {
    expect(meetingEligible("NEGOTIATION", false)).toBe(false);
    expect(openMeetingFaults({ ...base, kind: "NEGOTIATION", route: { status: "APPROVED" }, bidderEligible: meetingEligible("NEGOTIATION", false) }).map((f) => f.code)).toEqual(["NOT_IN_RUNNING"]);
    expect(openMeetingFaults({ ...base, kind: "NEGOTIATION", route: { status: "APPROVED" }, bidderEligible: meetingEligible("NEGOTIATION", true) })).toEqual([]);
  });
  it("the act judges with it and the drawer offers every bidder (source scan)", () => {
    const act = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/meeting-actions.ts"), "utf8");
    expect(act).toMatch(/bidderEligible: meetingEligible\(kind, /);
    const ws = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/workspace.tsx"), "utf8");
    expect(ws).toMatch(/<OpenMeetingDrawer exerciseId=\{v\.exerciseId\} bidders=\{c\.allBidders\}/);
  });
});
