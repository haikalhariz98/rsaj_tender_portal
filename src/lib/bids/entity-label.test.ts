import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BID_ENTITIES, BID_ENTITY_LABEL } from "./audit-view";

/**
 * Phase 2 close-out 67-C2 (flagged against accepted 6.6): the exercise's History named the envelope
 * register's rows "Record" (the fallback for an entity it has no name for). Each register entity has
 * its own label, in words, and the History reads them.
 */

describe("the register's rows are named in the History (67-C2)", () => {
  it("every register entity has a label, never a code and never the fallback", () => {
    for (const e of BID_ENTITIES) {
      expect(BID_ENTITY_LABEL[e], e).toBeTruthy();
      expect(BID_ENTITY_LABEL[e]).not.toBe("Record");
      expect(BID_ENTITY_LABEL[e]).not.toMatch(/^[A-Z][a-z]+[A-Z]/);
    }
    expect(Object.keys(BID_ENTITY_LABEL).sort()).toEqual([...BID_ENTITIES].sort());
  });

  it("names them as the Received section's cards do", () => {
    expect(BID_ENTITY_LABEL).toEqual({ BidEnvelope: "Envelope", BidWithdrawal: "Withdrawal", BoxEvent: "Tender box", ValidityExtension: "Validity extension" });
  });

  it("the exercise's History spreads them into its labels (source scan)", () => {
    const page = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/page.tsx"), "utf8");
    const labels = page.slice(page.indexOf("const ENTITY_LABEL"), page.indexOf("};", page.indexOf("const ENTITY_LABEL")));
    expect(labels).toMatch(/\.\.\.BID_ENTITY_LABEL,/);
  });
});
