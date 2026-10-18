import { describe, expect, it } from "vitest";

import { w } from "@/lib/contract/labels";

import { type Catalogue, CONVERTED_CATALOGUES, forReview, untranslated } from "./registry";
import { enOnly } from "./say";

const drafted: Catalogue = { name: "fixtureA", review: "DRAFTED_NOT_REVIEWED", words: { one: w("One", "Satu"), two: enOnly("Two"), three: w("Three", "  ") } };
const carried: Catalogue = { name: "fixtureB", review: "CARRIED_NOT_REVIEWED", words: { four: w("Four", "Empat") } };

describe("untranslated", () => {
  it("lists every pair with a blank or whitespace Malay, by catalogue and key", () => {
    expect(untranslated([drafted, carried])).toEqual([
      { catalogue: "fixtureA", key: "two", en: "Two" },
      { catalogue: "fixtureA", key: "three", en: "Three" },
    ]);
  });

  it("is empty for no catalogues", () => {
    expect(untranslated([])).toEqual([]);
  });
});

describe("forReview", () => {
  it("lists every pair with its catalogue's review state", () => {
    expect(forReview([drafted, carried])).toEqual([
      { catalogue: "fixtureA", review: "DRAFTED_NOT_REVIEWED", key: "one", en: "One", ms: "Satu" },
      { catalogue: "fixtureA", review: "DRAFTED_NOT_REVIEWED", key: "two", en: "Two", ms: "" },
      { catalogue: "fixtureA", review: "DRAFTED_NOT_REVIEWED", key: "three", en: "Three", ms: "  " },
      { catalogue: "fixtureB", review: "CARRIED_NOT_REVIEWED", key: "four", en: "Four", ms: "Empat" },
    ]);
  });
});

describe("CONVERTED_CATALOGUES", () => {
  it("has unique catalogue names", () => {
    const names = CONVERTED_CATALOGUES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has no pair without Malay so far (step 4 pins the full list)", () => {
    expect(untranslated(CONVERTED_CATALOGUES)).toEqual([]);
  });

  it("registers the drafted dates and coverage notices, unreviewed", () => {
    expect(CONVERTED_CATALOGUES.map((c) => [c.name, c.review])).toEqual(
      expect.arrayContaining([
        ["dates", "DRAFTED_NOT_REVIEWED"],
        ["coverage", "DRAFTED_NOT_REVIEWED"],
      ]),
    );
  });
});
