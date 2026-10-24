import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EMPTY_RETURN, RETURN_RECORD_SELECT } from "@/lib/award/stage-two";

/// Security review L4: the contractor's award card reads of the paper return only what `paperStarted` judges, never the whole row (who received it, where it is held).
describe("the award card's read of the paper return (L4)", () => {
  const store = readFileSync(join(__dirname, "award-card-store.ts"), "utf8");

  it("selects exactly the fields of the return's record", () => {
    expect(store).toContain("awardReturn: { select: RETURN_RECORD_SELECT }");
    expect(store).not.toMatch(/awardReturn: \{ include/);
    expect(Object.keys(RETURN_RECORD_SELECT).sort()).toEqual(Object.keys(EMPTY_RETURN).sort());
  });
});
