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
