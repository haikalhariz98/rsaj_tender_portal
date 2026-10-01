import { describe, expect, it } from "vitest";

import { attachFault, awardReliance, detachFault, reliedOn, ownerState, purposeFits, repinFault, type OwnerFacts } from "./attach";
import { documentFaultText } from "./labels";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const live = { withdrawnAt: null };
const internal = { classification: "INTERNAL" as const };
const minuted: OwnerFacts = { kind: "meeting", status: "MINUTED" };
const exercise = (x: Partial<Extract<OwnerFacts, { kind: "exercise" }>> = {}): OwnerFacts => ({ kind: "exercise", status: "DOCUMENTS_IN_PREPARATION", appointmentRouteOpen: false, awardApproved: false, ...x });
const award = (x: Partial<Extract<OwnerFacts, { kind: "award" }>> = {}): OwnerFacts => ({ kind: "award", status: "ISSUED", instrumentKind: "LETTER_OF_ACCEPTANCE", scansRequired: true, ...x });

describe("attaching: the purpose must suit the owner (CHECK in the migration, and here)", () => {
  it("signed minutes go on a meeting only; a return scan on an award only", () => {
    expect(codes(attachFault({ purpose: "SIGNED_MINUTES", owner: exercise(), version: live, documentClass: internal }))).toEqual(["PURPOSE_NOT_FOR_OWNER"]);
    expect(codes(attachFault({ purpose: "SIGNED_LETTER", owner: minuted, version: live, documentClass: internal }))).toEqual(["PURPOSE_NOT_FOR_OWNER"]);
    expect(attachFault({ purpose: "SIGNED_MINUTES", owner: minuted, version: live, documentClass: internal })).toEqual([]);
  });
  it("a Letter of Acceptance comes back as three scans; an appointment letter as its acceptance page", () => {
    expect(purposeFits("DECLARATION", award())).toBe(true);
    expect(purposeFits("ACCEPTANCE_PAGE", award())).toBe(false);
    expect(purposeFits("ACCEPTANCE_PAGE", award({ instrumentKind: "WORK_INDENT" }))).toBe(true);
    expect(purposeFits("SIGNED_LETTER", award({ instrumentKind: "WORK_INDENT" }))).toBe(false);
  });
});

describe("attaching: the owner must be ready and not frozen, with the way out named", () => {
  it("signed minutes only once the sitting is minuted; never on a cancelled one", () => {
    const f = attachFault({ purpose: "SIGNED_MINUTES", owner: { kind: "meeting", status: "IN_PROGRESS" }, version: live, documentClass: internal });
    expect(f).toEqual([{ code: "OWNER_NOT_READY", level: "block", data: { exit: "MINUTE_FIRST" } }]);
    expect(documentFaultText(f[0])).toMatch(/once the sitting is minuted/);
    expect(codes(attachFault({ purpose: "SIGNED_MINUTES", owner: { kind: "meeting", status: "CANCELLED" }, version: live, documentClass: internal }))).toEqual(["OWNER_FROZEN"]);
  });
  it("dossier evidence is not changed while the appointment route is open, nor once an award is approved", () => {
    const open = attachFault({ purpose: "DOSSIER_EVIDENCE", owner: exercise({ appointmentRouteOpen: true }), version: live, documentClass: internal });
    expect(open).toEqual([{ code: "OWNER_FROZEN", level: "block", data: { exit: "ROUTE_OPEN" } }]);
    const approved = attachFault({ purpose: "DOSSIER_EVIDENCE", owner: exercise({ awardApproved: true }), version: live, documentClass: internal });
    expect(approved[0].data?.exit).toBe("AWARD_APPROVED");
    expect(documentFaultText(approved[0])).toMatch(/cancel that award and open another/);
    expect(attachFault({ purpose: "DOSSIER_EVIDENCE", owner: exercise({ status: "DRAFT" }), version: live, documentClass: internal })).toEqual([]);
  });
  it("the coordination scope document is display only: attachable while the route is open, not once cancelled", () => {
    expect(attachFault({ purpose: "COORDINATION_SCOPE", owner: exercise({ appointmentRouteOpen: true, awardApproved: true }), version: live, documentClass: internal })).toEqual([]);
    expect(codes(attachFault({ purpose: "COORDINATION_SCOPE", owner: exercise({ status: "CANCELLED" }), version: live, documentClass: internal }))).toEqual(["OWNER_FROZEN"]);
  });
  it("return scans once the award is issued or accepted; not before, not once cancelled", () => {
    expect(attachFault({ purpose: "SIGNED_LETTER", owner: award({ status: "ACCEPTED" }), version: live, documentClass: internal })).toEqual([]);
    expect(attachFault({ purpose: "SIGNED_LETTER", owner: award({ status: "APPROVED" }), version: live, documentClass: internal })[0].data?.exit).toBe("AWARD_NOT_ISSUED");
    expect(attachFault({ purpose: "SIGNED_LETTER", owner: award({ status: "CANCELLED" }), version: live, documentClass: internal })[0].code).toBe("OWNER_FROZEN");
  });
  it("a recommendation is attached to a delegation that has not ended", () => {
    expect(attachFault({ purpose: "HOLDER_RECOMMENDATION", owner: { kind: "delegation", ended: false }, version: live, documentClass: internal })).toEqual([]);
    expect(codes(attachFault({ purpose: "HOLDER_RECOMMENDATION", owner: { kind: "delegation", ended: true }, version: live, documentClass: internal }))).toEqual(["OWNER_FROZEN"]);
  });
  it("every frozen or not-ready state names a way out", () => {
    const owners: OwnerFacts[] = [
      { kind: "meeting", status: "SCHEDULED" }, { kind: "meeting", status: "CANCELLED" }, exercise({ status: "CANCELLED" }), exercise({ appointmentRouteOpen: true }), exercise({ awardApproved: true }),
      award({ status: "DRAFT" }), award({ status: "CANCELLED" }), { kind: "delegation", ended: true },
    ];
    for (const o of owners) {
      const p = o.kind === "meeting" ? "SIGNED_MINUTES" : o.kind === "exercise" ? "DOSSIER_EVIDENCE" : o.kind === "award" ? "SIGNED_LETTER" : "HOLDER_RECOMMENDATION";
      const st = ownerState(p, o);
      expect(st.state).not.toBe("OPEN");
      const f = attachFault({ purpose: p, owner: o, version: live, documentClass: internal })[0];
      expect(documentFaultText(f)).not.toBe("This record takes no attachments now.");
    }
  });
});

