import { describe, expect, it } from "vitest";

import { DECIDER_FAULT_TEXT } from "@/lib/requisition/labels";

import { certificateDeciderText } from "./route-words";

describe("a certificate route's decider refusals, in the certificate's words", () => {
  it("the sender, the ceiling and the day sent name the certificate, never a requisition", () => {
    expect(certificateDeciderText("SELF_APPROVAL", "Eng Siew Mei")).toBe("Eng Siew Mei sent this certificate for approval. Nobody decides what they sent.");
    expect(certificateDeciderText("OVER_CEILING", "Eng Siew Mei")).toBe("The value this certificate is routed on is above the ceiling of the delegation Eng Siew Mei acts under.");
    expect(certificateDeciderText("BEFORE_SUBMISSION", null)).toBe("A decision cannot be dated before the certificate was sent for approval.");
    for (const f of ["SELF_APPROVAL", "OVER_CEILING", "BEFORE_SUBMISSION"] as const) expect(certificateDeciderText(f, "X")).not.toMatch(/requisition/i);
  });
  it("the rest are the engine's own", () => {
    expect(certificateDeciderText("OUT_OF_ORDER", null)).toBe(DECIDER_FAULT_TEXT.OUT_OF_ORDER);
    expect(certificateDeciderText("INACTIVE", "Eng Siew Mei")).toBe("Eng Siew Mei is recorded as having left.");
  });
});
