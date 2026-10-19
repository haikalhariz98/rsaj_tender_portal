import { describe, expect, it } from "vitest";

import * as labels from "./labels";
import type { Words } from "./labels";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/// Every Words value the module exports, walked, so a new string is checked for codes.
function wordsIn(value: unknown, path: string): [string, Words][] {
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.en === "string") return [[path, o as unknown as Words]];
    return Object.entries(o).flatMap(([k, v]) => wordsIn(v, `${path}.${k}`));
  }
  return [];
}

const all = Object.entries(labels).flatMap(([k, v]) => wordsIn(v, k));
const CODE = /\b[A-Z]{2,}_[A-Z_]+\b/;

describe("the portal's words: English, no codes (AGENTS.md rule 5)", () => {
  it("finds the portal's words", () => {
    expect(all.length).toBeGreaterThan(20);
  });
  it.each(all)("%s has English, and no code", (_p, words) => {
    expect(words.en.trim()).not.toBe("");
    expect(CODE.test(words.en)).toBe(false);
  });
  it("the sentence helper carries the organisation", () => {
    const s = labels.homeSubtitle("Demo Utilities");
    expect(s.en).toContain("Demo Utilities");
  });
  it("every portal route is under /supplier", () => {
    for (const href of Object.values(labels.PORTAL_PATH)) expect(href.startsWith("/supplier")).toBe(true);
  });
});
