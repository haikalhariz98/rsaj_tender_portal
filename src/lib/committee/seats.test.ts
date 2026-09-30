import { describe, expect, it } from "vitest";

import { seatsInForce } from "./seats";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const seat = (id: string, from: string, to: string | null = null) => ({
  id,
  effectiveFrom: d(from),
  effectiveTo: to ? d(to) : null,
});

describe("seats in force", () => {
  const members = [
    seat("standing", "2025-01-01"),
    seat("vacated", "2025-01-01", "2026-03-01"),
    seat("future", "2026-12-01"),
    seat("ending", "2025-01-01", "2026-12-31"),
  ];

  it("counts a seat with a future end date as current", () => {
    expect(seatsInForce(members, d("2026-06-15")).map((s) => s.id)).toEqual(["standing", "ending"]);
  });

  it("judges a past sitting by the seats of its own day", () => {
    expect(seatsInForce(members, d("2026-02-01")).map((s) => s.id)).toEqual([
      "standing",
      "vacated",
      "ending",
    ]);
  });

  it("does not seat anyone before their seat begins", () => {
    expect(seatsInForce(members, d("2026-11-30")).map((s) => s.id)).not.toContain("future");
  });
});
