import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isSulitField } from "@/lib/sulit-fields";

/**
 * 6.12 review (BD-612-24): an arithmetical correction's tendered and corrected figures are priced bid
 * figures, SULIT as 6.8's corrected price is. They are written to the trail under registered keys, so the
 * contract's History chips them and the audit export withholds them; the screen shows them with the chip.
 */

const read = (p: string) => readFileSync(path.join(__dirname, "../../..", p), "utf8");

describe("an arithmetical correction's figures are SULIT", () => {
  it("registered under their own keys", () => {
    expect(isSulitField("tenderedLineAmount")).toBe(true);
    expect(isSulitField("correctedLineAmount")).toBe(true);
  });
  it("the acts write them only under those keys (adding and taking off a line)", () => {
    const src = read("src/app/projects/[id]/actions.ts");
    for (const name of ["addCorrection", "removeCheckLine"]) {
      const at = src.indexOf(`export async function ${name}(`);
      const body = src.slice(at, src.indexOf("\nexport async function ", at + 10));
      const trail = body.split("\n").filter((l) => l.includes('audit(c, "ArithmeticCorrection"'));
      expect(trail.length, name).toBe(1);
      expect(trail[0], name).toMatch(/tenderedLineAmount: .*correctedLineAmount: /);
      expect(trail[0], name).not.toMatch(/\b(tendered|corrected): /);
    }
  });
  it("the demo writes its trail the same way", () => {
    const demo = read("prisma/demo-contracts.ts");
    expect(demo).toMatch(/tenderedLineAmount: x\.tendered, correctedLineAmount: x\.corrected/);
  });
  // Phase 3b, a deliberate change to this test (logged): the Formation tab holds them to the contract's one answer, not a chip.
  it("the Formation tab shows them as the contract's one answer says", () => {
    const panel = read("src/app/projects/[id]/formation-panels.tsx");
    expect(panel).toMatch(/<SulitValue of=\{through\(sulit, `\$\{money\(x\.tendered\)\} as tendered → \$\{money\(x\.corrected\)\} corrected`\)\} \/>/);
    expect(panel).not.toMatch(/<SulitValue>/);
  });
});
