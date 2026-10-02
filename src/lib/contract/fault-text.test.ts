import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contractFaultWords } from "./fault-text";
import { BASELINE_FIELD_WORDS, CHECK_WORDS, COMPARISON_WORDS, CONTRACT_STATUS_WORDS, PHASE_WORDS, SOURCE_WORDS } from "./labels";
import { BASELINE_FIELD_KEYS } from "./baseline";
import { CONTRACT_PHASES } from "./status";
import { BASELINE_SOURCES, CONTRACT_STATUSES, FORMATION_CHECK_KINDS, RECONCILIATION_COMPARISONS } from "./types";

/**
 * Codes never reach a screen (AGENTS.md rule 5): every fault code the 6.12 rules can emit has its own
 * sentence in English and Malay. The codes are read from the rules' own type unions, so a new code
 * without words fails here.
 */

const LIB = path.join(__dirname);
const FILES = ["formation.ts", "legal.ts", "sign.ts", "contract-date.ts", "copies.ts", "custody.ts", "preparation.ts", "versions.ts", "baseline.ts"];

function faultCodes(): string[] {
  const codes = new Set<string>();
  for (const f of FILES) {
    const src = readFileSync(path.join(LIB, f), "utf8");
    for (const m of src.matchAll(/export type (\w*Fault) =([^;]+);/g)) for (const c of m[2].matchAll(/"([A-Z_]+)"/g)) codes.add(c[1]);
  }
  return [...codes].sort();
}

describe("every 6.12 refusal is worded (EN and MS)", () => {
  const codes = faultCodes();
  it("finds the codes", () => {
    expect(codes.length).toBeGreaterThan(60);
  });
  it.each(codes)("%s", (code) => {
    const t = contractFaultWords({ code, level: "block", data: { field: "lad", group: "lad", check: "ARITHMETIC", comparison: "DRAWINGS", item: "BOND", state: "NOT_MET", fault: "IC_REQUIRED" } });
    expect(t.en).not.toBe("Refused.");
    expect(t.en.trim().length).toBeGreaterThan(5);
    expect(t.ms.trim().length).toBeGreaterThan(5);
    expect(t.en).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/);
  });
});

describe("the maps are exhaustive (X-8)", () => {
  it("every status, phase, check, comparison, source and baseline field has words", () => {
    for (const s of CONTRACT_STATUSES) expect(CONTRACT_STATUS_WORDS[s].ms).toBeTruthy();
    for (const p of CONTRACT_PHASES) expect(PHASE_WORDS[p].en).toBeTruthy();
    for (const k of FORMATION_CHECK_KINDS) expect(CHECK_WORDS[k].ms).toBeTruthy();
    for (const c of RECONCILIATION_COMPARISONS) expect(COMPARISON_WORDS[c].ms).toBeTruthy();
    for (const s of BASELINE_SOURCES) expect(SOURCE_WORDS[s].ms).toBeTruthy();
    for (const k of BASELINE_FIELD_KEYS) expect(BASELINE_FIELD_WORDS[k]?.ms).toBeTruthy();
  });
  it("an entered value says it is not from a tender Appendix (OD-5 A)", () => {
    expect(SOURCE_WORDS.ENTERED.en).toBe("Entered at baseline, not from a tender Appendix");
  });
});
