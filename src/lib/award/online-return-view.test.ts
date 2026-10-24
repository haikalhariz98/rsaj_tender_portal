import { describe, expect, it } from "vitest";

import { canAnswer, cancelWaitingNote, NOBODY_TOLD, nobodyToldLine, onlineReturnCardFacts } from "./online-return-view";

const at = (d: string) => new Date(`${d}T09:00:00Z`);
const row = (id: string, submitted: string, o: { verified?: string; refused?: string } = {}) => ({ id, submittedAt: at(submitted), verifiedAt: o.verified ? at(o.verified) : null, refusedAt: o.refused ? at(o.refused) : null });
const ask = (rows: ReturnType<typeof row>[], awardStatus = "ISSUED", sulitWithheldWords: string | null = null) => onlineReturnCardFacts(rows, { awardStatus, sulitWithheldWords });

describe("the Sent online card's facts", () => {
  it("draws nothing for an award with no return sent online", () => {
    expect(ask([])).toBeNull();
  });

  it("a waiting return on an issued award: Verify and Refuse are offered", () => {
    expect(ask([row("r1", "2026-10-20")])).toEqual({ state: "WAITING", latest: "r1", verify: { offered: true, blocker: null }, refuse: true });
  });

  it("Verify is drawn blocked, with the SULIT words, for a reader the identity card number is withheld from", () => {
    expect(ask([row("r1", "2026-10-20")], "ISSUED", "Withheld from you.")?.verify).toEqual({ offered: true, blocker: "Withheld from you." });
  });

  it("Verify is blocked on an award that is no longer issued, but Refuse stays (a waiting row is never left stuck)", () => {
    const f = ask([row("r1", "2026-10-20")], "CANCELLED")!;
    expect(f.verify).toEqual({ offered: true, blocker: "Only an issued award's return is verified." });
    expect(f.refuse).toBe(true);
  });

  it("a verified or refused latest return offers neither Verify nor Refuse", () => {
    for (const o of [{ verified: "2026-10-21" }, { refused: "2026-10-21" }]) {
      const f = ask([row("r1", "2026-10-20", o)])!;
      expect(f.verify).toEqual({ offered: false, blocker: null });
      expect(f.refuse).toBe(false);
    }
  });

  it("the latest row decides: a refused one followed by a new one that waits", () => {
    expect(ask([row("old", "2026-10-10", { refused: "2026-10-11" }), row("new", "2026-10-15")])).toMatchObject({ state: "WAITING", latest: "new" });
  });
});

describe("the nobody-told line (AC-42, WV-8)", () => {
  it("says it when no recipient resolved, and nothing otherwise", () => {
    expect(nobodyToldLine({ recipientIds: [] })).toBe(NOBODY_TOLD);
    expect(NOBODY_TOLD).toBe("No notification rule names who is told.");
    expect(nobodyToldLine({ recipientIds: ["p1"] })).toBeNull();
  });
});

describe("questions and the cancel note", () => {
  it("a question is answered once", () => {
    expect(canAnswer({ answeredAt: null })).toBe(true);
    expect(canAnswer({ answeredAt: at("2026-10-20") })).toBe(false);
  });

  it("the cancel note names the day the return was sent", () => {
    expect(cancelWaitingNote("20 Oct 2026")).toContain("on 20 Oct 2026");
  });
});
