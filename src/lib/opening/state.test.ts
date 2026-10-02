import { describe, expect, it } from "vitest";

import { PANEL } from "./fixture";
import { actFaults, openingPhase, openingState, sittingAuthorisers } from "./state";

/** C-2: where an opening stands, from its acts. */

const auth = (personId: string, sittingNo = 1, lapsed = false) => ({ personId, sittingNo, recordedAt: new Date(), lapsedAt: lapsed ? new Date() : null });
const o = (over: Partial<{ unsealedAt: Date | null; finalisedAt: Date | null }> = {}) => ({ kind: "MAIN" as const, unsealedAt: null, finalisedAt: null, ...over });

describe("the opening's phase", () => {
  it("awaiting, in progress, adjourned, resumed awaiting, finalised", () => {
    expect(openingPhase(openingState(o(), [{ sittingNo: 1, adjournedAt: null }], [auth("p1")], PANEL))).toBe("AWAITING_AUTHORISATION");
    expect(openingPhase(openingState(o({ unsealedAt: new Date() }), [{ sittingNo: 1, adjournedAt: null }], [auth("p1"), auth("p2")], PANEL))).toBe("IN_PROGRESS");
    expect(openingPhase(openingState(o({ unsealedAt: new Date() }), [{ sittingNo: 1, adjournedAt: new Date() }], [auth("p1"), auth("p2")], PANEL))).toBe("ADJOURNED");
    expect(openingPhase(openingState(o({ unsealedAt: new Date() }), [{ sittingNo: 1, adjournedAt: new Date() }, { sittingNo: 2, adjournedAt: null }], [auth("p1"), auth("p2")], PANEL))).toBe("AWAITING_REAUTHORISATION");
    expect(openingPhase(openingState(o({ unsealedAt: new Date(), finalisedAt: new Date() }), [{ sittingNo: 1, adjournedAt: null }], [], PANEL))).toBe("FINALISED");
  });
  it("only distinct present members' live authorisations count", () => {
    expect(sittingAuthorisers(1, [auth("p1"), auth("p1"), auth("p3"), auth("p2", 1, true)], PANEL)).toEqual(["p1"]);
  });
  it("acts wait for the box and an authorised sitting", () => {
    const s = openingState(o({ unsealedAt: new Date() }), [{ sittingNo: 2, adjournedAt: null }], [auth("p1"), auth("p2")], PANEL);
    expect(actFaults(s)).toEqual([{ code: "SITTING_NOT_AUTHORISED", level: "block", data: { sitting: 2 } }]);
  });
});
