import { describe, expect, it } from "vitest";

import { alternativeStatus } from "./alternatives";

describe("alternative bids (FR-BID-006)", () => {
  it("permitted: considered; not permitted: recorded, not considered; null: not stated", () => {
    expect(alternativeStatus(true)).toBe("CONSIDERED");
    expect(alternativeStatus(false)).toBe("NOT_CONSIDERED");
    expect(alternativeStatus(null)).toBe("NOT_STATED");
  });
});
