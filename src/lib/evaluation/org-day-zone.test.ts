import { describe, expect, it } from "vitest";

import { dayOf } from "@/lib/dates";

import { openMeetingFaults } from "./meetings";
import { renderFaults } from "./proposal";

/**
 * Phase 2 close-out, 68-C5 grep: the evaluation's instants (when it started, when its report was
 * issued) are read with dayOf, so with no zone set there is no day — refused in the time-zone-not-set
 * wording, never judged or printed on UTC's day. The Kertas Cadangan prints the report's issued day
 * into frozen text, so producing it with no zone (a zone cleared after the report issued) is refused.
 */

const KL = "Asia/Kuala_Lumpur";
const started = new Date("2026-10-01T23:30:00Z"); // 07:30 on 2 October in Kuala Lumpur
const meeting = { kind: "CLARIFICATION" as const, bidderEligible: true, route: null, openAlready: false, heldOn: "2026-10-01", today: "2026-10-02", place: "Room 3", personActive: true };
const paper = { rendered: false, checkerRoleCode: "C", recommenderRoleCode: "R", template: { state: "OK" as const, missing: [], unknown: [] }, personActive: true };

describe("the evaluation's days with and without a zone (68-C5)", () => {
  it("a meeting is judged against the local day the evaluation started", () => {
    expect(openMeetingFaults({ ...meeting, startedOn: dayOf(started, KL) }).map((f) => f.code)).toEqual(["HELD_BEFORE_EVALUATION"]);
    expect(openMeetingFaults({ ...meeting, heldOn: "2026-10-02", startedOn: dayOf(started, KL) })).toEqual([]);
  });

  it("with no zone the start has no day: refused as time zone not set, and nothing judged on UTC's day", () => {
    expect(openMeetingFaults({ ...meeting, today: null, startedOn: dayOf(started, null) }).map((f) => f.code)).toEqual(["TIME_ZONE_NOT_SET"]);
    expect(openMeetingFaults({ ...meeting, startedOn: null }).map((f) => f.code)).toEqual(["TIME_ZONE_NOT_SET"]);
  });

  it("the Kertas Cadangan is refused with no zone, since it prints the report's issued day", () => {
    expect(renderFaults({ ...paper, reportIssuedOn: dayOf(started, null) }).map((f) => f.code)).toEqual(["TIME_ZONE_NOT_SET"]);
    expect(renderFaults({ ...paper, reportIssuedOn: dayOf(started, KL) })).toEqual([]);
    expect(renderFaults({ ...paper, rendered: true, reportIssuedOn: null }).map((f) => f.code)).toEqual(["ALREADY_RENDERED"]);
  });
});