describe("attaching: the version and the class", () => {
  it("a withdrawn version is not attached", () => {
    expect(codes(attachFault({ purpose: "SIGNED_MINUTES", owner: minuted, version: { withdrawnAt: new Date() }, documentClass: internal }))).toEqual(["VERSION_WITHDRAWN"]);
  });
  it("no class refuses (OD-7); an unset classification only warns, and says it will not be served", () => {
    expect(codes(attachFault({ purpose: "SIGNED_MINUTES", owner: minuted, version: live, documentClass: null }))).toEqual(["CLASS_NOT_SET"]);
    const w = attachFault({ purpose: "SIGNED_MINUTES", owner: minuted, version: live, documentClass: { classification: null } });
    expect(w).toEqual([{ code: "CLASSIFICATION_NOT_SET", level: "warn" }]);
    expect(documentFaultText(w[0])).toMatch(/not opened in the portal/);
    // The document's own classification, set since, is what counts.
    expect(attachFault({ purpose: "SIGNED_MINUTES", owner: minuted, version: live, documentClass: { classification: null }, documentClassification: "INTERNAL" })).toEqual([]);
  });
  it("the same document is not attached twice for the same purpose", () => {
    expect(codes(attachFault({ purpose: "SIGNED_MINUTES", owner: minuted, version: live, documentClass: internal, alreadyAttached: true }))).toEqual(["ALREADY_ATTACHED"]);
  });
});

