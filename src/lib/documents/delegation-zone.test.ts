import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { attachFault, detachFault, ownerState, repinFault } from "./attach";
import { documentFaultText, EXIT_TEXT } from "./labels";
import { delegationFacts } from "./owner-facts";

/**
 * 66-C2: the document store judged whether a delegation had ended on the UTC day when the
 * organisation's time zone was unset (owners.ts, read.ts). With no zone it is not judged: every act
 * on the delegation's documents is refused in the time-zone-not-set wording, as 66-C1 (b) does.
 */
describe("a delegation's documents with no time zone set (66-C2)", () => {
  const open = { effectiveTo: null };
  const ended = { effectiveTo: dayToDate("2026-01-01") };
  const unjudged = delegationFacts(ended, null);

  it("whether it has ended is not judged with no zone, whatever its end day; with a zone it is", () => {
    expect(delegationFacts(open, null)).toEqual({ kind: "delegation", ended: null });
    expect(unjudged).toEqual({ kind: "delegation", ended: null });
    expect(delegationFacts(ended, "2026-10-02")).toEqual({ kind: "delegation", ended: true });
    expect(delegationFacts(open, "2026-10-02")).toEqual({ kind: "delegation", ended: false });
  });

  it("attaching, taking off and re-pinning are all refused, saying the time zone is not set", () => {
    expect(ownerState("HOLDER_RECOMMENDATION", unjudged)).toEqual({ state: "FROZEN", exit: "DELEGATION_ZONE_UNSET" });
    const attach = attachFault({ purpose: "HOLDER_RECOMMENDATION", owner: unjudged, version: { withdrawnAt: null }, documentClass: { classification: "SULIT" }, documentClassification: "SULIT" });
    expect(attach.map((f) => f.code)).toContain("OWNER_FROZEN");
    expect(attach.map(documentFaultText).join(" ")).toMatch(/Time zone not set.*Organisation/);
    expect(detachFault({ purpose: "HOLDER_RECOMMENDATION", owner: unjudged, reason: "Wrong file", reliedOn: null }).map((f) => f.code)).toContain("OWNER_FROZEN");
    expect(repinFault({ purpose: "HOLDER_RECOMMENDATION", owner: unjudged, reason: "Clearer scan", attachment: { detachedAt: null, versionId: "v1", documentId: "d1" }, to: { id: "v2", documentId: "d1", withdrawnAt: null } }).map((f) => f.code)).toContain("OWNER_FROZEN");
    // 0005, founder 2026-10-19: the refusal is shortened; it still says the time zone is not set.
    expect(EXIT_TEXT.DELEGATION_ZONE_UNSET).toMatch(/^Time zone not set, so the delegation cannot be judged/);
  });

  it("an open delegation with the zone set stays open, an ended one stays frozen as before", () => {
    expect(ownerState("HOLDER_RECOMMENDATION", delegationFacts(open, "2026-10-02"))).toEqual({ state: "OPEN" });
    expect(ownerState("HOLDER_RECOMMENDATION", delegationFacts(ended, "2026-10-02"))).toEqual({ state: "FROZEN", exit: "DELEGATION_ENDED" });
  });

  it("the document store never falls back to the UTC day for a delegation (source scan)", () => {
    for (const f of ["src/lib/documents/owners.ts", "src/lib/documents/read.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/today \?\? storedDay\(new Date\(\)\)/);
      expect(src, f).not.toMatch(/delegationFacts\([^)]*toISOString/);
      for (const call of src.match(/delegationFacts\([^)]*\)/g) ?? []) expect(call, f).toMatch(/delegationFacts\(d, (org\.)?today\)/);
    }
  });
});
