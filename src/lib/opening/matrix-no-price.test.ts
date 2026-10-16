import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * Wave 3c plan §4.3 (wave 3b §3): the matrix holds no price, no completion period and no declared figure. Neither the read model nor the matrix components select or name them, so a figure cannot reach
 * the matrix by a later edit. A source scan over code only (comments and strings blanked), with a self-test so a scan that stopped matching would fail.
 */

const FORBIDDEN = /\b(?:priceAsRead|completionPeriod|completionUnit|openingPrice|correctedPrice|periodValue|periodUnit)\b|declar\w*/i;
const root = process.cwd();
const opening = join(root, "src", "app", "sourcing", "[id]", "opening");
const components = existsSync(opening) ? readdirSync(opening).filter((f) => /^matrix[\w-]*\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)).map((f) => join("src", "app", "sourcing", "[id]", "opening", f)) : [];
const FILES = ["src/lib/opening/matrix.ts", "src/lib/opening/matrix-read.ts", "src/lib/opening/matrix-store.ts", ...components];

describe("the matrix holds no price, period or declared figure", () => {
  it.each(FILES)("%s names none of them in code", (path) => {
    const code = lex(readFileSync(join(root, path), "utf8"));
    expect(code.match(FORBIDDEN)?.[0] ?? null, path).toBeNull();
  });

  it("the scan reads code only, and does find a figure named in code", () => {
    expect(FORBIDDEN.test(lex("// priceAsRead\nconst a = 'openingPrice';"))).toBe(false);
    expect(FORBIDDEN.test(lex("const a = b.priceAsRead;"))).toBe(true);
    expect(FORBIDDEN.test(lex("select: { completionPeriod: true }"))).toBe(true);
    expect(FORBIDDEN.test(lex("const declaredPrice = 1;"))).toBe(true);
  });
});
