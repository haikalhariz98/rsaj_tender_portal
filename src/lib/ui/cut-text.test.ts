import { describe, expect, it } from "vitest";

import { SUBTITLE_LIMIT, cutAtWord } from "./cut-text";

describe("cutAtWord", () => {
  it("leaves text at or under the limit alone", () => {
    expect(cutAtWord("Short.", 90)).toEqual({ text: "Short.", cut: false });
    const exact = "a".repeat(SUBTITLE_LIMIT);
    expect(cutAtWord(exact)).toEqual({ text: exact, cut: false });
  });

  it("cuts at the last word boundary at or before the limit", () => {
    expect(cutAtWord("one two three four", 12)).toEqual({ text: "one two", cut: true });
  });

  it("keeps a word that ends exactly on the limit", () => {
    expect(cutAtWord("one two three four", 13)).toEqual({ text: "one two three", cut: true });
  });

  it("never exceeds the limit and never splits a word", () => {
    const text = "Value band, method, contract type and basis. Sourcing runs outside the portal for now, as agreed.";
    const r = cutAtWord(text, SUBTITLE_LIMIT);
    expect(r.cut).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(SUBTITLE_LIMIT);
    expect(text.startsWith(r.text)).toBe(true);
    expect(/\s/.test(text[r.text.length])).toBe(true);
  });

  it("drops punctuation left dangling before the ellipsis", () => {
    expect(cutAtWord("alpha beta, gamma delta", 11).text).toBe("alpha beta");
  });

  it("cuts a single over-long word hard at the limit", () => {
    expect(cutAtWord("abcdefghijklmnop", 5)).toEqual({ text: "abcde", cut: true });
  });

  it("ignores leading and trailing space when measuring", () => {
    expect(cutAtWord("  hi  ", 5)).toEqual({ text: "hi", cut: false });
  });
});
