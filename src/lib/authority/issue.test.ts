import { describe, expect, it } from "vitest";

import { inForceOn, issueDayFor, issuedInForce, issueFault, newerIssueNote, noIssueOnRaisedText, onRoute, predecessorOf, startOfDay } from "./issue";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = new Date("2026-09-30T10:15:00.000Z");

const current = { id: "rev1", effectiveFrom: d("2024-01-01"), effectiveTo: null };

describe("issuing a draft", () => {
  it("may start today or later", () => {
    expect(issueFault(d("2026-09-30"), today, [current])).toBeNull();
    expect(issueFault(d("2026-11-01"), today, [current])).toBeNull();
  });

  it("is never back-dated — that would change rules past decisions ran under", () => {
    expect(issueFault(d("2026-09-29"), today, [current])).toBe("IN_THE_PAST");
  });

  it("cannot slot in before an issue already issued to start later", () => {
    const later = { id: "rev2", effectiveFrom: d("2027-01-01"), effectiveTo: null };
    expect(issueFault(d("2026-12-01"), today, [current, later])).toBe("NOT_AFTER_LATEST");
  });

  it("replaces the issue in force on its first day", () => {
    expect(predecessorOf([current], d("2026-10-01"))?.id).toBe("rev1");
    expect(predecessorOf([], d("2026-10-01"))).toBeNull();
  });

  it("works in whole days", () => {
    expect(startOfDay(today).toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
});

describe("which rule set a reader gets", () => {
  it("is the organisation's own unless a funder's route is asked for", () => {
    expect(issuedInForce(today).fundingRouteCode).toBeNull();
    expect(issuedInForce(today, "funder_led").fundingRouteCode).toBe("funder_led");
  });
});

describe("a funder's rule set has its own line of issues", () => {
  const own = { id: "own", effectiveFrom: d("2024-01-01"), effectiveTo: null, fundingRouteCode: null };
  const funder = { id: "fund1", effectiveFrom: d("2027-01-01"), effectiveTo: null, fundingRouteCode: "funder_led" };

  it("never ends the organisation's issue when a funder's issue is issued", () => {
    const line = onRoute([own, funder], "funder_led");
    expect(predecessorOf(line, d("2026-10-01"))).toBeNull();
    expect(line.map((i) => i.id)).toEqual(["fund1"]);
  });

  it("is not refused for starting before the organisation's later issue", () => {
    const laterOwn = { ...own, id: "own2", effectiveFrom: d("2027-06-01") };
    expect(issueFault(d("2026-12-01"), today, onRoute([own, laterOwn], "funder_led"))).toBeNull();
    expect(issueFault(d("2026-12-01"), today, onRoute([own, laterOwn], null))).toBe("NOT_AFTER_LATEST");
  });
});

describe("which day picks the issue a route runs under (FR-APR-020, ruling R2)", () => {
  // Worked example: issue 1 is in force until 1 Oct 2026, when issue 2 replaces it. A
  // requisition raised on 28 Sep is submitted on 2 Oct.
  const issue1 = { id: "issue-1", effectiveFrom: d("2024-01-01"), effectiveTo: d("2026-10-01") };
  const issue2 = { id: "issue-2", effectiveFrom: d("2026-10-01"), effectiveTo: null };
  const issues = [issue1, issue2];
  const raisedOn = d("2026-09-28");
  const submittedOn = d("2026-10-02");

  it("a requisition raised before a new issue's start and submitted after routes under the old issue", () => {
    expect(inForceOn(issues, issueDayFor("REQUISITION", { raisedOn, submittedOn }))?.id).toBe("issue-1");
  });

  it("a name-approval or award route submitted the same day routes under the issue in force that day", () => {
    expect(inForceOn(issues, issueDayFor("NAME_APPROVAL", { raisedOn, submittedOn }))?.id).toBe("issue-2");
    expect(inForceOn(issues, issueDayFor("AWARD", { raisedOn, submittedOn }))?.id).toBe("issue-2");
  });

  it("the new issue's start day is the new issue's: raised on it, it routes under the new issue", () => {
    expect(inForceOn(issues, issueDayFor("REQUISITION", { raisedOn: d("2026-10-01"), submittedOn }))?.id).toBe("issue-2");
    expect(inForceOn(issues, d("2026-09-30"))?.id).toBe("issue-1");
  });

  it("raised before any issue was in force: none, never the issue in force at submission", () => {
    expect(inForceOn(issues, issueDayFor("REQUISITION", { raisedOn: d("2023-12-31"), submittedOn }))).toBeNull();
    expect(noIssueOnRaisedText("31 Dec 2023")).toMatch(/31 Dec 2023, the day this requisition was raised/);
  });

  it("the route says when a newer issue is in force at submission, and is silent when it is the same", () => {
    const note = newerIssueNote({ id: "issue-1", label: "Issue 1" }, { id: "issue-2", label: "Issue 2" }, "28 Sep 2026");
    expect(note?.code).toBe("NEWER_ISSUE_IN_FORCE");
    expect(note?.messageEn).toMatch(/“Issue 1”, the issue in force on 28 Sep 2026.*“Issue 2” is in force on the day it was submitted/);
    expect(newerIssueNote({ id: "issue-1", label: "Issue 1" }, { id: "issue-1", label: "Issue 1" }, "28 Sep 2026")).toBeNull();
    expect(newerIssueNote({ id: "issue-1", label: "Issue 1" }, null, "28 Sep 2026")).toBeNull();
  });
});
