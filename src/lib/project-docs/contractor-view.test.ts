import { describe, expect, it } from "vitest";

import { contractorFaultText, contractorReading, contractorRefusalText, WAITING_FOR_YOU } from "./contractor-view";
import { faultText } from "./labels";
import { DAY, story } from "./story.fixture";
import type { Finding } from "./types";

/** What the contractor is told of a document's state (PW-8, PW-28): never the organisation's own working. */

const ORG = "Jabatan Ujian";
const STAFF_ONLY = ["Waiting for approval", "Rejected", "approver", "Approver"];
const says = (r: ReturnType<typeof contractorReading>) => JSON.stringify({ a: r.stateLabel, b: r.waitsOnLabel });

describe("a contractor document: the real state, in the contractor's words", () => {
  it("asked for by the organisation: Asked for, and waiting for you", () => {
    const s = story("CONTRACTOR");
    s.request();
    expect(contractorReading(s.doc, ORG)).toMatchObject({ shown: "VERSIONS", stateLabel: "Asked for", waitsOnYou: true, waitsOnLabel: WAITING_FOR_YOU, latestVisible: null });
  });

  it("sent, with an approver: Waiting for approval, on the organisation (it is the contractor's own document)", () => {
    const s = story("CONTRACTOR");
    s.addApprover("e");
    s.upload();
    expect(contractorReading(s.doc, ORG)).toMatchObject({ stateLabel: "Waiting for approval", waitsOnYou: false, waitsOnLabel: `Waiting on ${ORG}` });
  });

  it("rejected: Rejected, waiting for you; its next version is waiting for approval again", () => {
    const s = story("CONTRACTOR");
    s.addApprover("e");
    s.upload();
    s.decide("e", "REJECTED", "Redo the levels");
    expect(contractorReading(s.doc, ORG)).toMatchObject({ stateLabel: "Rejected", waitsOnYou: true, waitsOnLabel: WAITING_FOR_YOU });
    s.upload();
    expect(contractorReading(s.doc, ORG)).toMatchObject({ stateLabel: "Waiting for approval", waitsOnYou: false });
  });

  it("approved: Approved, waiting on nobody", () => {
    const s = story("CONTRACTOR");
    s.addApprover("e");
    s.upload();
    s.decide("e", "APPROVED");
    expect(contractorReading(s.doc, ORG)).toMatchObject({ stateLabel: "Approved", waitsOnYou: false, waitsOnLabel: null });
  });

  it("a kind's mark is worded with its kind ('Noted' on defects rectified)", () => {
    const s = story("CONTRACTOR", "DEFECTS_RECTIFIED");
    s.upload();
    s.mark("TAKEN_UP");
    expect(contractorReading(s.doc, ORG).stateLabel).toBe("Noted");
  });
});

describe("an organisation document the contractor may see: never the organisation's working (PW-28)", () => {
  it("shared at once with no approver: Shared", () => {
    const s = story("ORGANISATION");
    s.upload();
    expect(contractorReading(s.doc, ORG)).toMatchObject({ shown: "VERSIONS", stateLabel: "Shared", waitsOnYou: false, waitsOnLabel: null });
  });

  it("an earlier shared version and a later one waiting for approval: Shared, the earlier version only, and its day, never the hidden one's", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.addApprover("e");
    s.upload();
    const r = contractorReading(s.doc, ORG);
    expect(r.visibleVersions.map((v) => v.id)).toEqual(["v1"]);
    expect(r.latestVisible?.id).toBe("v1");
    expect(r.stateLabel).toBe("Shared");
    expect(r.waitsOnLabel).toBeNull();
    for (const word of STAFF_ONLY) expect(says(r)).not.toContain(word);
  });

  it("an earlier shared version and a later one REJECTED: still Shared, the earlier only", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.addApprover("e");
    s.upload();
    s.decide("e", "REJECTED", "Wrong drawing");
    const r = contractorReading(s.doc, ORG);
    expect(r.stateLabel).toBe("Shared");
    expect(r.visibleVersions.map((v) => v.id)).toEqual(["v1"]);
    for (const word of STAFF_ONLY) expect(says(r)).not.toContain(word);
  });

  it("a shared version, then an approver is added: the version stays shared and the contractor still reads Shared, not Waiting for approval", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.addApprover("e");
    expect(contractorReading(s.doc, ORG).stateLabel).toBe("Shared");
  });

  it("approved: Approved, that version shown", () => {
    const s = story("ORGANISATION");
    s.addApprover("e");
    s.upload();
    s.decide("e", "APPROVED");
    const r = contractorReading(s.doc, ORG);
    expect(r).toMatchObject({ shown: "VERSIONS", stateLabel: "Approved", waitsOnLabel: null });
    expect(r.latestVisible?.uploadedOn).toBe(DAY);
  });

  it("the contractor's own request, open: Asked for, on the organisation", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.request();
    expect(contractorReading(s.doc, ORG)).toMatchObject({ stateLabel: "Asked for", waitsOnYou: false, waitsOnLabel: `Waiting on ${ORG}` });
  });
});

