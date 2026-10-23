import { describe, expect, it } from "vitest";

import { documentState } from "./state";
import { story } from "./story.fixture";
import type { DocumentFacts } from "./types";
import { contractorAnswer, contractorAskedFor, contractorFacts, contractorMayDownload, contractorMayOpen, contractorSeesRemarks, contractorSeesVersion, contractorView, waitingForContractor } from "./visibility";

/** What the contractor sees (PW-8 as amended by PW-28): every case of the three views, the download check, and "Waiting for you". */

const seen = (d: DocumentFacts) => d.versions.filter((v) => contractorSeesVersion(d, v)).map((v) => v.id);

describe("a contractor document: always listed, everything seen", () => {
  it("before its first version it is listed with no version, and waits on the contractor", () => {
    const s = story("CONTRACTOR");
    s.request();
    expect(contractorView(s.doc)).toEqual({ shown: "VERSIONS", versionIds: [] });
    expect(waitingForContractor(s.doc)).toBe(true);
  });
  it("every version and every remark, approved, rejected or waiting", () => {
    const s = story("CONTRACTOR");
    s.addApprover("e");
    s.upload();
    s.decide("e", "REJECTED", "No");
    s.upload();
    expect(contractorView(s.doc)).toEqual({ shown: "VERSIONS", versionIds: ["v1", "v2"] });
    expect(contractorSeesRemarks(s.doc)).toBe(true);
  });
});

describe("an organisation document (PW-8, PW-28)", () => {
  it("a version uploaded with no approver is shared at once, and an approver added later never hides it", () => {
    const s = story("ORGANISATION");
    s.upload();
    expect(contractorView(s.doc)).toEqual({ shown: "VERSIONS", versionIds: ["v1"] });
    s.addApprover("e");
    expect(documentState(s.doc).state).toBe("WAITING_FOR_APPROVAL");
    expect(contractorView(s.doc)).toEqual({ shown: "VERSIONS", versionIds: ["v1"] });
  });

  it("not asked for by the contractor, with approvers at upload: NOT LISTED until approved, then that version only", () => {
    const s = story("ORGANISATION");
    s.addApprover("e");
    s.upload();
    expect(contractorView(s.doc)).toEqual({ shown: "NOT_LISTED" });
    expect(contractorMayOpen(s.doc)).toBe(false);
    s.decide("e", "REJECTED", "Redo");
    expect(contractorView(s.doc)).toEqual({ shown: "NOT_LISTED" });
    s.upload();
    expect(contractorView(s.doc)).toEqual({ shown: "NOT_LISTED" });
    s.decide("e", "APPROVED");
    expect(contractorView(s.doc)).toEqual({ shown: "VERSIONS", versionIds: ["v2"] });
    expect(contractorMayOpen(s.doc)).toBe(true);
  });

  it("asked for by the contractor, with no version it may see: BEING PREPARED, then the approved version", () => {
    const s = story("ORGANISATION");
    s.request();
    expect(contractorAskedFor(s.doc)).toBe(true);
    expect(contractorView(s.doc)).toEqual({ shown: "BEING_PREPARED" });
    s.addApprover("e");
    s.upload();
    // The request is answered, but it was still the contractor that asked.
    expect(contractorView(s.doc)).toEqual({ shown: "BEING_PREPARED" });
    s.decide("e", "APPROVED");
    expect(contractorView(s.doc)).toEqual({ shown: "VERSIONS", versionIds: ["v1"] });
  });

  it("asked for, answered with no approver: shared at once", () => {
    const s = story("ORGANISATION");
    s.request();
    s.upload();
    expect(contractorView(s.doc)).toEqual({ shown: "VERSIONS", versionIds: ["v1"] });
  });

  it("an earlier shared version and a later one with its approvers: the shared one only", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.request(); // the contractor asks for a new version while it is Shared (PW-30)
    s.addApprover("e");
    s.upload();
    expect(documentState(s.doc).state).toBe("WAITING_FOR_APPROVAL");
    expect(contractorView(s.doc)).toEqual({ shown: "VERSIONS", versionIds: ["v1"] });
    expect(seen(s.doc)).toEqual(["v1"]);
    s.decide("e", "APPROVED");
    expect(contractorView(s.doc)).toEqual({ shown: "VERSIONS", versionIds: ["v1", "v2"] });
  });

  it("remarks on the organisation's own versions stay with staff", () => {
    const s = story("ORGANISATION");
    s.addApprover("e");
    s.upload();
    s.decide("e", "APPROVED", "Fine");
    expect(contractorSeesRemarks(s.doc)).toBe(false);
  });

  it("never waits on the contractor", () => {
    const s = story("ORGANISATION");
    s.request();
    expect(waitingForContractor(s.doc)).toBe(false);
    s.addApprover("e");
    s.upload();
    s.decide("e", "REJECTED", "x");
    expect(waitingForContractor(s.doc)).toBe(false);
  });

  it("the versions are listed in number order, whatever order they were read in", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.request();
    s.upload();
    const d = { ...s.doc, versions: [...s.doc.versions].reverse() };
    expect(contractorView(d)).toEqual({ shown: "VERSIONS", versionIds: ["v1", "v2"] });
  });
});

