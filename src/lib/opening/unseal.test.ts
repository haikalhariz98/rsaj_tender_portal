import { describe, expect, it } from "vitest";

import { CLOSING, PANEL, S, at, open } from "./fixture";
import { adjournFaults, authorisationFaults, lapsedByAdjourning, opensTheBox, unsealState } from "./unseal";

/**
 * FR-OPN-003, 004 (C-2, OD-11): two distinct present members authorise, each server-stamped; the
 * box opens on the second; not at the closing second itself (a bid then is in time), from the next.
 */

const notYet = open({ unsealed: false, sittingAuthorised: false });
const base: Parameters<typeof authorisationFaults>[0] = { state: notYet, panel: PANEL, auths: [], personId: "p1", now: at(S), closing: CLOSING, boxLocked: true };
const codes = (x: Partial<typeof base>) => authorisationFaults({ ...base, ...x }).map((f) => f.code);
const auth = (personId: string, sittingNo = 1, lapsed = false) => ({ id: `a-${personId}-${sittingNo}`, personId, sittingNo, recordedAt: at(2 * S), lapsedAt: lapsed ? at(3 * S) : null });

describe("authorising the opening (OD-11 at the closing second)", () => {
  it("closing 2026-11-17 14:30:00 KL: at 14:30:00 refused (a bid in that second is in time), at 14:30:01 allowed", () => {
    expect(codes({ now: CLOSING })).toEqual(["AT_OR_BEFORE_CLOSING"]);
    expect(codes({ now: at(999) })).toEqual(["AT_OR_BEFORE_CLOSING"]);
    expect(codes({ now: at(S) })).toEqual([]);
  });
  it("one authorisation → AWAITING_SECOND; the second distinct one opens the box", () => {
    expect(unsealState(1, [auth("p1")], PANEL)).toEqual({ state: "AWAITING_SECOND", count: 1 });
    expect(unsealState(1, [auth("p1"), auth("p2")], PANEL)).toEqual({ state: "AUTHORISED", count: 2 });
    expect(opensTheBox(notYet, 2)).toBe(true);
    expect(opensTheBox(open(), 2)).toBe(false);
  });
  it("the same Person twice is refused; a non-panel or absent Person is refused", () => {
    expect(codes({ auths: [auth("p1")] })).toEqual(["ALREADY_AUTHORISED"]);
    expect(codes({ personId: "x9" })).toEqual(["NOT_ON_PANEL"]);
    expect(codes({ personId: "p3" })).toEqual(["ABSENT"]);
  });
  it("an absent member's authorisation never counts towards the pair", () => {
    expect(unsealState(1, [auth("p1"), auth("p3")], PANEL).state).toBe("AWAITING_SECOND");
  });
  it("the main opening needs the box locked; a supplementary one does not", () => {
    expect(codes({ boxLocked: false })).toEqual(["BOX_NOT_LOCKED"]);
    expect(codes({ boxLocked: false, state: { ...notYet, kind: "SUPPLEMENTARY" } })).toEqual([]);
  });
  it("finalised or adjourned: refused", () => {
    expect(codes({ state: open({ finalised: true }) })).toEqual(["FINALISED"]);
    expect(codes({ state: { ...notYet, adjourned: true } })).toEqual(["ADJOURNED"]);
  });
});

describe("adjourning and resuming (C-2)", () => {
  it("adjourning lapses an unpaired authorisation; a paired one stands", () => {
    expect(lapsedByAdjourning(1, [auth("p1")], PANEL)).toEqual(["a-p1-1"]);
    expect(lapsedByAdjourning(1, [auth("p1"), auth("p2")], PANEL)).toEqual([]);
  });
  it("a resumed sitting needs two fresh authorisations: the first sitting's do not count, a lapsed one never", () => {
    const resumed = open({ sittingNo: 2, sittingAuthorised: false });
    expect(unsealState(2, [auth("p1"), auth("p2")], PANEL).state).toBe("AWAITING_FIRST");
    expect(authorisationFaults({ ...base, state: resumed, auths: [auth("p1"), auth("p2")] })).toEqual([]);
    expect(unsealState(1, [auth("p1", 1, true), auth("p2")], PANEL).state).toBe("AWAITING_SECOND");
  });
  it("adjourn needs a reason and is not repeated; resume only an adjourned opening", () => {
    expect(adjournFaults({ state: open(), reason: "", personActive: true, resume: false }).map((f) => f.code)).toEqual(["REASON_REQUIRED"]);
    expect(adjournFaults({ state: open({ adjourned: true }), reason: "x", personActive: true, resume: false }).map((f) => f.code)).toEqual(["ALREADY_ADJOURNED"]);
    expect(adjournFaults({ state: open(), reason: "x", personActive: true, resume: true }).map((f) => f.code)).toEqual(["NOT_ADJOURNED"]);
    expect(adjournFaults({ state: open({ finalised: true }), reason: "x", personActive: true, resume: true }).map((f) => f.code)).toEqual(["FINALISED"]);
  });
});
