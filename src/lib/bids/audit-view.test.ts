import { describe, expect, it } from "vitest";

import { boxFields, envelopeFields } from "./audit-view";
import { CLOSING, S, TZ } from "./fixture";

describe("the register's trail, in words", () => {
  it("a receipt is written to the second, so a late one reads late (14:30:01, not 14:30)", () => {
    const f = envelopeFields({ sequence: 6, kind: "BID", channel: "COUNTER", receivedAt: new Date(CLOSING.getTime() + S), receivedSource: "SERVER", statedReceivedAt: null, entryReason: "", markings: "M", receivedBy: "A", late: true, closingAtJudged: CLOSING, parentSequence: null }, TZ);
    expect(f.received).toBe("17 Nov 2026 · 14:30:01");
    expect(f.timeliness).toBe("Late");
    expect(f.stamp).toBe("Server-stamped");
    expect(boxFields({ at: CLOSING, by: "B", note: "" }, TZ).boxLocked).toBe("17 Nov 2026 · 14:30:00");
  });
  it("never a code: kinds and channels by their labels", () => {
    const f = envelopeFields({ sequence: 1, kind: "ALTERNATIVE", channel: "POST", receivedAt: CLOSING, receivedSource: "ENTERED", statedReceivedAt: CLOSING, entryReason: "late post", markings: "M", receivedBy: "A", late: false, closingAtJudged: CLOSING, parentSequence: 2 }, TZ);
    expect([f.kind, f.channel, f.stamp, f.alternativeTo]).toEqual(["Alternative bid", "By post", "Entered, not server-stamped", "Envelope 2"]);
  });
});
