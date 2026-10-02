import { describe, expect, it } from "vitest";

import { evaluationParties, evaluationSet } from "./carry";

/** FR-OPN-009: evaluation reads PASS offers from finalised openings, main and supplementary; never a REJECT. */

const openings = [
  { kind: "MAIN" as const, finalised: true, bids: [{ id: "b1", partyId: "p1", verdict: "PASS" as const }, { id: "b2", partyId: "p2", verdict: "REJECT" as const }] },
  { kind: "SUPPLEMENTARY" as const, finalised: true, bids: [{ id: "b3", partyId: "p3", verdict: "PASS" as const }] },
  { kind: "SUPPLEMENTARY" as const, finalised: false, bids: [{ id: "b4", partyId: "p4", verdict: "PASS" as const }] },
];

describe("the evaluation set", () => {
  it("PASS only, from MAIN and SUPPLEMENTARY, finalised; REJECT never appears", () => {
    expect(evaluationSet(openings).map((b) => b.id)).toEqual(["b1", "b3"]);
    expect([...evaluationParties(openings)]).toEqual(["p1", "p3"]);
  });
});
