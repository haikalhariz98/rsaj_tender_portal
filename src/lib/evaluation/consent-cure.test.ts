import { describe, expect, it } from "vitest";

import { consentCheck, CONSENT_OUTCOME_TEXT } from "./consent";
import { evaluationFindingText } from "./labels";

/**
 * 6.8 re-review 2 (the lead's ruling; FR-BID-010, OD-7, AGENTS.md rule 2): consent is judged only for
 * the extension setting the current validity expiry. An extension applied on A's consent before the
 * recommendation is cured by a later one applied on the recommended B's consent; following the exit
 * text clears the block.
 */

const x = (id: string, party: string, toExpiry: string, applied = true) => ({ id, consentPartyId: party, consentPartyName: `Syarikat ${party}`, applied, toExpiry });

describe("the validity's consent, as it stands (re-review 2)", () => {
  it("A's extension, then the recommendation on B, then B's extension to a later day: cured", () => {
    const r = consentCheck([x("e1", "A", "2026-12-31"), x("e2", "B", "2027-03-31")], "B");
    expect(r.faults).toEqual([]);
    expect(r.rows.map((y) => [y.extensionId, y.outcome])).toEqual([["e1", "SUPERSEDED"], ["e2", "CHECKED"]]);
    expect(CONSENT_OUTCOME_TEXT.SUPERSEDED).toMatch(/Superseded by a later extension/);
  });
  it("B's extension and nothing after it: fine", () => {
    expect(consentCheck([x("e1", "B", "2026-12-31")], "B").faults).toEqual([]);
  });
  it("A's extension only: blocks, and the exit says what clears it", () => {
    const r = consentCheck([x("e1", "A", "2026-12-31")], "B");
    expect(r.faults.map((f) => f.code)).toEqual(["CONSENT_NOT_FROM_RECOMMENDED"]);
    const text = evaluationFindingText(r.faults[0]);
    expect(text).toContain("Validity rests on Syarikat A's consent to 31 Dec 2026");
    expect(text).toContain("Record their consent on Received");
  });
  it("B's extension, then A's to a later day: A's is the one in force and blocks", () => {
    const r = consentCheck([x("e1", "B", "2026-12-31"), x("e2", "A", "2027-03-31")], "B");
    expect(r.faults.map((f) => f.data?.party)).toEqual(["Syarikat A"]);
    expect(r.rows[0].outcome).toBe("SUPERSEDED");
  });
  it("an extension recorded but not applied neither cures nor blocks", () => {
    expect(consentCheck([x("e1", "A", "2026-12-31"), x("e2", "B", "2027-03-31", false)], "B").faults.length).toBe(1);
  });
});