describe("detaching (with a reason) and re-pinning a new version (OD-8)", () => {
  it("a reason is required", () => {
    expect(codes(detachFault({ purpose: "SIGNED_MINUTES", owner: minuted, reason: " ", reliedOn: null }))).toEqual(["REASON_REQUIRED"]);
    expect(detachFault({ purpose: "SIGNED_MINUTES", owner: minuted, reason: "Wrong sitting's minutes", reliedOn: null })).toEqual([]);
  });
  it("not from a frozen owner: the dossier an open route was sent on stays", () => {
    expect(codes(detachFault({ purpose: "DOSSIER_EVIDENCE", owner: exercise({ appointmentRouteOpen: true }), reason: "x", reliedOn: null }))).toEqual(["OWNER_FROZEN"]);
  });
  it("an award accepted on its scans keeps them: only a new version replaces one (BD-24 correction)", () => {
    const accepted = award({ status: "ACCEPTED" });
    expect(awardReliance("DECLARATION", accepted)).toBe("ACCEPTED_ON_IT");
    const f = detachFault({ purpose: "DECLARATION", owner: accepted, reason: "Wrong page", reliedOn: awardReliance("DECLARATION", accepted) });
    expect(codes(f)).toEqual(["RELIED_ON"]);
    expect(documentFaultText(f[0])).toMatch(/attach a new version/);
  });
  it("an award accepted before scans were required relied on none: a scan comes off as a correction, with its reason", () => {
    const legacy = award({ status: "ACCEPTED", scansRequired: false });
    expect(awardReliance("DECLARATION", legacy)).toBeNull();
    expect(detachFault({ purpose: "DECLARATION", owner: legacy, reason: "Scanned the wrong award's declaration", reliedOn: null })).toEqual([]);
    // An issued award not yet accepted relied on nothing either.
    expect(awardReliance("DECLARATION", award())).toBeNull();
  });
  it("an attachment already off is not taken off again", () => {
    expect(codes(detachFault({ purpose: "SIGNED_MINUTES", owner: minuted, reason: "x", reliedOn: null, detachedAt: new Date() }))).toEqual(["ALREADY_DETACHED"]);
  });
  it("a new version re-pins with a reason, on the same document, unless the owner is frozen", () => {
    const at = { detachedAt: null, versionId: "v1", documentId: "d1" };
    expect(repinFault({ purpose: "SIGNED_MINUTES", owner: minuted, reason: "Clearer scan", attachment: at, to: { id: "v2", documentId: "d1", withdrawnAt: null } })).toEqual([]);
    expect(codes(repinFault({ purpose: "SIGNED_MINUTES", owner: minuted, reason: "", attachment: at, to: { id: "v2", documentId: "d1", withdrawnAt: null } }))).toEqual(["REASON_REQUIRED"]);
    expect(codes(repinFault({ purpose: "SIGNED_MINUTES", owner: minuted, reason: "x", attachment: at, to: { id: "v9", documentId: "d2", withdrawnAt: null } }))).toEqual(["NOT_SAME_DOCUMENT"]);
    expect(codes(repinFault({ purpose: "SIGNED_MINUTES", owner: minuted, reason: "x", attachment: at, to: { id: "v1", documentId: "d1", withdrawnAt: null } }))).toEqual(["ALREADY_PINNED"]);
    expect(codes(repinFault({ purpose: "DOSSIER_EVIDENCE", owner: exercise({ awardApproved: true }), reason: "x", attachment: at, to: { id: "v2", documentId: "d1", withdrawnAt: null } }))).toEqual(["OWNER_FROZEN"]);
    expect(codes(repinFault({ purpose: "SIGNED_MINUTES", owner: minuted, reason: "x", attachment: at, to: { id: "v2", documentId: "d1", withdrawnAt: new Date() } }))).toEqual(["VERSION_WITHDRAWN"]);
  });
  it("an accepted award's scan is replaced by a new version (the correction path)", () => {
    expect(repinFault({ purpose: "DECLARATION", owner: award({ status: "ACCEPTED" }), reason: "Clearer scan", attachment: { detachedAt: null, versionId: "v1", documentId: "d1" }, to: { id: "v2", documentId: "d1", withdrawnAt: null } })).toEqual([]);
  });
});

describe("what is relied on is one rule for the act and the screen", () => {
  it("the last live scan of an accepted award, and the last live recommendation, are relied on; a duplicate is not", () => {
    const accepted = award({ status: "ACCEPTED" });
    expect(reliedOn("DECLARATION", accepted, 1)).toBe("ACCEPTED_ON_IT");
    expect(reliedOn("DECLARATION", accepted, 2)).toBeNull();
    expect(reliedOn("DECLARATION", award(), 1)).toBeNull();
    expect(reliedOn("HOLDER_RECOMMENDATION", { kind: "delegation", ended: false }, 1)).toBe("GRANTED_ON_IT");
    expect(reliedOn("HOLDER_RECOMMENDATION", { kind: "delegation", ended: false }, 2)).toBeNull();
    expect(reliedOn("SIGNED_MINUTES", minuted, 1)).toBeNull();
    expect(reliedOn("DOSSIER_EVIDENCE", exercise(), 1)).toBeNull();
  });
});