describe("an organisation document the contractor has no version of", () => {
  it("not asked for: not listed, with no state at all", () => {
    const s = story("ORGANISATION");
    s.addApprover("e");
    s.upload();
    expect(contractorReading(s.doc, ORG)).toEqual({ shown: "NOT_LISTED", stateLabel: null, waitsOnYou: false, waitsOnLabel: null, visibleVersions: [], latestVisible: null });
  });

  it("asked for: Being prepared by the organisation, and nothing of its working", () => {
    const s = story("ORGANISATION");
    s.addApprover("e");
    s.request();
    s.upload();
    s.decide("e", "REJECTED", "No");
    const r = contractorReading(s.doc, ORG);
    expect(r).toMatchObject({ shown: "BEING_PREPARED", stateLabel: `Being prepared by ${ORG}`, waitsOnYou: false, waitsOnLabel: null, visibleVersions: [], latestVisible: null });
  });
});

describe("a refusal in the contractor's words", () => {
  const codes = ["UNDER_REVIEW", "NOT_WAITING", "NOT_CURRENT", "ALREADY_WAITING", "NO_AUTHORITY", "DECIDED_CURRENT", "OWN_VERSION", "WOULD_APPROVE"];

  it("says nothing of the approvers' working or of screens only staff have", () => {
    for (const code of codes) {
      const words = contractorFaultText({ code, level: "block", data: { state: "WAITING_FOR_APPROVAL", side: "ORGANISATION" } }, ORG);
      expect(words, code).toBe("That cannot be done on this document now.");
    }
    expect(contractorFaultText({ code: "CLASS_NOT_SET", level: "block" }, ORG)).not.toMatch(/Configuration|administrator/i);
    expect(contractorFaultText({ code: "ZONE_NOT_SET", level: "block" }, ORG)).not.toMatch(/Configuration/);
  });

  it("the codes it passes on are exactly the ones whose staff words are safe", () => {
    const passed: Finding[] = [
      { code: "TOO_MANY_FILES", level: "block" as const, data: { limit: 20, files: 21 } },
      { code: "TOO_MANY_FILES_IN_WINDOW", level: "block" as const, data: { limit: 60, minutes: 60, retryInMinutes: 12 } },
      { code: "NOT_YOURS", level: "block" as const, data: { file: 2 } },
    ];
    for (const f of passed) expect(contractorFaultText(f, ORG)).toBe(faultText(f, ORG));
    expect(contractorFaultText({ code: "TOO_MANY_FILES_IN_WINDOW", level: "block", data: { limit: 60, minutes: 60, retryInMinutes: 12 } }, ORG)).toContain("12 minutes");
  });

  it("a refusal's lead and distinct words; the contract's own words replace them", () => {
    const f = { code: "UNDER_REVIEW", level: "block" as const };
    expect(contractorRefusalText({ faults: [f, f], said: null }, ORG)).toBe("Not done: That cannot be done on this document now.");
    expect(contractorRefusalText({ faults: [f], said: "The contract is closed." }, ORG)).toBe("The contract is closed.");
  });

  it("a code with no words of its own reads as the plain refusal, never as the code", () => {
    expect(contractorFaultText({ code: "SOMETHING_NEW", level: "block" }, ORG)).not.toContain("SOMETHING_NEW");
  });
});
