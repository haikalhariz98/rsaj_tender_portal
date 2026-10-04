import { describe, expect, it } from "vitest";

import { lex, rawCallText, rawCalls } from "./source";

/**
 * 6.13 Part B Run 0 fix round (consider): the shared raw-call reader finds a raw method whatever follows its name, so a
 * suffix such as `$queryRawTyped` is never skipped, and one the scans do not know is unreadable (opener null), which
 * every scan already flags. The plain and Unsafe forms read as before.
 */

const read = (src: string) => rawCalls(lex(src)).map((c) => `${c.method}${c.suffix} ${c.opener ?? "none"}`);

describe("rawCalls finds every raw method, whatever its suffix", () => {
  it("$queryRawTyped is found, and cannot be read (its SQL is a compiled query, not in the source)", () => {
    expect(read("await tx.$queryRawTyped(getRows(id));")).toEqual(["queryRawTyped none"]);
    // The pattern this replaces did not find it at all: (Unsafe)? then a word boundary fails inside "RawTyped".
    expect([...lex("await tx.$queryRawTyped(getRows(id));").matchAll(/\$(executeRaw|queryRaw)(Unsafe)?\b/g)]).toHaveLength(0);
  });
  it("a suffix not known yet is unreadable, even when a backtick follows it", () => {
    expect(read('await tx.$executeRawLater`UPDATE "Contract" SET x = 1`;')).toEqual(["executeRawLater none"]);
    expect(read("await tx.$queryRawSomething<{ n: number }[]>`SELECT 1`;")).toEqual(["queryRawSomething none"]);
  });
  it("the plain and Unsafe forms read as before (the suffix kept)", () => {
    expect(read("tx.$queryRaw`SELECT 1`; tx.$executeRaw<number>`UPDATE x`; tx.$queryRawUnsafe(q); tx.$executeRaw(Prisma.sql`x`)")).toEqual(["queryRaw `", "executeRaw `", "queryRawUnsafe (", "executeRaw ("]);
    const [c] = rawCalls(lex("tx.$queryRawUnsafe(q)"));
    expect(c.unsafe).toBe(true);
    expect(c.suffix).toBe("Unsafe");
  });
  it("nothing in comments or strings", () => {
    expect(read('// tx.$queryRawTyped(q)\nconst s = "tx.$executeRawUnsafe(q)";')).toEqual([]);
  });
});

describe("rawCallText reads a readable call's SQL", () => {
  it("a tagged template to its backtick, a call to its parenthesis, nothing for an unreadable one", () => {
    const src = 'a = tx.$executeRaw<number>`UPDATE "Contract" SET x = 1`; b = tx.$queryRaw(Prisma.sql`SELECT (1)`); c = tx.$queryRawTyped(q);';
    const m = lex(src);
    expect(rawCalls(m).map((c) => rawCallText(src, m, c))).toEqual(['`UPDATE "Contract" SET x = 1`', "(Prisma.sql`SELECT (1)`)", null]);
  });
});
