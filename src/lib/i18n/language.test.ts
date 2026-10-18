import { describe, expect, it } from "vitest";

import { effectiveLanguage, fromStored, LANGUAGE_NAMES, LANGUAGES, parseLanguageChoice, toStored } from "./language";

describe("parseLanguageChoice", () => {
  it("accepts exactly en and ms", () => {
    expect(parseLanguageChoice("en")).toEqual({ ok: true, value: "en" });
    expect(parseLanguageChoice("ms")).toEqual({ ok: true, value: "ms" });
  });

  it("refuses anything else", () => {
    for (const raw of ["", "EN", "MS", "fr", " en", "en ", "english", null]) {
      expect(parseLanguageChoice(raw)).toEqual({ ok: false });
    }
  });

  it("refuses a file", () => {
    expect(parseLanguageChoice(new File(["en"], "en"))).toEqual({ ok: false });
  });
});

describe("effectiveLanguage", () => {
  it("reads null and undefined as English", () => {
    expect(effectiveLanguage(null)).toBe("en");
    expect(effectiveLanguage(undefined)).toBe("en");
  });

  it("keeps a choice", () => {
    expect(effectiveLanguage("ms")).toBe("ms");
    expect(effectiveLanguage("en")).toBe("en");
  });
});

describe("stored spelling", () => {
  it("round-trips every language", () => {
    for (const l of LANGUAGES) expect(fromStored(toStored(l))).toBe(l);
    expect(toStored("en")).toBe("EN");
    expect(toStored("ms")).toBe("MS");
  });

  it("keeps null as never chosen", () => {
    expect(fromStored(null)).toBeNull();
  });
});

describe("LANGUAGE_NAMES", () => {
  it("names each language in its own language", () => {
    expect(LANGUAGE_NAMES).toEqual({ en: "English", ms: "Bahasa Malaysia" });
  });
});
