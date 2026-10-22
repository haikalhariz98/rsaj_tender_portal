import { describe, expect, it } from "vitest";

import { decideFaults } from "./faults";
import { DOCUMENT_STATES, askedBy, documentState, latestVersion, liveApprovers, markOn, nextVersionNumber, openRequestOf } from "./state";
import { story } from "./story.fixture";
import type { DocumentFacts, VersionFacts } from "./types";
import { contractorSeesRemarks } from "./visibility";

/** A document's one state (PW-12), and who it waits on, through the founder's loop and every branch. */

const SO = { side: "ORGANISATION" as const, personId: "so", authorityToday: true };

describe("the founder's loop (plan §3.2): create, ask, approver, upload, reject with remarks, Version 2, approve", () => {
  it("reads, step by step, as the founder said it", () => {
    // 1. The organisation creates "Drainage layout" and asks the contractor for it: the document is the contractor's side.
    const s = story("CONTRACTOR");
    s.request();
    let r = documentState(s.doc);
    expect(r).toMatchObject({ state: "REQUESTED", waitsOn: "CONTRACTOR", final: false, latest: null, pendingApproverPersonIds: [] });
    expect(r.openRequest?.toSide).toBe("CONTRACTOR");

    // 2. It names the engineer as approver: still asked for, still the contractor's move.
    s.addApprover("engineer");
    expect(documentState(s.doc)).toMatchObject({ state: "REQUESTED", waitsOn: "CONTRACTOR" });

    // 3. The contractor uploads Version 1: it answers the request and waits on the organisation, the engineer pending.
    s.upload();
    r = documentState(s.doc);
    expect(r).toMatchObject({ state: "WAITING_FOR_APPROVAL", waitsOn: "ORGANISATION", pendingApproverPersonIds: ["engineer"], openRequest: null });
    expect(r.latest?.number).toBe(1);
    expect(s.doc.versions[0]!.requestId).toBe(s.doc.requests[0]!.id);

    // 4. The engineer rejects with remarks: back to the contractor, who reads the remarks.
    expect(decideFaults({ actor: { ...SO, personId: "engineer" }, doc: s.doc, versionId: "v1", outcome: "REJECTED", remarks: "Invert levels missing at MH3" })).toEqual([]);
    s.decide("engineer", "REJECTED", "Invert levels missing at MH3");
    r = documentState(s.doc);
    expect(r).toMatchObject({ state: "REJECTED", waitsOn: "CONTRACTOR", final: false, pendingApproverPersonIds: [] });
    expect(contractorSeesRemarks(s.doc)).toBe(true);

    // 5. The contractor uploads Version 2: waiting for approval again, and the Version 1 rejection does not count.
    s.upload();
    r = documentState(s.doc);
    expect(r).toMatchObject({ state: "WAITING_FOR_APPROVAL", waitsOn: "ORGANISATION", pendingApproverPersonIds: ["engineer"] });
    expect(r.latest?.number).toBe(2);

    // 6. The engineer approves: Approved, final, waiting on nobody.
    s.decide("engineer", "APPROVED");
    expect(documentState(s.doc)).toMatchObject({ state: "APPROVED", waitsOn: null, final: true, pendingApproverPersonIds: [] });
  });
});

