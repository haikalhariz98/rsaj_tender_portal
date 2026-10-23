import { describe, expect, it } from "vitest";

import { earlierReading, EARLIER_RECORD, storedDueWords } from "./earlier";
import { documentState } from "./state";
import type { DocumentFacts } from "./types";
import { waitingForMe } from "./waiting";

/** "Waiting for me" (plan step 6; PW-11) and what an earlier record says of itself (PW-11, PW-4, PW-27). */

const ME = "p_me";
const OTHER = "p_other";
const so = { personId: ME, holdsOrActsInSo: true };
const notSo = { personId: ME, holdsOrActsInSo: false };

const v = (id: string, number: number, by: { person?: string; account?: string }) => ({ id, number, uploaderPersonId: by.person ?? null, uploaderAccountId: by.account ?? null, noApproversAtUpload: false, requestId: null, uploadedOn: "2026-10-01" });
const doc = (d: Partial<DocumentFacts>): DocumentFacts => ({ side: "ORGANISATION", kind: null, versions: [], approvers: [], decisions: [], requests: [], ...d });

describe("waitingForMe", () => {
  it("only a row that waits on the organisation", () => {
    for (const waitsOn of ["CONTRACTOR", null] as const) {
      expect(waitingForMe({ waitsOn, pendingApproverPersonIds: [ME], ownVersionApproverPersonIds: [] }, so)).toBe(false);
    }
  });

  it("a pending approver who may decide: waiting for them, whether or not they hold the S.O. office; not for the office when someone named may decide", () => {
    const row = { waitsOn: "ORGANISATION" as const, pendingApproverPersonIds: [ME, OTHER], ownVersionApproverPersonIds: [] };
    expect(waitingForMe(row, notSo)).toBe(true);
    expect(waitingForMe({ ...row, pendingApproverPersonIds: [OTHER] }, so)).toBe(false);
    expect(waitingForMe({ ...row, pendingApproverPersonIds: [OTHER] }, notSo)).toBe(false);
  });

  it("nobody named to decide: the S.O. office's, today, and nobody else's", () => {
    const row = { waitsOn: "ORGANISATION" as const, pendingApproverPersonIds: [], ownVersionApproverPersonIds: [] };
    expect(waitingForMe(row, so)).toBe(true);
    expect(waitingForMe(row, notSo)).toBe(false);
  });

  it("an approver who uploaded the latest version is not waited on (PW-6): alone, the document is the S.O. office's, which names another approver (PW-25)", () => {
    const stuck = { waitsOn: "ORGANISATION" as const, pendingApproverPersonIds: [ME], ownVersionApproverPersonIds: [ME] };
    expect(waitingForMe(stuck, notSo)).toBe(false);
    expect(waitingForMe(stuck, so)).toBe(true);
    // With another approver who may decide, it waits for them, not for the uploader nor the office.
    const two = { waitsOn: "ORGANISATION" as const, pendingApproverPersonIds: [ME, OTHER], ownVersionApproverPersonIds: [ME] };
    expect(waitingForMe(two, so)).toBe(false);
    expect(waitingForMe(two, { personId: OTHER, holdsOrActsInSo: false })).toBe(true);
  });

  it("from the document's own reading: a received kind is the office's; a version waiting for approval is its approvers'", () => {
    const received = documentState(doc({ side: "CONTRACTOR", kind: "DELAY_NOTICE", versions: [v("v1", 1, { account: "a1" })] }));
    expect(received.state).toBe("RECEIVED");
    expect(waitingForMe(received, so)).toBe(true);
    expect(waitingForMe(received, notSo)).toBe(false);
    const pending = documentState(doc({ versions: [v("v1", 1, { person: OTHER })], approvers: [{ id: "ap1", personId: ME, removed: false }] }));
    expect(pending.state).toBe("WAITING_FOR_APPROVAL");
    expect(waitingForMe(pending, notSo)).toBe(true);
    expect(waitingForMe(pending, { personId: "p_so", holdsOrActsInSo: true })).toBe(false);
  });
});

describe("an earlier record (PW-11)", () => {
  it("unanswered waits on the organisation; answered waits on nobody, is read-only, and is never Approved", () => {
    expect(earlierReading(null)).toEqual({ state: "RECEIVED", waitsOn: "ORGANISATION", answered: false });
    expect(earlierReading("TAKEN_UP")).toEqual({ state: "TAKEN_UP", waitsOn: null, answered: true });
    // Returned is not "Waiting for you": the earlier path is closed, and the contractor answers with a new document.
    expect(earlierReading("RETURNED")).toEqual({ state: "RETURNED", waitsOn: null, answered: true });
    const unanswered = earlierReading(null);
    expect(waitingForMe({ ...unanswered, pendingApproverPersonIds: [], ownVersionApproverPersonIds: [] }, so)).toBe(true);
    expect(waitingForMe({ ...earlierReading("RETURNED"), pendingApproverPersonIds: [], ownVersionApproverPersonIds: [] }, so)).toBe(false);
  });

  it("shows only its own stored due day, as a plain date, and never a service level (PW-4, PW-27)", () => {
    expect(storedDueWords("2026-10-19")).toBe("Due 19 Oct 2026");
    expect(storedDueWords(null)).toBe("No due day");
    for (const s of [storedDueWords(null), storedDueWords("2026-10-19"), EARLIER_RECORD]) expect(s).not.toMatch(/service level|not set|overdue|left/i);
  });
});
