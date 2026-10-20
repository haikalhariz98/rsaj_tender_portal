import { describe, expect, it } from "vitest";

import { currentSchedules, isPublicSchedule, type ScheduleRow } from "./schedule";

/**
 * Go-live R4a: the public is given the schedule of tenders only while it is live, not withdrawn, not a threat and still Public. Each is asked again at every read,
 * so a classification raised after publication, or a version withdrawn, stops the download and the "Published" line at once.
 */

const row = (o: Partial<ScheduleRow> & { classification?: ScheduleRow["version"]["document"]["classificationSnapshot"]; withdrawnAt?: Date | null; scanState?: ScheduleRow["version"]["scanState"] } = {}): ScheduleRow => ({
  exerciseId: o.exerciseId ?? "sx1",
  attachedAt: o.attachedAt ?? new Date("2026-10-06T02:00:00Z"),
  detachedAt: o.detachedAt ?? null,
  version: {
    id: "v1",
    sha256: "a".repeat(64),
    mediaType: "application/pdf",
    originalFilename: "Jadual.pdf",
    scanState: o.scanState ?? "NOT_SCANNED",
    withdrawnAt: o.withdrawnAt ?? null,
    document: { classificationSnapshot: o.classification === undefined ? "PUBLIC" : o.classification },
  },
});

describe("isPublicSchedule", () => {
  it("is public while live, not withdrawn, not a threat and Public", () => {
    expect(isPublicSchedule(row())).toBe(true);
    expect(isPublicSchedule(row({ scanState: "CLEAN" }))).toBe(true);
  });
  it("is not once taken off", () => {
    expect(isPublicSchedule(row({ detachedAt: new Date("2026-10-07T00:00:00Z") }))).toBe(false);
  });
  it("is not once its version is withdrawn", () => {
    expect(isPublicSchedule(row({ withdrawnAt: new Date("2026-10-07T00:00:00Z") }))).toBe(false);
  });
  it("is not where it is flagged as a threat", () => {
    expect(isPublicSchedule(row({ scanState: "THREAT" }))).toBe(false);
  });
  it("is not once its document is held at Internal or SULIT (a classification can be raised after publication), or has none", () => {
    for (const classification of ["INTERNAL", "SULIT", null] as const) expect(isPublicSchedule(row({ classification })), String(classification)).toBe(false);
  });
});

describe("currentSchedules", () => {
  it("gives each exercise its latest attached schedule that the public may have", () => {
    const old = row({ attachedAt: new Date("2026-10-01T00:00:00Z") });
    const latest = row({ attachedAt: new Date("2026-10-05T00:00:00Z") });
    const other = row({ exerciseId: "sx2" });
    const got = currentSchedules([old, latest, other]);
    expect(got.get("sx1")).toBe(latest);
    expect(got.get("sx2")).toBe(other);
  });
  it("skips one the public may not have, so an exercise with only such a one has none", () => {
    const got = currentSchedules([row({ classification: "INTERNAL" }), row({ exerciseId: "sx2", scanState: "THREAT" }), row({ exerciseId: "sx3", detachedAt: new Date() })]);
    expect(got.size).toBe(0);
  });
  it("falls back to an earlier one that qualifies where the later one does not", () => {
    const earlier = row({ attachedAt: new Date("2026-10-01T00:00:00Z") });
    const later = row({ attachedAt: new Date("2026-10-05T00:00:00Z"), classification: "SULIT" });
    expect(currentSchedules([earlier, later]).get("sx1")).toBe(earlier);
  });
  it("is empty for no rows", () => {
    expect(currentSchedules([]).size).toBe(0);
  });
});
