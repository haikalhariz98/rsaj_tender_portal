import { describe, expect, it } from "vitest";

import { CLOSING_SOON_DAYS, closesSoon } from "./closing-soon";

describe("closing in the next days", () => {
  const base = { today: "2026-10-01", phase: "OPEN_FOR_PURCHASE" as const };
  it("counts today and the next six days, not the seventh", () => {
    expect(closesSoon({ ...base, closingDay: "2026-10-01" })).toBe(true);
    expect(closesSoon({ ...base, closingDay: "2026-10-07" })).toBe(true);
    expect(CLOSING_SOON_DAYS).toBe(7);
    expect(closesSoon({ ...base, closingDay: "2026-10-08" })).toBe(false);
  });
  it("does not count a closing that has passed, even earlier today", () => {
    expect(closesSoon({ today: "2026-10-01", closingDay: "2026-10-01", phase: "CLOSED" })).toBe(false);
    expect(closesSoon({ ...base, closingDay: "2026-09-30" })).toBe(false);
  });
  it("does not count a cancelled or unplaceable closing", () => {
    expect(closesSoon({ today: "2026-10-01", closingDay: "2026-10-03", phase: "CANCELLED" })).toBe(false);
    expect(closesSoon({ today: null, closingDay: "2026-10-03", phase: "PUBLISHED" })).toBe(false);
    expect(closesSoon({ today: "2026-10-01", closingDay: null, phase: "PUBLISHED" })).toBe(false);
    expect(closesSoon({ today: "2026-10-01", closingDay: "2026-10-03", phase: "UNKNOWN" })).toBe(false);
  });
});
