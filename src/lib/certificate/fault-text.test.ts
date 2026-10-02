import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { certificateFaultWords } from "./fault-text";

/**
 * Every refusal the certificate rules can give is worded, in both languages (AGENTS.md rule 5): the codes are
 * read from the rules' source, so a new code without words fails here. Frozen-unset wording never says "set
 * it": a refusal that stands on the pinned form names voiding and raising again.
 */

const dir = join(process.cwd(), "src/lib/certificate");
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "fault-text.ts" && f !== "config.ts");
const codes = new Set<string>();
for (const f of sources) {
  const s = readFileSync(join(dir, f), "utf8");
  for (const m of s.matchAll(/(?:code: |\b(?:f|one)\()"([A-Z_]+)"/g)) codes.add(m[1]);
}

describe("every certificate refusal is worded", () => {
  it("the scan finds the rules' codes", () => {
    expect(codes.size).toBeGreaterThan(50);
    for (const c of ["OUT_OF_ORDER", "TOTAL_NOT_OVERRIDABLE", "OVERRIDE_NOT_IN_DRAFT", "NOT_DISTRIBUTED", "ACK_BEFORE_DESPATCH", "CHECK_OUT_OF_ORDER", "DELEGABLE_UNDECIDED"]) expect(codes.has(c), c).toBe(true);
  });
  it.each([...codes])("%s has English and Malay words, never the default", (code) => {
    const w = certificateFaultWords({ code, level: "block", data: {} });
    expect(w.en).not.toBe("Refused.");
    expect(w.ms.trim()).not.toBe("");
    expect(w.en).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
  });
  it("a refusal standing on the pinned form names the real exit, never 'set it'", () => {
    const w = certificateFaultWords({ code: "DELEGABLE_NOT_SET", level: "block", data: { block: "Superintending Officer" } });
    expect(w.en).toMatch(/Void it and raise it again/);
    expect(w.en).not.toMatch(/\bset it\b|Configuration ›/);
  });
});
