import { describe, expect, it } from "vitest";

import { issueFault, predecessorOf, startOfDay } from "./issue";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = new Date("2026-09-30T10:15:00.000Z");

const current = { id: "rev1", effectiveFrom: d("2024-01-01"), effectiveTo: null };

describe("issuing a draft", () => {
  it("may start today or later", () => {
    expect(issueFault(d("2026-09-30"), today, [current])).toBeNull();
    expect(issueFault(d("2026-11-01"), today, [current])).toBeNull();
  });

  it("is never back-dated — that would change rules past decisions ran under", () => {
    expect(issueFault(d("2026-09-29"), today, [current])).toBe("IN_THE_PAST");
  });

  it("cannot slot in before an issue already issued to start later", () => {
    const later = { id: "rev2", effectiveFrom: d("2027-01-01"), effectiveTo: null };
    expect(issueFault(d("2026-12-01"), today, [current, later])).toBe("NOT_AFTER_LATEST");
  });

  it("replaces the issue in force on its first day", () => {
    expect(predecessorOf([current], d("2026-10-01"))?.id).toBe("rev1");
    expect(predecessorOf([], d("2026-10-01"))).toBeNull();
  });

  it("works in whole days", () => {
    expect(startOfDay(today).toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
});
