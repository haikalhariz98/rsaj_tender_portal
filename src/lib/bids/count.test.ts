import { describe, expect, it } from "vitest";

import { bidCount, competition } from "./count";
import { envelope } from "./fixture";

describe("counting bids (FR-BID-011)", () => {
  it("the estimate and withdrawn envelopes are excluded; late counted apart; alternatives apart", () => {
    const c = bidCount([envelope(), envelope(), envelope({ late: true }), envelope({ kind: "COMPANY_ESTIMATE" }), envelope({ status: "WITHDRAWN" }), envelope({ kind: "ALTERNATIVE" })]);
    expect(c).toEqual({ inTime: 2, late: 1, alternatives: 1, withdrawn: 1 });
  });
  it("one bid: SINGLE, and it proceeds (never blocking)", () => expect(competition(1, 3)).toBe("SINGLE"));
  it("minimum 3 with 2: BELOW_MINIMUM; with 3: MET", () => {
    expect(competition(2, 3)).toBe("BELOW_MINIMUM");
    expect(competition(3, 3)).toBe("MET");
  });
  it("minimum not set: MINIMUM_NOT_SET, never MET", () => {
    expect(competition(5, null)).toBe("MINIMUM_NOT_SET");
    expect(competition(1, null)).toBe("MINIMUM_NOT_SET");
  });
});
