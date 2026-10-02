import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dayIn, storedDay } from "@/lib/dates";

import { openMeetingFaults } from "./meetings";

/**
 * 6.8 fix R-4 (the time-zone rules): an instant's day is the organisation's day, never its UTC day.
 * The recommendation's "formed on", the Kertas Cadangan's "issued on" and the day the evaluation
 * started (which a meeting may not be held before) are read with `dayIn(instant, timeZone)`.
 */

const KL = "Asia/Kuala_Lumpur";
// Started at 07:30 on 2 October in Kuala Lumpur: 23:30 UTC on 1 October.
const started = new Date("2026-10-01T23:30:00Z");

describe("an instant's day is the organisation's (R-4)", () => {
  it("23:30 UTC on 1 October is 2 October in Kuala Lumpur", () => {
    expect(storedDay(started)).toBe("2026-10-01");
    expect(dayIn(started, KL)).toBe("2026-10-02");
  });
  it("a meeting held on 1 October is before an evaluation started on 2 October, KL time; by UTC it was let through", () => {
    const base = { kind: "CLARIFICATION" as const, bidderEligible: true, route: null, openAlready: false, heldOn: "2026-10-01", today: "2026-10-02", place: "Room 3", personActive: true };
    expect(openMeetingFaults({ ...base, startedOn: dayIn(started, KL) }).map((f) => f.code)).toEqual(["HELD_BEFORE_EVALUATION"]);
    expect(openMeetingFaults({ ...base, startedOn: storedDay(started) })).toEqual([]);
  });
  it("the acts read these three days with dayOf (the organisation's day, no UTC fallback), never storedDay or dayIn (source scan)", () => {
    // Phase 2 close-out 68-C5 (stricter than R-4's dayIn, which fell back to UTC with no zone).
    const report = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/report-actions.ts"), "utf8");
    expect(report).toMatch(/formedOn: formatDate\(dayOf\(rec\.formedAt, l\.org\.timeZone\)\)/);
    expect(report).toMatch(/const issuedOn = dayOf\(e!\.issuedAt!, l\.org\.timeZone\);/);
    expect(report).toMatch(/issuedOn: formatDate\(issuedOn\),/);
    expect(report).toMatch(/reportIssuedOn: issuedOn \}\);/);
    expect(report).not.toMatch(/storedDay\(rec\.formedAt\)|storedDay\(e!\.issuedAt|dayIn\(rec\.formedAt|dayIn\(e!\.issuedAt/);
    const meeting = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/meeting-actions.ts"), "utf8");
    expect(meeting).toMatch(/startedOn: dayOf\(e!\.startedAt, l\.org\.timeZone\)/);
    expect(meeting).not.toMatch(/storedDay\(e!\.startedAt\)|dayIn\(e!\.startedAt/);
  });
});
