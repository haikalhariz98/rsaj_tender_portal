import { describe, expect, it } from "vitest";

import { STAFF_NAV } from "@/lib/nav";

import { CONVERTED_CATALOGUES, untranslated } from "../registry";
import { COMPONENTS } from "./components";
import { SHELL } from "./shell";

// NFR-LNG-001 (ADR 0040): the frame's and the shared components' words, drafted in the N1 slice and registered unreviewed.

const names = [SHELL, COMPONENTS];
const placeholders = (s: string) => [...s.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1]).sort();

describe.each(names.map((c) => [c.name, c] as const))("the %s catalogue", (_name, catalogue) => {
  it("is drafted, not reviewed, and registered", () => {
    expect(catalogue.review).toBe("DRAFTED_NOT_REVIEWED");
    expect(CONVERTED_CATALOGUES).toContain(catalogue);
  });
  it("has Malay for every pair", () => {
    expect(untranslated([catalogue])).toEqual([]);
  });
  it("names the same values in both languages", () => {
    for (const [key, words] of Object.entries(catalogue.words)) expect(placeholders(words.ms), key).toEqual(placeholders(words.en));
  });
  it("shows no code: no underscore, and no all-capitals token", () => {
    for (const [key, words] of Object.entries(catalogue.words)) {
      for (const text of [words.en, words.ms]) expect(text, key).not.toMatch(/_|^[A-Z][A-Z0-9]+$/);
    }
  });
});

describe("the staff navigation", () => {
  it("is in the shell catalogue, every group and item, with Malay", () => {
    const wordsHeld = new Set(Object.values(SHELL.words));
    for (const g of STAFF_NAV) {
      expect(wordsHeld.has(g.label), g.label.en).toBe(true);
      for (const i of g.items) {
        expect(wordsHeld.has(i.label), i.href).toBe(true);
        expect(i.label.ms.trim(), i.href).not.toBe("");
      }
    }
  });
});
