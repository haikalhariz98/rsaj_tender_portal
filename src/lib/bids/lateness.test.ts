import { describe, expect, it } from "vitest";

import { CLOSING, S } from "./fixture";
import { isLate, LATENESS_READING, toSecond } from "./lateness";

describe("lateness (FR-BID-002, 003): the server's clock against the closing, to the second", () => {
  // Worked example: closing 17 Nov 2026 14:30 in Kuala Lumpur.
  it("14:30:00 is in time; 14:30:01 is late", () => {
    expect(isLate(new Date(CLOSING.getTime()), CLOSING)).toBe(false);
    expect(isLate(new Date(CLOSING.getTime() + 1 * S), CLOSING)).toBe(true);
  });
  it("14:30:00.900 truncates to 14:30:00: in time (fractions dropped, never rounded up)", () => {
    expect(toSecond(new Date(CLOSING.getTime() + 900)).getTime()).toBe(CLOSING.getTime());
    expect(isLate(new Date(CLOSING.getTime() + 900), CLOSING)).toBe(false);
  });
  it("14:29:59 is in time", () => expect(isLate(new Date(CLOSING.getTime() - 1 * S), CLOSING)).toBe(false));
  it("takes no client input: two parameters, both instants, the reading stated as ASSUMED", () => {
    expect(isLate.length).toBe(2);
    expect(LATENESS_READING.provenance).toBe("ASSUMED");
  });
});
