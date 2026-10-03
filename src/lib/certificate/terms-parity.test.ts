import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

import { wholeWordPattern } from "./terms";
import { jsPatternOf, PARITY_ALIASES, parityCorpus, removedAliasesInUse, saysAlias } from "./terms.oracle";

/**
 * 614b-C2 (BD-613-93): the alias in-use check runs in the database (`wholeWordPattern`, term-use.ts); the in-memory rule
 * (`wordAt`) is kept only as its oracle. The Postgres pattern, translated to a JavaScript RegExp with only `[:alnum:]`
 * mapped to `\p{L}\p{N}`, must agree with the oracle on a generated corpus. One verify case runs the real query on the
 * same corpus in Postgres.
 */

describe("the database pattern agrees with the in-memory rule (parity, 614b-C2)", () => {
  const corpus = parityCorpus();

  it("the corpus covers what it claims: dots, accented letters, digits, a non-breaking space, the start and the end of a text", () => {
    expect(corpus.length).toBe(400);
    expect(corpus.some((t) => t.includes("S.O."))).toBe(true);
    expect(corpus.some((t) => /[éÉ]/.test(t))).toBe(true);
    expect(corpus.some((t) => /\d/.test(t))).toBe(true);
    expect(corpus.some((t) => t.includes(" "))).toBe(true);
    for (const a of PARITY_ALIASES) {
      expect(corpus.some((t) => saysAlias(t, a)), `${a} is said somewhere`).toBe(true);
      expect(corpus.some((t) => !saysAlias(t, a)), `${a} is missing somewhere`).toBe(true);
    }
    expect(corpus.every((t) => t === t.normalize("NFC"))).toBe(true);
    expect(parityCorpus()).toEqual(corpus);
  });

  it("for every alias and every text, the translated pattern finds the alias exactly where the oracle does", () => {
    const disagree: string[] = [];
    for (const alias of PARITY_ALIASES) {
      const re = jsPatternOf(wholeWordPattern(alias)!);
      for (const text of corpus) if (re.test(text) !== saysAlias(text, alias)) disagree.push(`${alias} in ${JSON.stringify(text)}`);
    }
    expect(disagree).toEqual([]);
  });

  it("the edges, by hand: inside a longer word, beside punctuation, at the start and the end, across a non-breaking space", () => {
    const both = (text: string, alias: string) => [jsPatternOf(wholeWordPattern(alias)!).test(text), saysAlias(text, alias)];
    expect(both("approved", "pp")).toEqual([false, false]);
    expect(both("(S.O.)", "S.O.")).toEqual([true, true]);
    expect(both("S.O.", "S.O.")).toEqual([true, true]);
    expect(both("XS.O.", "S.O.")).toEqual([false, false]);
    expect(both("éS.O.", "S.O.")).toEqual([false, false]);
    expect(both("Pegawai Penguasa", "Pegawai Penguasa")).toEqual([true, true]);
    expect(both("café", "CAFÉ")).toEqual([true, true]);
    expect(both("cafés", "café")).toEqual([false, false]);
    expect(both("Klausa 1.20", "Klausa 1.2")).toEqual([false, false]);
  });

  it("the oracle's own reading (fix-inc2's case, unchanged) still holds", () => {
    expect(removedAliasesInUse(["S.O.", "P.P."], [{ label: "DEMO/CERT/1", text: "The S.O. delegates." }, { label: "DEMO/CERT/2", text: "Approval." }])).toEqual([{ alias: "S.O.", certificates: ["DEMO/CERT/1"] }]);
  });
});

describe("the oracle is imported only by tests (614b-C2)", () => {
  const ROOT = path.join(__dirname, "../../..");
  const files = (dir: string): string[] =>
    readdirSync(path.join(ROOT, dir)).flatMap((f) => {
      const rel = path.join(dir, f);
      if (rel === path.normalize("src/generated")) return [];
      return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) ? [rel] : [];
    });
  it("no file in src or prisma but a test imports terms.oracle", () => {
    const importers = [...files("src"), ...files("prisma")]
      .filter((f) => !/\.test\.tsx?$/.test(f) && !f.endsWith(path.normalize("certificate/terms.oracle.ts")))
      .map((f) => ({ f, src: readFileSync(path.join(ROOT, f), "utf8") }))
      // Only a file naming it is lexed; the lexed text (comments blanked) must still name it.
      .filter(({ src }) => src.includes("terms.oracle") && /terms\.oracle/.test(lex(src, { only: "comments" })))
      .map(({ f }) => f);
    expect(importers).toEqual([]);
  });
  it("the scan would catch one (self-test)", () => {
    expect(/terms\.oracle/.test(lex('import { saysAlias } from "./terms.oracle";', { only: "comments" }))).toBe(true);
    expect(/terms\.oracle/.test(lex("// see terms.oracle.ts\nconst x = 1;", { only: "comments" }))).toBe(false);
  });
});
