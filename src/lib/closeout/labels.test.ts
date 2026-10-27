import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CLOSEOUT_FAULT_WORDS } from "./labels";

/** Codes never reach a screen: every code close-out's rules can give is worded. */

describe("close-out's words", () => {
  it("cover every code its rules give", () => {
    const src = readdirSync("src/lib/closeout")
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "labels.ts")
      .map((f) => readFileSync(`src/lib/closeout/${f}`, "utf8"))
      .join("\n");
    const codes = new Set([...src.matchAll(/code: "([A-Z][A-Z_]{3,})"/g), ...src.matchAll(/\bf\("([A-Z][A-Z_]{3,})"/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(30);
    expect([...codes].filter((c) => !CLOSEOUT_FAULT_WORDS[c])).toEqual([]);
  });
});

// F10: the schedule's and the CMGD's refusal is given the period's exclusive end; the words say it can be raised from that day.
describe("DLP_NOT_ENDED", () => {
  it("names the first day it can be raised, not a day late", async () => {
    const { scheduleRaiseFaults } = await import("./schedule");
    const f = scheduleRaiseFaults({ cpcIssued: true, dlp: { applies: true, start: "2025-10-01", endExclusive: "2026-10-01" }, today: "2026-09-30", open: 1, live: null, rectifyBy: "2026-12-30", limit: null }).find((x) => x.code === "DLP_NOT_ENDED")!;
    expect(CLOSEOUT_FAULT_WORDS.DLP_NOT_ENDED(f.data ?? {})).toBe("The defects liability period has not ended. This can be raised from 01 Oct 2026.");
  });
});
