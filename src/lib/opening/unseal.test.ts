import { describe, expect, it } from "vitest";

import { CLOSING, PANEL, S, at, open } from "./fixture";
import { adjournFaults, authorisationFaults, lapsedByAdjourning, opensTheBox, unsealState } from "./unseal";

/**
 * FR-OPN-003, 004 (C-2, OD-11): two distinct present members authorise, each server-stamped; the
 * box opens on the second; not at the closing second itself (a bid then is in time), from the next.
 */

const notYet = open({ unsealed: false, sittingAuthorised: false });
const base: Parameters<typeof authorisationFaults>[0] = { state: notYet, panel: PANEL, auths: [], personId: "p1", recorderId: null, now: at(S), closing: CLOSING, boxLocked: true };
const codes = (x: Partial<typeof base>) => authorisationFaults({ ...base, ...x }).map((f) => f.code);
const auth = (personId: string, sittingNo = 1, lapsed = false, keyedBy: string | null = null) => ({ id: `a-${personId}-${sittingNo}`, personId, sittingNo, recordedAt: at(2 * S), lapsedAt: lapsed ? at(3 * S) : null, recordedByPersonId: keyedBy });

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

describe("two people authorise: one officer is never the hand behind both (review of Phase 2b)", () => {
  // Since Phase 3d (the product owner's ruling of 2026-10-07 on the 2b review, FR-OPN-003) a new authorisation is never keyed from a member's paper: `OpeningAuthorisation.person` is
  // not paper-capable (`act-slots.test.ts`, `act-begin.test.ts`). These cases stay, unchanged, for the authorisations that were keyed that way before and still count.
  // p1 and p2 are present panel members; "clerk" is an officer who held the permission to key a paper authorisation and is not on the panel.
  it("a member who keyed the other's paper authorisation does not also give their own", () => {
    expect(codes({ personId: "p1", recorderId: null, auths: [auth("p2", 1, false, "p1")] })).toEqual(["SAME_HAND"]);
  });
  it("nor does a member key the other's paper authorisation after giving their own", () => {
    expect(codes({ personId: "p2", recorderId: "p1", auths: [auth("p1")] })).toEqual(["SAME_HAND"]);
  });
  it("one officer who keys both is the hand behind both, whoever the two are", () => {
    expect(codes({ personId: "p1", recorderId: "clerk", auths: [auth("p2", 1, false, "clerk")] })).toEqual(["SAME_HAND"]);
  });
  it("a clerk who keys one and a member who signs the other are two people acting", () => {
    expect(codes({ personId: "p1", recorderId: null, auths: [auth("p2", 1, false, "clerk")] })).toEqual([]);
    expect(codes({ personId: "p2", recorderId: "clerk", auths: [auth("p1")] })).toEqual([]);
  });
  it("two clerks keying one each are two people acting", () => {
    expect(codes({ personId: "p1", recorderId: "clerk2", auths: [auth("p2", 1, false, "clerk")] })).toEqual([]);
  });
  it("an authorisation that lapsed when the sitting was adjourned, or one of another sitting, does not bind the new one", () => {
    expect(codes({ personId: "p1", auths: [auth("p2", 1, true, "p1")] })).toEqual([]);
    expect(codes({ personId: "p1", state: open({ sittingNo: 2, sittingAuthorised: false }), auths: [auth("p2", 1, false, "p1")] })).toEqual([]);
  });
  it("the pair of two members each signing in their own session is untouched", () => {
    expect(codes({ personId: "p2", auths: [auth("p1")] })).toEqual([]);
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
