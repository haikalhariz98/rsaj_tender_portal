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

describe("a withdrawal letter's quote in the trail (6.6 CR-4)", () => {
  it("is written under its own key, letterQuote, never markings", async () => {
    const { withdrawalFields } = await import("./audit-view");
    const f = withdrawalFields({ receivedAt: CLOSING, markings: "Tender T/1, the envelope marked 'Original'", receivedBy: "A", envelopeSequence: 2 }, TZ) as Record<string, unknown>;
    expect(f.letterQuote).toBe("Tender T/1, the envelope marked 'Original'");
    expect("markings" in f).toBe(false);
  });
  it("letterQuote is a registered SULIT field, so History chips it; markings (shared with envelope corrections) is not", async () => {
    const { isSulitField } = await import("@/lib/sulit-fields");
    expect(isSulitField("letterQuote")).toBe(true);
    expect(isSulitField("markings")).toBe(false);
  });
  it("History reads it with a label, not its key, and the exercise's History lists the withdrawal's entries", async () => {
    const { fieldLabel } = await import("@/lib/audit/diff");
    expect(fieldLabel("letterQuote")).toBe("How the letter identifies the envelope");
    const { BID_ENTITIES, BID_ENTITY } = await import("./audit-view");
    expect(BID_ENTITIES).toContain(BID_ENTITY.withdrawal);
  });
  it("the drawer steers away from naming the bidder, and the card's SULIT label covers the quote", async () => {
    const { WITHDRAWAL_QUOTE_HINT, WITHDRAWAL_SULIT_LABEL } = await import("./labels");
    expect(WITHDRAWAL_QUOTE_HINT).toBe("Quote how the letter identifies the envelope (the tender's title, number and markings). Leave the company's name out; bidders are named at the opening.");
    expect(WITHDRAWAL_SULIT_LABEL).toMatch(/SULIT.*letter.*quote/);
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/app/sourcing/[id]/bids/editors.tsx", "utf8")).toMatch(/hint: WITHDRAWAL_QUOTE_HINT/);
    expect(readFileSync("src/app/sourcing/[id]/bids/workspace.tsx", "utf8")).toMatch(/\{WITHDRAWAL_SULIT_LABEL\}/);
  });
});