describe("Waiting for you (PW-13)", () => {
  it("an open request to the contractor, or its own document rejected or returned; never shared, waiting for approval, received or final", () => {
    const s = story("CONTRACTOR");
    s.request();
    expect(waitingForContractor(s.doc)).toBe(true);
    s.addApprover("e");
    s.upload();
    expect(waitingForContractor(s.doc)).toBe(false);
    s.decide("e", "REJECTED", "x");
    expect(waitingForContractor(s.doc)).toBe(true);
    s.upload();
    s.decide("e", "APPROVED");
    expect(waitingForContractor(s.doc)).toBe(false);
    const k = story("CONTRACTOR");
    k.upload({ kind: "INTERIM_CLAIM" });
    expect(waitingForContractor(k.doc)).toBe(false);
    k.mark("RETURNED", "x");
    expect(waitingForContractor(k.doc)).toBe(true);
    const shared = story("CONTRACTOR");
    shared.upload();
    expect(waitingForContractor(shared.doc)).toBe(false);
  });
});

describe("contractorMayDownload (PW-14, D7)", () => {
  it("a visible version, both classifications set and neither SULIT", () => {
    for (const c of ["PUBLIC", "INTERNAL"] as const) expect(contractorMayDownload({ versionVisible: true, documentClassification: c, classClassification: "INTERNAL" })).toBe(true);
  });
  it("refused when the version is hidden, either classification is SULIT, or either is unset", () => {
    expect(contractorMayDownload({ versionVisible: false, documentClassification: "PUBLIC", classClassification: "PUBLIC" })).toBe(false);
    expect(contractorMayDownload({ versionVisible: true, documentClassification: "SULIT", classClassification: "PUBLIC" })).toBe(false);
    expect(contractorMayDownload({ versionVisible: true, documentClassification: "PUBLIC", classClassification: "SULIT" })).toBe(false);
    expect(contractorMayDownload({ versionVisible: true, documentClassification: null, classClassification: "PUBLIC" })).toBe(false);
    expect(contractorMayDownload({ versionVisible: true, documentClassification: "PUBLIC", classClassification: null })).toBe(false);
  });
});

describe("contractorFacts (PW-35): the projection of the facts every contractor reading is made from", () => {
  it("an organisation document loses its hidden versions, their decisions and the request answers they carry; its approvers stay only once the approved version is shown", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.request();
    s.addApprover("e");
    s.upload();
    s.decide("e", "REJECTED", "Wrong drawing");
    const p = contractorFacts(s.doc);
    expect(p.versions.map((v) => v.id)).toEqual(["v1"]);
    expect(p.decisions).toEqual([]);
    expect(p.approvers).toEqual([]);
    expect(p.requests.map((r) => r.answered)).toEqual([false]);
    expect(documentState(p).state).toBe("REQUESTED");
    s.upload();
    s.decide("e", "APPROVED");
    const approved = contractorFacts(s.doc);
    expect(approved.versions.map((v) => v.id)).toEqual(["v1", "v3"]);
    expect(approved.approvers.map((a) => a.personId)).toEqual(["e"]);
    expect(approved.decisions.map((d) => [d.versionId, d.outcome])).toEqual([["v3", "APPROVED"]]);
    // The request was answered by the hidden Version 2; the approved Version 3 that followed is what the contractor reads as its answer, so it is not left open for good.
    expect(approved.requests.map((r) => r.answered)).toEqual([true]);
    expect(contractorAnswer(s.doc, "v2")?.id).toBe("v3");
    expect(documentState(approved).state).toBe("APPROVED");
  });

  it("contractorAnswer: the answering version where it is seen, else the first seen after it, else none; never a hidden one", () => {
    const s = story("ORGANISATION");
    s.request();
    const v1 = s.upload();
    expect(contractorAnswer(s.doc, v1)?.id).toBe(v1);
    expect(contractorAnswer(s.doc, null)).toBeNull();
    expect(contractorAnswer(s.doc, "nowhere")).toBeNull();
    const t = story("ORGANISATION");
    t.request();
    t.addApprover("e");
    const hidden = t.upload();
    expect(contractorAnswer(t.doc, hidden)).toBeNull();
  });

  it("a contractor document is its own: the facts as they are", () => {
    const s = story("CONTRACTOR");
    s.addApprover("e");
    s.upload();
    s.decide("e", "REJECTED", "Redo");
    expect(contractorFacts(s.doc)).toBe(s.doc);
  });

  it("never shows more than contractorView: the projection's versions are exactly the visible ones, whatever the story", () => {
    const s = story("ORGANISATION");
    const check = () => {
      const v = contractorView(s.doc);
      const ids = v.shown === "VERSIONS" ? v.versionIds : [];
      expect(contractorFacts(s.doc).versions.map((x) => x.id)).toEqual([...ids]);
    };
    s.addApprover("e");
    s.request();
    check();
    s.upload();
    check();
    s.decide("e", "REJECTED", "No");
    check();
    s.upload();
    check();
    s.decide("e", "APPROVED");
    check();
  });
});