describe("every state, and who it waits on", () => {
  it("REQUESTED waits on the side asked, whichever side the document is", () => {
    const org = story("ORGANISATION");
    org.request();
    expect(documentState(org.doc)).toMatchObject({ state: "REQUESTED", waitsOn: "ORGANISATION" });
  });

  it("an open request wins over the latest version and its decisions", () => {
    const s = story("ORGANISATION");
    s.upload();
    expect(documentState(s.doc).state).toBe("SHARED");
    s.request();
    expect(documentState(s.doc)).toMatchObject({ state: "REQUESTED", waitsOn: "ORGANISATION" });
    expect(documentState(s.doc).latest?.id).toBe("v1");
  });

  it("no version and no open request (never stored: a document is made with one or the other) reads as asked for, of its side, with no request", () => {
    const d: DocumentFacts = { side: "CONTRACTOR", kind: null, versions: [], approvers: [], decisions: [], requests: [] };
    expect(documentState(d)).toMatchObject({ state: "REQUESTED", waitsOn: "CONTRACTOR", openRequest: null, latest: null, final: false });
  });

  it("SHARED: a version, no live approver, no kind: waits on nobody, and is not final", () => {
    const s = story("CONTRACTOR");
    s.upload();
    expect(documentState(s.doc)).toMatchObject({ state: "SHARED", waitsOn: null, final: false });
  });

  it("a version shared with no approver, then an approver named: waiting for approval on that version", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.addApprover("engineer");
    expect(documentState(s.doc)).toMatchObject({ state: "WAITING_FOR_APPROVAL", waitsOn: "ORGANISATION", pendingApproverPersonIds: ["engineer"] });
  });

  it("REJECTED waits on the document's side: the organisation, on its own document", () => {
    const s = story("ORGANISATION");
    s.addApprover("engineer");
    s.upload();
    s.decide("engineer", "REJECTED", "Wrong scale");
    expect(documentState(s.doc)).toMatchObject({ state: "REJECTED", waitsOn: "ORGANISATION" });
  });

  it("two approvers: one approval leaves it waiting on the other; a rejection by either rejects it", () => {
    const s = story("CONTRACTOR");
    s.addApprover("a");
    s.addApprover("b");
    s.upload();
    s.decide("a", "APPROVED");
    expect(documentState(s.doc)).toMatchObject({ state: "WAITING_FOR_APPROVAL", pendingApproverPersonIds: ["b"] });
    s.decide("b", "REJECTED", "No");
    expect(documentState(s.doc).state).toBe("REJECTED");
  });

  it("a removed approver's decision no longer counts, and a removed approver is no longer pending", () => {
    const s = story("CONTRACTOR");
    const a = s.addApprover("a");
    s.addApprover("b");
    s.upload();
    s.removeApprover(a);
    expect(documentState(s.doc)).toMatchObject({ state: "WAITING_FOR_APPROVAL", pendingApproverPersonIds: ["b"] });
    s.decide("b", "APPROVED");
    expect(documentState(s.doc).state).toBe("APPROVED");
  });

  it("an approver removed after rejecting (the data allowing it) no longer holds the document rejected", () => {
    const s = story("CONTRACTOR");
    const a = s.addApprover("a");
    s.addApprover("b");
    s.upload();
    s.decide("a", "REJECTED", "No");
    s.removeApprover(a);
    expect(documentState(s.doc)).toMatchObject({ state: "WAITING_FOR_APPROVAL", pendingApproverPersonIds: ["b"] });
  });

  it("an approver who uploaded the latest version stays pending, and is named as one who may not decide it", () => {
    const s = story("ORGANISATION");
    s.addApprover("so");
    s.addApprover("engineer");
    s.upload({ personId: "so" });
    const r = documentState(s.doc);
    expect(r.pendingApproverPersonIds).toEqual(["so", "engineer"]);
    expect(r.ownVersionApproverPersonIds).toEqual(["so"]);
    s.decide("engineer", "APPROVED");
    expect(documentState(s.doc)).toMatchObject({ state: "WAITING_FOR_APPROVAL", pendingApproverPersonIds: ["so"], ownVersionApproverPersonIds: ["so"] });
  });

  it("a kind: RECEIVED waits on the organisation; TAKEN_UP is final; RETURNED waits on the contractor", () => {
    const s = story("CONTRACTOR");
    s.upload({ kind: "INTERIM_CLAIM" });
    expect(documentState(s.doc)).toMatchObject({ state: "RECEIVED", waitsOn: "ORGANISATION", final: false });
    s.mark("RETURNED", "Back-up missing");
    expect(documentState(s.doc)).toMatchObject({ state: "RETURNED", waitsOn: "CONTRACTOR", final: false });
    s.upload();
    expect(documentState(s.doc)).toMatchObject({ state: "RECEIVED", waitsOn: "ORGANISATION" });
    s.mark("TAKEN_UP");
    expect(documentState(s.doc)).toMatchObject({ state: "TAKEN_UP", waitsOn: null, final: true });
  });

  it("a kind is never APPROVED: approver rows and approvals, were they there, are not read", () => {
    const d: DocumentFacts = {
      side: "CONTRACTOR",
      kind: "WORK_PROGRAMME",
      versions: [{ id: "v1", number: 1, uploaderPersonId: null, uploaderAccountId: "acc", noApproversAtUpload: false, requestId: null, uploadedOn: "2026-10-23" }],
      approvers: [{ id: "ap", personId: "a", removed: false }],
      decisions: [{ versionId: "v1", approverId: "ap", outcome: "APPROVED", remarks: "" }],
      requests: [],
    };
    expect(documentState(d).state).toBe("RECEIVED");
  });

  it("every state is reachable, and only APPROVED and TAKEN_UP are final", () => {
    const seen = new Map<string, boolean>();
    const note = (d: DocumentFacts) => {
      const r = documentState(d);
      seen.set(r.state, r.final);
    };
    const a = story("CONTRACTOR");
    a.request();
    note(a.doc);
    a.addApprover("e");
    a.upload();
    note(a.doc);
    a.decide("e", "REJECTED", "x");
    note(a.doc);
    a.upload();
    a.decide("e", "APPROVED");
    note(a.doc);
    const b = story("CONTRACTOR");
    b.upload();
    note(b.doc);
    const k = story("CONTRACTOR");
    k.upload({ kind: "DELAY_NOTICE" });
    note(k.doc);
    k.mark("RETURNED", "x");
    note(k.doc);
    k.upload();
    k.mark("TAKEN_UP");
    note(k.doc);
    expect([...seen.keys()].sort()).toEqual([...DOCUMENT_STATES].sort());
    for (const [state, final] of seen) expect(final, state).toBe(state === "APPROVED" || state === "TAKEN_UP");
  });
});

