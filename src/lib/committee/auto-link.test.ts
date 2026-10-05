import { describe, expect, it } from "vitest";

import { autoLinkTarget, notLinkedNotes, type LinkMatter, type LinkRoute } from "./auto-link";
import { AUTO_LINK_WORDS } from "./labels";

/**
 * The outcome flows back by itself (founder, 2026-10-05): which step of the record's approval a matter's outcome is
 * offered to, when a sitting records it. Whether the step may take it is the record's own citation rule, run exactly
 * as its "Cite committee decision" act runs it; this decides only what is asked.
 */

const step = (sequence: number, over: Partial<LinkRoute["steps"][number]> = {}): LinkRoute["steps"][number] => ({
  id: `s${sequence}`,
  sequence,
  committeeCode: null,
  decision: "PENDING",
  committeeDecisionId: null,
  ...over,
});

const route = (over: Partial<LinkRoute> = {}): LinkRoute => ({
  routeId: "r1",
  recordKey: "REQUISITION:q1",
  domain: "requisition",
  status: "PENDING",
  steps: [step(1, { decision: "DONE" }), step(2, { committeeCode: "BOARD" })],
  ...over,
});

const matter = (over: Partial<LinkMatter> = {}): LinkMatter => ({
  recordKey: "REQUISITION:q1",
  domain: "requisition",
  committeeCode: "BOARD",
  outcome: "CARRIED",
  withdrawn: false,
  ...over,
});

describe("only a decided matter is offered to a step", () => {
  it("carried and not carried are offered", () => {
    expect(autoLinkTarget(matter(), [route()])).toEqual({ kind: "STEP", routeId: "r1", stepId: "s2" });
    expect(autoLinkTarget(matter({ outcome: "NOT_CARRIED" }), [route()])).toEqual({ kind: "STEP", routeId: "r1", stepId: "s2" });
  });

  it("deferred and still pending discharge nothing, and say nothing", () => {
    expect(autoLinkTarget(matter({ outcome: "DEFERRED" }), [route()])).toEqual({ kind: "NONE", why: "NOT_DECIDED" });
    expect(autoLinkTarget(matter({ outcome: "PENDING" }), [route()])).toEqual({ kind: "NONE", why: "NOT_DECIDED" });
  });

  it("withdrawn discharges nothing, and says nothing", () => {
    expect(autoLinkTarget(matter({ withdrawn: true }), [route()])).toEqual({ kind: "NONE", why: "NOT_DECIDED" });
  });
});

describe("the record's approval, and the step for this committee", () => {
  it("a manual matter names no record: nothing is asked, nothing said", () => {
    expect(autoLinkTarget(matter({ recordKey: null }), [route()])).toEqual({ kind: "NONE", why: "NO_RECORD" });
  });

  it("a matter of another kind on the record (a gate, a scope, a consent): no approval of that kind, nothing said", () => {
    expect(autoLinkTarget(matter({ domain: "committee_gate" }), [route()])).toEqual({ kind: "NONE", why: "NOT_A_ROUTE_MATTER" });
  });

  it("another record's route is never offered", () => {
    expect(autoLinkTarget(matter({ recordKey: "REQUISITION:q2" }), [route()])).toEqual({ kind: "NONE", why: "NOT_A_ROUTE_MATTER" });
  });

  it("the record's approval is closed: said, so the sitting shows why nothing was linked", () => {
    expect(autoLinkTarget(matter(), [route({ status: "APPROVED" })])).toEqual({ kind: "NONE", why: "NO_STEP" });
  });

  it("the open route's committee step is another committee's: said", () => {
    expect(autoLinkTarget(matter({ committeeCode: "TENDER_BOARD" }), [route()])).toEqual({ kind: "NONE", why: "NO_STEP" });
  });

  it("of a closed route and its open successor, the successor's step is offered", () => {
    const closed = route({ routeId: "old", status: "REJECTED", steps: [step(1, { committeeCode: "BOARD", decision: "REJECTED", id: "x1" })] });
    expect(autoLinkTarget(matter(), [closed, route()])).toEqual({ kind: "STEP", routeId: "r1", stepId: "s2" });
  });

  it("two pending steps for the committee: the earlier is offered", () => {
    const r = route({ steps: [step(1, { committeeCode: "BOARD" }), step(2, { committeeCode: "BOARD" })] });
    expect(autoLinkTarget(matter(), [r])).toEqual({ kind: "STEP", routeId: "r1", stepId: "s1" });
  });
});

describe("both orders: the outcome before, or after, the route reaches the step", () => {
  it("after: the step is current, and offered (the record's rule then discharges it)", () => {
    expect(autoLinkTarget(matter(), [route()])).toEqual({ kind: "STEP", routeId: "r1", stepId: "s2" });
  });

  it("before: the step is still behind a person's step, and is offered all the same; the record's own rule refuses it in its words (steps are decided in order), and the matter stays citable by hand", () => {
    const early = route({ steps: [step(1), step(2, { committeeCode: "BOARD" })] });
    expect(autoLinkTarget(matter(), [early])).toEqual({ kind: "STEP", routeId: "r1", stepId: "s2" });
  });
});

describe("a step already discharged is never discharged twice", () => {
  it("cited by hand before the outcome arrives: decided, so not offered, and said", () => {
    const cited = route({ steps: [step(1, { decision: "DONE" }), step(2, { committeeCode: "BOARD", decision: "DONE", committeeDecisionId: "other" })] });
    expect(autoLinkTarget(matter(), [cited])).toEqual({ kind: "NONE", why: "NO_STEP" });
  });

  it("a step citing a decision while still pending (never written so) is not offered either", () => {
    const odd = route({ steps: [step(1, { decision: "DONE" }), step(2, { committeeCode: "BOARD", committeeDecisionId: "other" })] });
    expect(autoLinkTarget(matter(), [odd])).toEqual({ kind: "NONE", why: "NO_STEP" });
  });
});

describe("the sitting's note: why a decided matter was not linked, read from its History", () => {
  const at = (iso: string) => new Date(iso);
  const notLinked = (entityId: string, when: string, reason: string) => ({ entityId, at: at(when), reason, changes: [{ field: "linkedToApproval", after: AUTO_LINK_WORDS.notLinked.en }] });

  it("the latest refusal's words, for a matter still uncited", () => {
    const notes = notLinkedNotes([notLinked("d1", "2026-10-05T03:00:00Z", "Steps are decided in order."), notLinked("d1", "2026-10-05T04:00:00Z", "The budget no longer covers it.")], new Set(["d1"]));
    expect(notes.get("d1")).toBe("The budget no longer covers it.");
  });

  it("cited by hand since: the note is history, not shown", () => {
    expect(notLinkedNotes([notLinked("d1", "2026-10-05T03:00:00Z", "Steps are decided in order.")], new Set()).size).toBe(0);
  });

  it("any other History entry of the matter is not a note", () => {
    const outcome = { entityId: "d1", at: at("2026-10-05T03:00:00Z"), reason: "", changes: [{ field: "outcome", after: "CARRIED" }] };
    expect(notLinkedNotes([outcome], new Set(["d1"])).size).toBe(0);
  });
});
