import { describe, expect, it } from "vitest";

import { contractorFaultText, contractorReading, contractorRefusalText, contractorTally, WAITING_FOR_YOU } from "./contractor-view";
import { requestFaults, uploadFaults } from "./faults";
import { faultText } from "./labels";
import { DAY, story } from "./story.fixture";
import type { Finding } from "./types";
import { contractorFacts } from "./visibility";

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
    // Plan step 6 added `waitsOnOrganisation` (the overview's count): an unlisted document is with nobody the contractor may know of.
    expect(contractorReading(s.doc, ORG)).toEqual({ shown: "NOT_LISTED", stateLabel: null, waitsOnYou: false, waitsOnLabel: null, waitsOnOrganisation: false, visibleVersions: [], latestVisible: null });
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

describe("the overview's figures (plan step 6): with the organisation, and returned, read only as the contractor may know them", () => {
  it("its own document received or waiting for approval is with the organisation; rejected or returned is returned to it; an open request to it is neither", () => {
    const received = story("CONTRACTOR", "DELAY_NOTICE");
    received.upload();
    expect(contractorReading(received.doc, ORG)).toMatchObject({ stateLabel: "Received", waitsOnOrganisation: true, waitsOnLabel: `Waiting on ${ORG}` });
    const returned = story("CONTRACTOR", "INTERIM_CLAIM");
    returned.upload();
    returned.mark("RETURNED", "The valuation is missing its back-up.");
    expect(contractorReading(returned.doc, ORG)).toMatchObject({ stateLabel: "Returned", waitsOnYou: true, waitsOnOrganisation: false });
    const rejected = story("CONTRACTOR");
    rejected.addApprover("e");
    rejected.upload();
    rejected.decide("e", "REJECTED", "Redo the levels");
    const asked = story("CONTRACTOR");
    asked.request();
    const taken = story("CONTRACTOR", "WORK_PROGRAMME");
    taken.upload();
    taken.mark("TAKEN_UP");
    expect(contractorTally([received.doc, returned.doc, rejected.doc, asked.doc, taken.doc], ORG)).toEqual({ withOrganisation: 1, returned: 2 });
  });

  it("an organisation document is with the organisation only where the contractor asked for it; its own working (a version waiting for approval) never counts (PW-28)", () => {
    const prepared = story("ORGANISATION");
    prepared.addApprover("e");
    prepared.request();
    prepared.upload();
    expect(contractorReading(prepared.doc, ORG)).toMatchObject({ shown: "BEING_PREPARED", waitsOnOrganisation: true });
    const working = story("ORGANISATION");
    working.upload();
    working.addApprover("e");
    working.upload();
    expect(contractorReading(working.doc, ORG)).toMatchObject({ stateLabel: "Shared", waitsOnOrganisation: false });
    const hidden = story("ORGANISATION");
    hidden.addApprover("e");
    hidden.upload();
    expect(contractorTally([prepared.doc, working.doc, hidden.doc], ORG)).toEqual({ withOrganisation: 1, returned: 0 });
  });
});

describe("the kind and the declaration's refusals reach the contractor in its words (plan step 6)", () => {
  it("passes on the kind's and the signature's faults as they are, never the plain refusal", () => {
    for (const code of ["DECLARATION_NOT_SIGNED", "KIND_NOT_CONTRACTOR", "KIND_ALREADY_SET", "KIND_WITH_APPROVERS", "PORTAL_SIGNING_NOT_SET", "PORTAL_SIGNING_OFF", "SIGNER_NOT_AUTHORISED_NOT_SET", "SIGNER_NOT_AUTHORISED"]) {
      const f = { code, level: "block" as const };
      expect(contractorFaultText(f, ORG), code).toBe(faultText(f, ORG));
      expect(contractorFaultText(f, ORG), code).not.toBe("That cannot be done on this document now.");
      expect(contractorFaultText(f, ORG), code).not.toBe("Refused.");
    }
    expect(contractorFaultText({ code: "DECLARATION_NOT_SIGNED", level: "block" }, ORG)).toMatch(/password/);
  });

  it("a kind the contract does not offer, and a supply claim's files, in the staff's own words (ADR 0045 D6)", () => {
    const supplyFaults: Finding[] = [{ code: "KIND_NOT_OFFERED", level: "block", data: { kind: "INTERIM_CLAIM" } }, { code: "SUPPLY_FILE_MISSING", level: "block", data: { purpose: "SUPPLY_INVOICE" } }, { code: "FILE_PURPOSE_NOT_TAKEN", level: "block", data: { file: 1, purpose: "PROJECT_DOCUMENT_FILE", kind: "SUPPLY_CLAIM" } }];
    for (const x of supplyFaults) {
      expect(contractorFaultText(x, ORG), x.code).toBe(faultText(x, ORG));
      expect(contractorFaultText(x, ORG), x.code).not.toBe("That cannot be done on this document now.");
    }
    expect(contractorFaultText({ code: "SUPPLY_FILE_MISSING", level: "block", data: { purpose: "SUPPLY_INVOICE" } }, ORG)).toBe("Add the invoice.");
  });
});