describe("the helpers the store and the faults share", () => {
  const v = (id: string, number: number): VersionFacts => ({ id, number, uploaderPersonId: null, uploaderAccountId: "acc", noApproversAtUpload: true, requestId: null, uploadedOn: "2026-10-23" });
  it("the latest version is the highest number, wherever it sits in the list", () => {
    expect(latestVersion({ versions: [v("b", 2), v("c", 3), v("a", 1)] })?.id).toBe("c");
    expect(latestVersion({ versions: [] })).toBeNull();
  });
  it("versions are numbered 1, 2, 3 with no gap: the next is one more than the highest", () => {
    expect(nextVersionNumber({ versions: [] })).toBe(1);
    expect(nextVersionNumber({ versions: [v("a", 1), v("b", 2)] })).toBe(3);
    expect(nextVersionNumber({ versions: [v("b", 2), v("a", 1)] })).toBe(3);
  });
  it("live approvers, the open request, who asked, and a version's mark", () => {
    expect(liveApprovers({ approvers: [{ id: "1", personId: "a", removed: true }, { id: "2", personId: "b", removed: false }] }).map((a) => a.id)).toEqual(["2"]);
    expect(openRequestOf({ requests: [{ id: "r1", toSide: "CONTRACTOR", answered: true }] })).toBeNull();
    expect(openRequestOf({ requests: [{ id: "r1", toSide: "CONTRACTOR", answered: true }, { id: "r2", toSide: "CONTRACTOR", answered: false }] })?.id).toBe("r2");
    expect(askedBy({ toSide: "CONTRACTOR" })).toBe("ORGANISATION");
    expect(askedBy({ toSide: "ORGANISATION" })).toBe("CONTRACTOR");
    expect(markOn({ decisions: [{ versionId: "v1", approverId: "ap", outcome: "APPROVED", remarks: "" }] }, "v1")).toBeNull();
    expect(markOn({ decisions: [{ versionId: "v1", approverId: null, outcome: "TAKEN_UP", remarks: "" }] }, "v1")?.outcome).toBe("TAKEN_UP");
  });
});
