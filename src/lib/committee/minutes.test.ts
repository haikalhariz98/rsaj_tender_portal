import { describe, expect, it } from "vitest";

import { GATE_MINUTES_NOTE, SIGNED_MINUTES_LABEL, signedMinutesState } from "./labels";

describe("signed minutes (FR-CTE-004, FR-REQ-012)", () => {
  it("are attached once the sitting is minuted; a minuted sitting without one shows them outstanding", () => {
    expect(signedMinutesState("MINUTED", 1)).toBe("ATTACHED");
    expect(signedMinutesState("MINUTED", 0)).toBe("OUTSTANDING");
    expect(SIGNED_MINUTES_LABEL.OUTSTANDING).toBe("Signed copy outstanding");
    expect(SIGNED_MINUTES_LABEL.ATTACHED).toBe("Signed copy attached");
  });
  it("minuting never waits on them, and a sitting not yet minuted is not shown outstanding", () => {
    expect(signedMinutesState("IN_PROGRESS", 0)).toBe("AFTER_MINUTING");
    expect(signedMinutesState("SCHEDULED", 0)).toBe("AFTER_MINUTING");
    expect(signedMinutesState("CANCELLED", 0)).toBe("CANCELLED");
  });
  it("the gate card reads the cited sitting's attachment, never 'not attached' by default", () => {
    expect(GATE_MINUTES_NOTE[signedMinutesState("MINUTED", 1)]).toBe("minutes recorded as text, signed copy attached");
    expect(GATE_MINUTES_NOTE[signedMinutesState("MINUTED", 0)]).toBe("minutes recorded as text, signed copy outstanding");
  });
});
