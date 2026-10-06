import { describe, expect, it } from "vitest";

import { blocksRecording, flagWords, portalFlags } from "./queue";

const holder = { reference: "DEMO/SUP/001/2026", name: "Sampel Works Sdn Bhd", status: "REGISTERED" as const };

describe("what an officer is told about an online application's number", () => {
  it("says nothing of a number nobody holds and nobody else sent", () => {
    expect(portalFlags({ holder: null, othersWaiting: 0 })).toEqual([]);
    expect(blocksRecording([])).toBe(false);
  });

  it("names the supplier that holds the number, to the officer, and stops recording", () => {
    const flags = portalFlags({ holder, othersWaiting: 0 });
    expect(flags).toEqual([{ code: "NUMBER_ON_REGISTER", holder }]);
    const w = flagWords(flags[0]);
    expect(w.tone).toBe("err");
    expect(w.text).toContain("Sampel Works Sdn Bhd");
    expect(w.text).toContain("DEMO/SUP/001/2026");
    expect(blocksRecording(flags)).toBe(true);
  });

  it("says a number sent by others too, as a warning that does not stop recording", () => {
    const flags = portalFlags({ holder: null, othersWaiting: 2 });
    expect(flags).toEqual([{ code: "NUMBER_SENT_AGAIN", others: 2 }]);
    expect(flagWords(flags[0])).toMatchObject({ tone: "warn", text: expect.stringContaining("2 other online applications") });
    expect(flagWords({ code: "NUMBER_SENT_AGAIN", others: 1 }).text).toContain("1 other online application is");
    expect(blocksRecording(flags)).toBe(false);
  });

  it("reads a rejected or blacklisted holder as the register does, never as free", () => {
    const w = flagWords({ code: "NUMBER_ON_REGISTER", holder: { ...holder, status: "REJECTED" } });
    expect(w.text).toContain("not registered: application rejected");
    expect(w.tone).toBe("err");
  });

  it("carries no code into the words", () => {
    for (const f of [...portalFlags({ holder, othersWaiting: 3 })]) expect(flagWords(f).text).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
  });
});
