import { describe, expect, it } from "vitest";

import { refusalNotes } from "./refusal-notes";

/** The three refusals the browser check found on the finalised opening of demo_sx16 (Pass, and Reject for two different reasons). */
const LEAD =
  "Only the named opening officers present at this opening record its answers, decisions and confirmations, and only for an officer present at it. The opening is finalised: nothing on it changes. A late tender admitted afterwards is opened at a supplementary opening.";
const TAIL_ELIGIBLE = "Nothing the rules make eliminatory stands against this bid: the opening carries it. Any other concern goes in the minutes for the committee.";
const TAIL_INCOMPLETE = "The method reports an incomplete bid to the committee, which decides: the opening does not reject it for that.";

describe("refusalNotes", () => {
  const asked = [
    { offer: "No. 1", reason: LEAD },
    { offer: "No. 1", reason: `${LEAD} ${TAIL_ELIGIBLE}` },
    { offer: "No. 2", reason: LEAD },
    { offer: "No. 2", reason: `${LEAD} ${TAIL_INCOMPLETE}` },
    { offer: "No. 3", reason: LEAD },
    { offer: "No. 3", reason: `${LEAD} ${TAIL_ELIGIBLE}` },
  ];
  const r = refusalNotes(asked, "n");

  it("says the shared lead once and each different ending once, with the offers it is for", () => {
    expect(r.notes.map((n) => n.text)).toEqual([LEAD, TAIL_ELIGIBLE, TAIL_INCOMPLETE]);
    expect(r.notes[0].offers).toBeNull();
    expect(r.notes[1].offers).toEqual(["No. 1", "No. 3"]);
    expect(r.notes[2].offers).toEqual(["No. 2"]);
    expect(r.notes.map((n) => n.text).join(" ").split("supplementary opening").length - 1).toBe(1);
  });

  it("points each control at the notes that make up its own reason", () => {
    expect(r.idsFor(LEAD)).toBe("n-lead");
    expect(r.idsFor(`${LEAD} ${TAIL_ELIGIBLE}`)).toBe("n-lead n-0");
    expect(r.idsFor(`${LEAD} ${TAIL_INCOMPLETE}`)).toBe("n-lead n-1");
    expect(r.idsFor("something else")).toBeUndefined();
  });

  it("says one reason once, without a lead or a heading", () => {
    const one = refusalNotes([{ offer: "No. 1", reason: LEAD }, { offer: "No. 2", reason: LEAD }], "m");
    expect(one.notes).toEqual([{ id: "m-0", text: LEAD, offers: null }]);
    expect(one.idsFor(LEAD)).toBe("m-0");
  });

  it("has no notes where nothing is refused", () => {
    expect(refusalNotes([], "x").notes).toEqual([]);
  });
});