describe("PW-35 and PW-46: every contractor reading and gate is computed on the contractor's projection, never on the organisation's working", () => {
  const ME = { side: "CONTRACTOR" as const, accountId: "acc" };
  const codes = (fs: readonly Finding[]) => fs.map((f) => f.code);

  it("the reviewer's case: Version 1 shared, the contractor asks again, an approver is added and Version 2 answers the request while it waits: still Asked for, waiting on the organisation, and Ask for it is not drawn", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.request();
    s.addApprover("e");
    s.upload();
    // The real facts: the request is answered, and the document waits for its approver.
    expect(s.doc.requests.every((r) => r.answered)).toBe(true);
    const r = contractorReading(s.doc, ORG);
    expect(r).toMatchObject({ shown: "VERSIONS", stateLabel: "Asked for", waitsOnYou: false, waitsOnLabel: `Waiting on ${ORG}`, waitsOnOrganisation: true });
    expect(r.visibleVersions.map((v) => v.id)).toEqual(["v1"]);
    // The gate the page offers reads the projection: the request is still open, so asking again is refused, as it is for any open request (no new words).
    expect(codes(requestFaults({ actor: ME, doc: contractorFacts(s.doc), note: "" }))).toEqual(["ALREADY_WAITING"]);
    // The overview's tally follows.
    expect(contractorTally([s.doc], ORG)).toEqual({ withOrganisation: 1, returned: 0 });
    // Once Version 2 is approved it is shown, and the request reads answered by it.
    s.decide("e", "APPROVED");
    expect(contractorReading(s.doc, ORG)).toMatchObject({ stateLabel: "Approved", waitsOnLabel: null, waitsOnOrganisation: false });
    expect(contractorFacts(s.doc).requests.every((r) => r.answered)).toBe(true);
  });

  it("a hidden pending version with no request: the gate offers Ask for it, as for any Shared document (the act refuses on the real facts in the generic words: the accepted LOW residual)", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.addApprover("e");
    s.upload();
    expect(contractorReading(s.doc, ORG).stateLabel).toBe("Shared");
    expect(requestFaults({ actor: ME, doc: contractorFacts(s.doc), note: "" })).toEqual([]);
    // The real facts refuse it, and the contractor is told only the plain refusal.
    const real = requestFaults({ actor: ME, doc: s.doc, note: "" });
    expect(codes(real)).toEqual(["ALREADY_WAITING"]);
    expect(contractorRefusalText({ faults: real, said: null }, ORG)).toBe("Not done: That cannot be done on this document now.");
    // So too after the hidden version is rejected: nothing tells the two apart.
    s.decide("e", "REJECTED", "Wrong drawing");
    expect(requestFaults({ actor: ME, doc: contractorFacts(s.doc), note: "" })).toEqual([]);
    expect(contractorReading(s.doc, ORG)).toEqual(contractorReading({ ...s.doc, versions: s.doc.versions.slice(0, 1), approvers: [], decisions: [] }, ORG));
  });

  it("an approver added to a Shared document is the organisation's working too: the gate still offers Ask for it", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.addApprover("e");
    expect(requestFaults({ actor: ME, doc: contractorFacts(s.doc), note: "" })).toEqual([]);
  });

  it("an approved document is final to the contractor: Approved, and asking again is refused as final", () => {
    const s = story("ORGANISATION");
    s.addApprover("e");
    s.upload();
    s.decide("e", "APPROVED");
    expect(codes(requestFaults({ actor: ME, doc: contractorFacts(s.doc), note: "" }))).toEqual(["FINAL"]);
  });

  it("the contractor's own document is read as it is: its gates are the real ones", () => {
    const s = story("CONTRACTOR");
    s.addApprover("e");
    s.upload();
    s.decide("e", "REJECTED", "Redo the levels");
    expect(contractorFacts(s.doc)).toBe(s.doc);
    expect(uploadFaults({ actor: ME, classSet: true, doc: contractorFacts(s.doc), files: 1, note: "", kind: null, signed: true })).toEqual(uploadFaults({ actor: ME, classSet: true, doc: s.doc, files: 1, note: "", kind: null, signed: true }));
  });
});
