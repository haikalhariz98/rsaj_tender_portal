import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RECORD_TYPE_WORDS, VARIATION_ENTITIES } from "@/lib/audit/entity-labels";
import { CODE_FIELDS } from "@/lib/contract/history-words";
import { closing, lex } from "@/lib/scan/source";

/**
 * The contract's History reads the variation acts' trail in words (AGENTS.md rule 5): every record type they write is
 * registered with its name in both languages, the contract's History names each, and no value is written under a field
 * the History reads as a code, except the codes it has words for (a route's status, a step's decision).
 */

const ROOT = path.join(__dirname, "../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const SOURCES = ["src/app/projects/[id]/variation-actions.ts", "src/lib/variation/route-write.ts", "src/lib/variation/at-certificate.ts"];

describe("the variation acts' trail", () => {
  it("every record type written is registered, in English and Malay", () => {
    const written = new Set(SOURCES.flatMap((f) => [...read(f).matchAll(/(?:audit\(c, |entity: )"(\w+)"/g)].map((m) => m[1])));
    expect(written.size).toBeGreaterThan(7);
    for (const e of written) expect(VARIATION_ENTITIES as readonly string[], e).toContain(e);
    for (const e of VARIATION_ENTITIES) {
      expect(RECORD_TYPE_WORDS[e]?.en, e).toBeTruthy();
      expect(RECORD_TYPE_WORDS[e]?.ms, e).toBeTruthy();
    }
  });
  it("the contract's History names each", () => {
    expect(read("src/app/projects/[id]/page.tsx")).toMatch(/\.\.\.Object\.fromEntries\(VARIATION_ENTITIES\.map\(\(e\) => \[e, RECORD_TYPE_WORDS\[e\]\.en\]\)\)/);
  });
  it("no value in words is written under a field History reads as a code", () => {
    const keys: string[] = [];
    for (const f of SOURCES) {
      const src = read(f);
      const m = lex(src);
      for (const x of m.matchAll(/diffFields\(/g)) {
        const open = x.index! + x[0].length - 1;
        const body = src.slice(open, closing(m, open) + 1);
        for (const k of body.matchAll(/[{,]\s*(\w+):/g)) keys.push(k[1]);
      }
    }
    expect(keys.length).toBeGreaterThan(60);
    expect([...new Set(keys.filter((k) => CODE_FIELDS.has(k)))].sort()).toEqual(["decision", "status"]);
  });
});
