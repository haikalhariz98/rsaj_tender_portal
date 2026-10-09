import { describe, expect, it } from "vitest";

import { applicationStatusWords, supplierStatusWords } from "@/lib/portal/registration-status";

import { supplierFaultText } from "./labels";
import { approveFaults, decisionFaults, isAnsweredOnTime, lapseFaults, lapseState, queueState } from "./review";

/**
 * Phase 4c (FR-VND-007 online). A supplier that answered every item of the office's request in time must not be rejected because the office had not yet looked on the day after the deadline.
 * The lapse itself is as it was (the day after the deadline, from the organisation's day); what is new is that a request answered in time reads "answered online, with the office" and is not
 * a lapse to record. These tests add to the lapse tests; none of those is changed.
 */

const items = [{ id: "i1" }, { id: "i2" }];
const answer = (answersItemId: string, lodgedOn: string) => ({ answersItemId, lodgedOn });
const D = "2026-10-20";

describe("whether a request was answered in time", () => {
  it("every item has an answer lodged on or before the deadline day", () => {
    expect(isAnsweredOnTime(items, [answer("i1", "2026-10-10"), answer("i2", D)], D)).toBe(true);
  });
  it("an item with no answer, or only a late one, is not answered", () => {
    expect(isAnsweredOnTime(items, [answer("i1", "2026-10-10")], D)).toBe(false);
    expect(isAnsweredOnTime(items, [answer("i1", "2026-10-10"), answer("i2", "2026-10-21")], D)).toBe(false);
  });
  it("an answer the office found not in order is still an answer: the office decides what it is worth", () => {
    expect(isAnsweredOnTime([{ id: "i1" }], [answer("i1", "2026-10-10")], D)).toBe(true);
  });
  it("a request with no items, or no deadline, is never answered", () => {
    expect(isAnsweredOnTime([], [], D)).toBe(false);
    expect(isAnsweredOnTime(items, [answer("i1", "2026-10-10"), answer("i2", "2026-10-10")], null)).toBe(false);
  });
  it("an answer to another request's item is not one", () => {
    expect(isAnsweredOnTime(items, [answer("i1", "2026-10-10"), answer("other", "2026-10-10")], D)).toBe(false);
  });
});

