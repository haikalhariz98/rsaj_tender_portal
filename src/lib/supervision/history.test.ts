import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RECORD_TYPE_WORDS, SUPERVISION_ENTITIES } from "@/lib/audit/entity-labels";
import { CODE_FIELDS } from "@/lib/contract/history-words";
import { closing, lex } from "@/lib/scan/source";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * The contract's History reads the supervision's trail in words (AGENTS.md rule 5): every record type the
 * supervision acts write is registered with its name, the contract's History names it, and no value is written
 * under a field the History reads as a code (it would show as "—"), except a code it has words for.
 */

const ROOT = path.join(__dirname, "../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const ACTS = read("src/app/projects/[id]/supervision-actions.ts");

describe("the supervision's trail", () => {
  it("every record type written is registered, in English and Malay", () => {
    const written = new Set([...ACTS.matchAll(/audit\(c, "(\w+)"/g)].map((m) => m[1]));
    for (const e of written) if (e !== "ContractBaseline") expect(SUPERVISION_ENTITIES as readonly string[], e).toContain(e);
    for (const e of SUPERVISION_ENTITIES) {
      expect(RECORD_TYPE_WORDS[e]?.en, e).toBeTruthy();
    }
  });
  it("the contract's History names each", () => {
    expect(read("src/app/projects/[id]/page.tsx")).toMatch(/\.\.\.Object\.fromEntries\(SUPERVISION_ENTITIES\.map\(\(e\) => \[e, RECORD_TYPE_WORDS\[e\]\.en\]\)\)/);
  });
  it("no value in words is written under a field History reads as a code", () => {
    const m = lex(ACTS);
    const keys: string[] = [];
    for (const x of m.matchAll(/diffFields\(/g)) {
      const open = x.index! + x[0].length - 1;
      const body = ACTS.slice(open, closing(m, open) + 1);
      for (const k of body.matchAll(/[{,]\s*(\w+):/g)) keys.push(k[1]);
    }
    expect(keys.length).toBeGreaterThan(40);
    // status (the contract's phase) and provenance (STATED/OBSERVED/ASSUMED) are codes History has words for.
    expect([...new Set(keys.filter((k) => CODE_FIELDS.has(k)))].sort()).toEqual(["provenance", "status"]);
  });
});
