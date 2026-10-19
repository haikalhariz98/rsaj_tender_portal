import { describe, expect, it } from "vitest";

import { w } from "@/lib/contract/labels";

import { BlankWordsError, MissingPlaceholderError, say, sayWith } from "./say";

// Founder, 2026-10-19: English only. The Malay-fallback, enOnly and hasMalay tests were removed with the Malay half of the pair; what
// stays is what `say` and `sayWith` still promise in English.

describe("say", () => {
  it("renders the English", () => {
    expect(say(w("Contracts"), "en")).toBe("Contracts");
  });

  it("never returns an empty string: a pair with no English is refused by name", () => {
    for (const bad of [w(""), w("  ")]) expect(() => say(bad, "en")).toThrow(BlankWordsError);
    try {
      say(w(""), "en");
    } catch (e) {
      expect((e as BlankWordsError).rule).toBe("WORDS_ENGLISH_REQUIRED");
      expect((e as Error).message).toMatch(/no English/);
    }
  });
});

describe("sayWith", () => {
  const sentence = w("{count} notices for {name}");

  it("substitutes every placeholder", () => {
    expect(sayWith(sentence, "en", { count: "3", name: "Aminah" })).toBe("3 notices for Aminah");
  });

  it("substitutes in one pass: a value holding a placeholder is not read as one", () => {
    expect(sayWith(w("{a} and {b}"), "en", { a: "{b}", b: "x" })).toBe("{b} and x");
  });

  it("ignores values the template does not name", () => {
    expect(sayWith(w("Hello {name}"), "en", { name: "A", extra: "B" })).toBe("Hello A");
  });

  it("throws on a missing value, naming the placeholder", () => {
    expect(() => sayWith(sentence, "en", { count: "3" })).toThrow(MissingPlaceholderError);
    expect(() => sayWith(sentence, "en", { count: "3" })).toThrow(/\{name\}/);
  });

  it("does not take a value from the object's prototype", () => {
    expect(() => sayWith(w("{toString}"), "en", {})).toThrow(MissingPlaceholderError);
  });
});