describe("the deadline of a request answered in time", () => {
  const app = (extra: { answeredOnTime?: boolean } = {}) => ({ status: "RESUBMISSION_REQUESTED" as const, resubmitBy: D, lapsedRecordedAt: null, routes: [], ...extra });

  it("the deadline day and before are open whatever was sent", () => {
    expect(lapseState(app({ answeredOnTime: true }), D)).toBe("OPEN");
    expect(lapseState(app(), "2026-10-19")).toBe("OPEN");
  });
  it("the day after, unanswered, is lapsed as before; answered in time it is answered, not lapsed", () => {
    expect(lapseState(app(), "2026-10-21")).toBe("LAPSED");
    expect(lapseState(app({ answeredOnTime: false }), "2026-10-21")).toBe("LAPSED");
    expect(lapseState(app({ answeredOnTime: true }), "2026-10-21")).toBe("ANSWERED");
  });
  it("the queue reads it as answered online, with the office", () => {
    expect(queueState(app({ answeredOnTime: true }), "2026-10-21")).toBe("ANSWERED");
    expect(queueState(app(), "2026-10-21")).toBe("LAPSED");
    expect(queueState(app({ answeredOnTime: true }), D)).toBe("RESUBMISSION_REQUESTED");
  });
  it("recording the lapse is refused for it, in words that say what to do, and still allowed for one not answered", () => {
    const faults = lapseFaults({ status: "RESUBMISSION_REQUESTED", lapsedRecordedAt: null, resubmitBy: D, answeredOnTime: true }, "2026-10-21");
    expect(faults.map((f) => f.code)).toEqual(["ANSWERED_ON_TIME"]);
    expect(supplierFaultText(faults[0]!)).toMatch(/answered everything the office asked for online by the deadline/);
    expect(supplierFaultText(faults[0]!)).not.toContain("ANSWERED_ON_TIME");
    expect(lapseFaults({ status: "RESUBMISSION_REQUESTED", lapsedRecordedAt: null, resubmitBy: D }, "2026-10-21")).toEqual([]);
    expect(lapseFaults({ status: "RESUBMISSION_REQUESTED", lapsedRecordedAt: null, resubmitBy: D, answeredOnTime: true }, D).map((f) => f.code)).toEqual(["NOT_LAPSED"]);
  });
  it("the office may still decide it: ask again or reject, and approve it where the file stands", () => {
    const f = { status: "RESUBMISSION_REQUESTED" as const, lapsedRecordedAt: null, resubmitBy: D, routePending: false, answeredOnTime: true };
    const ask = decisionFaults({ outcome: "REJECT", remarks: "Not good enough.", resubmitBy: null, items: [], personActive: true }, f, { today: "2026-10-21", documentIds: [], typeIds: [] });
    expect(ask).toEqual([]);
    // Unanswered, the same day asks for the lapse to be recorded first (as it always did).
    const lapsed = decisionFaults({ outcome: "REJECT", remarks: "x", resubmitBy: null, items: [], personActive: true }, { ...f, answeredOnTime: false }, { today: "2026-10-21", documentIds: [], typeIds: [] });
    expect(lapsed.map((x) => x.code)).toContain("LAPSE_UNRECORDED");
    const approve = approveFaults({ status: "RESUBMISSION_REQUESTED", lapsedRecordedAt: null, resubmitBy: D, answeredOnTime: true, declarationSignedOn: "2026-10-01", declarationScanned: true, mandatory: [], mandatoryNotSet: [], typesConfigured: 1, blacklist: null, kind: "NEW", supplierStatus: "APPLICANT", cancellation: null }, "2026-10-21");
    expect(approve.map((x) => x.code)).not.toContain("LAPSED");
    const unanswered = approveFaults({ status: "RESUBMISSION_REQUESTED", lapsedRecordedAt: null, resubmitBy: D, declarationSignedOn: "2026-10-01", declarationScanned: true, mandatory: [], mandatoryNotSet: [], typesConfigured: 1, blacklist: null, kind: "NEW", supplierStatus: "APPLICANT", cancellation: null }, "2026-10-21");
    expect(unanswered.map((x) => x.code)).toContain("LAPSED");
  });
});

// The input changed from a yes-or-no `answered` to the request's reading (`readRequest`), so that a request nobody answered is not told as answered once its date has passed, and an answer found
// not in order is not told as done while the date is still running. The expectations are unchanged.
describe("what the supplier is told once it has answered", () => {
  const day = (d: string) => d;
  it("the application says it answered, and does not repeat that anything is still wanted or that it will be rejected", () => {
    const words = applicationStatusWords({ status: "RESUBMISSION_REQUESTED", resubmitBy: D, reading: { kind: "ANSWERED" } }, day);
    expect(words.title.en).toBe("You have answered the office");
    expect(words.detail.en).not.toMatch(/rejected|Give the office what it asks/);
    expect(words.tone).toBe("info");
    expect(applicationStatusWords({ status: "RESUBMISSION_REQUESTED", resubmitBy: D, reading: { kind: "WAITING", needing: 1 } }, day).title.en).toBe("The office has asked for more");
    expect(applicationStatusWords({ status: "RESUBMISSION_REQUESTED", resubmitBy: D }, day).title.en).toBe("The office has asked for more");
  });
  it("the supplier's standing line is with the office, not waiting for the supplier", () => {
    const s = { status: "APPLICANT" as const, registeredOn: null };
    expect(supplierStatusWords(s, { status: "RESUBMISSION_REQUESTED", reading: { kind: "ANSWERED" } }, day).title.en).toBe("With the procurement office");
    expect(supplierStatusWords(s, { status: "RESUBMISSION_REQUESTED", reading: { kind: "WAITING", needing: 1 } }, day).title.en).toBe("Waiting for you");
  });
});
