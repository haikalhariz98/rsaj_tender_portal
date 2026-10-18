import { describe, expect, it } from "vitest";

import { w } from "@/lib/contract/labels";

import { BlankWordsError, enOnly, hasMalay, MissingPlaceholderError, say, sayWith } from "./say";

describe("say", () => {
  const pair = w("Contracts", "Kontrak");

  it("renders the language asked for", () => {
    expect(say(pair, "en")).toBe("Contracts");
    expect(say(pair, "ms")).toBe("Kontrak");
  });

  it("falls back to English when the Malay is blank or whitespace", () => {
    expect(say(w("Contracts", ""), "ms")).toBe("Contracts");
    expect(say(w("Contracts", "   "), "ms")).toBe("Contracts");
    expect(say(w("Contracts", "\t\n"), "ms")).toBe("Contracts");
  });

  it("never returns an empty string: a pair with no English is refused by name", () => {
    for (const bad of [w("", ""), w("", "Kontrak"), w("  ", "Kontrak")]) {
      for (const lang of ["en", "ms"] as const) {
        expect(() => say(bad, lang)).toThrow(BlankWordsError);
      }
    }
    try {
      say(w("", "Kontrak"), "ms");
    } catch (e) {
      expect((e as BlankWordsError).rule).toBe("WORDS_ENGLISH_REQUIRED");
      expect((e as Error).message).toMatch(/no English/);
    }
  });

  it("returns a non-empty string for every pair with English, in both languages", () => {
    const pairs = [w("A", ""), w("A", " "), w("A", "B"), w(" A ", "")];
    for (const p of pairs) for (const lang of ["en", "ms"] as const) expect(say(p, lang).trim()).not.toBe("");
  });
});

describe("enOnly and hasMalay", () => {
  it("enOnly is the explicit no-Malay pair, rendering English in both", () => {
    const p = enOnly("Close");
    expect(p).toEqual({ en: "Close", ms: "" });
    expect(hasMalay(p)).toBe(false);
    expect(say(p, "ms")).toBe("Close");
  });

  it("enOnly refuses a blank English", () => {
    expect(() => enOnly("")).toThrow(BlankWordsError);
    expect(() => enOnly("  ")).toThrow(BlankWordsError);
  });

  it("hasMalay is false for blank or whitespace, true otherwise", () => {
    expect(hasMalay(w("A", ""))).toBe(false);
    expect(hasMalay(w("A", "  "))).toBe(false);
    expect(hasMalay(w("A", "B"))).toBe(true);
  });
});

describe("sayWith", () => {
  const sentence = w("{count} notices for {name}", "{count} notis untuk {name}");

  it("substitutes every placeholder, in the language asked for", () => {
    expect(sayWith(sentence, "en", { count: "3", name: "Aminah" })).toBe("3 notices for Aminah");
    expect(sayWith(sentence, "ms", { count: "3", name: "Aminah" })).toBe("3 notis untuk Aminah");
  });

  it("falls back to the English template when the Malay is blank", () => {
    expect(sayWith(w("Hello {name}", " "), "ms", { name: "Aminah" })).toBe("Hello Aminah");
  });

  it("substitutes in one pass: a value holding a placeholder is not read as one", () => {
    expect(sayWith(w("{a} and {b}", ""), "en", { a: "{b}", b: "x" })).toBe("{b} and x");
  });

  it("ignores values the template does not name", () => {
    expect(sayWith(w("Hello {name}", ""), "en", { name: "A", extra: "B" })).toBe("Hello A");
  });

  it("throws on a missing value, naming the placeholder", () => {
    expect(() => sayWith(sentence, "en", { count: "3" })).toThrow(MissingPlaceholderError);
    expect(() => sayWith(sentence, "ms", { count: "3" })).toThrow(/\{name\}/);
  });

  it("does not take a value from the object's prototype", () => {
    expect(() => sayWith(w("{toString}", ""), "en", {})).toThrow(MissingPlaceholderError);
  });
});
