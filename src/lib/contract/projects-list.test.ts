import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 6.12 review (/projects): the list derived each legally endorsed contract's phase by loading the whole
 * contract and the award's configuration once per row (up to 200 times). Now the configuration is read
 * once and the gate rows in one query (`endorsedPhases`), judged by the same gate function. The completion
 * date is the version in force today, read through baselineFor (ADR 0021: the one reader path), not the
 * highest version number. A returned contract is counted apart from those in preparation.
 */

const read = (p: string) => readFileSync(path.join(__dirname, "../../..", p), "utf8");

describe("the contracts list", () => {
  const page = read("src/app/projects/page.tsx");
  const load = read("src/lib/contract/load.ts");
  const list = load.slice(load.indexOf("export async function listContracts("), load.indexOf("/// The day the contract's preparation started"));
  const phases = load.slice(load.indexOf("export async function endorsedPhases("), load.indexOf("/// Whether a live attachment"));

  it("reads no contract one by one and no gate per row", () => {
    expect(page).toContain("endorsedPhases(");
    expect(page).not.toMatch(/loadContract\(|contractGate\(|loadAwardConfig\(/);
    expect(page).not.toMatch(/for \(const \w+ of endorsed\)/);
  });
  it("endorsedPhases reads the configuration once and the rows in one query, through the shared gate", () => {
    expect(phases.match(/loadAwardConfig\(/g)?.length).toBe(1);
    expect(phases.match(/\.findMany\(/g)?.length).toBe(1);
    expect(phases).toContain("gateOn(");
    expect(phases).toContain("phaseOf(");
    // contractGate, which the contract's own record reads, goes through the same gateOn.
    const single = load.slice(load.indexOf("export async function contractGate("), load.indexOf("export async function endorsedPhases("));
    expect(single).toContain("gateOn(");
  });
  it("the completion date comes through baselineFor, never the highest version directly", () => {
    expect(list).toContain("baselineFor(");
    expect(list).not.toMatch(/orderBy: \{ version: "desc" \}, take: 1/);
  });
  it("returned contracts are counted apart", () => {
    expect(list).toMatch(/status: "IN_PREPARATION" \}/);
    expect(list).toMatch(/status: "RETURNED_FOR_AMENDMENT" \}/);
    // AC-17 (C9): the page's header counts the case list's stages now; the returned count stays in listContracts' counts.
    expect(list).toMatch(/RETURNED_FOR_AMENDMENT"[\s\S]*counts: \{[^}]*\breturned\b/);
  });
});
