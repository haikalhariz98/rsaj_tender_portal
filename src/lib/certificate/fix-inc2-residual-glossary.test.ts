import { describe, expect, it } from "vitest";

import { aliasesInUseText, aliasesKeeping, removedAliases, termSaveFaults, wholeWordPattern, wordAt } from "./terms";

/**
 * 6.14 increment 2, residual round. S-2: promoting an alias to a term's wording; the glossary save's reason capped.
 * Consider: an alias still in issued text found in the database by whole words, only the numbers read, capped.
 * Every wording here is invented (fixture only).
 */
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("S-2: promoting an alias to the term's wording", () => {
  const before = { code: "so", canonicalEn: "Superintending Officer", canonicalMs: "Pegawai Penguasa", aliases: ["S.O.", "SO"] };

  it("the alias that became canonical leaves the aliases (no TERM_ALIAS_IS_CANONICAL); the old wording is kept as an alias", () => {
    // The form still lists "S.O." among the aliases as it was loaded.
    const edited = { ...before, canonicalEn: "S.O." };
    const kept = aliasesKeeping(before, edited);
    expect(kept).toEqual(["SO", "Superintending Officer"]);
    expect(termSaveFaults({ ...edited, aliases: kept }, [])).toEqual([]);
    // Letter case and spacing do not matter to "the same wording".
    expect(aliasesKeeping(before, { ...before, canonicalEn: " s.o. " })).toEqual(["SO", "Superintending Officer"]);
  });

  it("an alias equal to a wording that was already canonical is still refused (a typing slip, not a promotion)", () => {
    const edited = { ...before, aliases: ["S.O.", "Superintending Officer"] };
    const kept = aliasesKeeping(before, edited);
    expect(kept).toEqual(["S.O.", "Superintending Officer"]);
    expect(codes(termSaveFaults({ ...edited, aliases: kept }, []))).toEqual(["TERM_ALIAS_IS_CANONICAL"]);
    // A new term has nothing promoted: the same slip is refused.
    expect(aliasesKeeping(null, { ...before, aliases: ["Superintending Officer"] })).toEqual(["Superintending Officer"]);
  });

  it("a wording that stays canonical on the term is not in `removed`, so it never asks for a reason", () => {
    const edited = { ...before, canonicalEn: "S.O." };
    const term = { ...edited, aliases: aliasesKeeping(before, edited) };
    expect(removedAliases(before.aliases, term)).toEqual([]);
    // Taken out by the user as well as promoted: still not removed.
    const term2 = { ...edited, aliases: aliasesKeeping(before, { ...edited, aliases: ["SO"] }) };
    expect(removedAliases(before.aliases, term2)).toEqual([]);
    // A plain removal is still a removal.
    expect(removedAliases(before.aliases, { ...before, aliases: ["S.O."] })).toEqual(["SO"]);
  });

  it("the save caps its reason at 2,000 characters, as removing a term does", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/configuration/templates/glossary-core.ts", "utf8");
    const reasons = src.match(/const reason = String\(data\.get\("reason"\) \?\? ""\)\.trim\(\)(\.slice\(0, 2000\))?;/g) ?? [];
    expect(reasons.length).toBe(3);
    for (const r of reasons) expect(r).toMatch(/\.slice\(0, 2000\);$/);
    expect(src).toMatch(/const removed = removedAliases\(/);
  });
});

describe("Consider: an alias still in issued text is found in the database by whole words, capped with 'and N more'", () => {
  it("the database pattern is wordAt's rule: escaped, spaces as any white space, no letter or digit either side", () => {
    expect(wholeWordPattern("S.O.")).toBe("(^|[^[:alnum:]])S\\.O\\.([^[:alnum:]]|$)");
    expect(wholeWordPattern("  Pegawai   Penguasa ")).toBe("(^|[^[:alnum:]])Pegawai\\s+Penguasa([^[:alnum:]]|$)");
    expect(wholeWordPattern("a+b (c) [d] {e} ^$|?*\\")).toBe("(^|[^[:alnum:]])a\\+b\\s+\\(c\\)\\s+\\[d\\]\\s+\\{e\\}\\s+\\^\\$\\|\\?\\*\\\\([^[:alnum:]]|$)");
    expect(wholeWordPattern("   ")).toBeNull();
    // The same cases wordAt decides (the database run is verified on perolehan_verify).
    expect(wordAt("The S.O. delegates.", "S.O.")).toBe(4);
    expect(wordAt("approval", "pp")).toBe(-1);
  });

  it("names up to the cap and counts the rest", () => {
    expect(aliasesInUseText([{ alias: "S.O.", numbers: ["CERT/1"], total: 1 }])).toBe('"S.O." is still in the text of CERT/1: without it a search by the term\'s other wordings no longer finds it. Say why it is removed.');
    const ten = Array.from({ length: 10 }, (_, i) => `CERT/${i + 1}`);
    expect(aliasesInUseText([{ alias: "S.O.", numbers: ten, total: 13 }])).toBe(`"S.O." is still in the text of ${ten.join(", ")} and 3 more: without it a search by the term's other wordings no longer finds them. Say why it is removed.`);
    expect(aliasesInUseText([{ alias: "S.O.", numbers: ["CERT/1"], total: 1 }, { alias: "SO", numbers: ["CERT/2", "CERT/3"], total: 2 }])).toMatch(/^"S\.O\." is still in the text of CERT\/1; "SO" is still in the text of CERT\/2, CERT\/3: .* finds them\./);
  });

  it("the save reads only the numbers, never the frozen text, and takes no more than the cap", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/certificate/term-use.ts", "utf8");
    expect(src).toMatch(/SELECT x\."number", count\(\*\) OVER \(\)::int AS total FROM \(SELECT DISTINCT c\."id", c\."number" FROM/);
    expect(src).toMatch(/LIMIT \$\{ALIAS_USE_SHOWN\}/);
    expect(readFileSync("src/app/configuration/templates/glossary-core.ts", "utf8")).not.toMatch(/renderedText/);
  });
});
