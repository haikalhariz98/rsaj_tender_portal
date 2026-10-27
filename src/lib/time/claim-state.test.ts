import { describe, expect, it } from "vitest";

import { EOT_CLAIM_STATES, EOT_NEXT, EOT_STATE_WORDS, eotClaimState, eotNext, type ClaimStateFacts } from "./claim-state";

/** Plan closeout-plan.md §3.1: each state of an extension-of-time claim gives the claim page its one primary action. */

const f = (o: Partial<ClaimStateFacts> = {}): ClaimStateFacts => ({ answered: false, reasons: 0, entitlement: null, closed: false, route: null, approved: false, raised: null, ...o });

describe("eotClaimState", () => {
  const cases: [string, ClaimStateFacts, string, string | null][] = [
    ["recorded", f(), "RECORDED", "ANSWER"],
    ["answered", f({ answered: true }), "ANSWERED", "ADD_REASON"],
    ["has reasons", f({ answered: true, reasons: 2 }), "HAS_REASONS", "DETERMINE"],
    ["entitled", f({ answered: true, reasons: 2, entitlement: "ENTITLED" }), "ENTITLED", "SEND"],
    ["sent", f({ answered: true, reasons: 2, entitlement: "ENTITLED", route: "PENDING" }), "SENT", null],
    ["refused", f({ answered: true, reasons: 2, entitlement: "ENTITLED", route: "REJECTED" }), "REFUSED", null],
    // Review S2 (flagged, changed: a recalled route was REFUSED with no action, so it could not be sent again from any screen).
    ["recalled", f({ answered: true, reasons: 2, entitlement: "ENTITLED", route: "RECALLED" }), "RETURNED", "SEND"],
    ["refused, sent back to whoever raised it", f({ answered: true, reasons: 2, entitlement: "ENTITLED", route: "REJECTED", returned: true }), "RETURNED", "SEND"],
    ["approved", f({ answered: true, reasons: 2, entitlement: "ENTITLED", route: "APPROVED", approved: true }), "APPROVED", "RAISE_CERTIFICATE"],
    ["certificate raised", f({ entitlement: "ENTITLED", route: "APPROVED", approved: true, raised: { status: "SIGNING" } }), "CERTIFICATE_RAISED", "OPEN_CERTIFICATE"],
    ["granted", f({ entitlement: "ENTITLED", route: "APPROVED", approved: true, raised: { status: "ISSUED" } }), "GRANTED", null],
    ["not entitled (closed)", f({ answered: true, entitlement: "NOT_ENTITLED", closed: true }), "NOT_ENTITLED", null],
    ["closed after a refusal", f({ entitlement: "ENTITLED", route: "REJECTED", closed: true }), "CLOSED", null],
  ];
  for (const [name, facts, state, action] of cases)
    it(`${name}: ${state}, primary ${action ?? "none"}`, () => {
      const s = eotClaimState(facts);
      expect(s).toBe(state);
      expect(eotNext(s)).toBe(action);
    });
  it("an approved route not yet written as the approval of record reads as entitled, never approved", () => {
    expect(eotClaimState(f({ entitlement: "ENTITLED", route: "APPROVED", approved: false }))).toBe("ENTITLED");
  });
  it("every state has its words and its action decided", () => {
    for (const s of EOT_CLAIM_STATES) {
      expect(EOT_STATE_WORDS[s].length, s).toBeGreaterThan(3);
      expect(s in EOT_NEXT, s).toBe(true);
    }
  });
});
