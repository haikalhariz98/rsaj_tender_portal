import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { disclosureFault } from "./disclosure";

/**
 * Review R-1: the estimate is disclosed at finalising only after every refusal is decided, so a
 * refused disclosure writes nothing; and a refusal raised inside the transaction is thrown as a
 * Refusal, which rolls back whatever was written, never returned as a form state after writes.
 */

const at = new Date("2026-11-17T08:00:00Z");
const lodged = { state: "LODGED" as const, lodgedVersionNo: 2, currentVersionNo: 2 };

describe("what refuses the disclosure, before any write", () => {
  it("lodged, its lodged version on record: disclosed", () => expect(disclosureFault(lodged, [1, 2], at)).toBeNull());
  it("the lodged version missing: LODGED_VERSION_MISSING, before anything is written", () => expect(disclosureFault(lodged, [1], at)).toBe("LODGED_VERSION_MISSING"));
  it("never lodged, or already disclosed, or void: 6.2's refusal", () => {
    expect(disclosureFault({ ...lodged, state: "DRAFT" }, [1, 2], at)).toBe("NOT_LODGED");
    expect(disclosureFault({ ...lodged, state: "DISCLOSED" }, [1, 2], at)).toBe("ALREADY_DISCLOSED");
    expect(disclosureFault({ ...lodged, state: "VOID" }, [1, 2], at)).toBe("VOID");
  });
  it("no lodgement event recorded: the current version is the one compared", () => expect(disclosureFault({ ...lodged, lodgedVersionNo: null, currentVersionNo: 3 }, [1, 2], at)).toBe("LODGED_VERSION_MISSING"));
});

describe("the order of the writes", () => {
  const src = readFileSync("src/lib/opening/estimate.ts", "utf8");
  const body = src.slice(src.indexOf("export async function discloseAtFinalising"));
  it("disclosureFault is judged before the first write", () => {
    const judged = body.indexOf("disclosureFault(");
    expect(judged).toBeGreaterThan(0);
    for (const w of ["companyEstimate.update(", "estimateEvent.create(", "writeAudit("]) expect(body.indexOf(w), w).toBeGreaterThan(judged);
  });
  it("finaliseOpening throws a Refusal on DisclosureRefused (the transaction rolls back), never returns after writes", () => {
    // Step 15: the finalising transaction moved to finalise-transaction.ts (shared by the paper and the online finalise), its body unchanged.
    const actions = readFileSync("src/app/sourcing/[id]/opening/finalise-transaction.ts", "utf8");
    expect(actions).toMatch(/if \(e instanceof DisclosureRefused\) throw new Refusal\(/);
    expect(actions).not.toMatch(/if \(e instanceof DisclosureRefused\) return/);
  });
});
