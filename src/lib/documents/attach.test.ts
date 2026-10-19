import { describe, expect, it } from "vitest";

import { attachFault, awardReliance, detachFault, exerciseFrozen, exercisePurposes, methodKeeps, reliedOn, reliedOnAttachment, ownerState, purposeFits, repinFault, type OwnerFacts } from "./attach";
import { documentFaultText } from "./labels";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const live = { withdrawnAt: null };
const internal = { classification: "INTERNAL" as const };
const minuted: OwnerFacts = { kind: "meeting", status: "MINUTED" };
// By default the exercise's method keeps both a dossier and a scope document, so the owner-state tests below judge only what they name.
const exercise = (x: Partial<Extract<OwnerFacts, { kind: "exercise" }>> = {}): OwnerFacts => ({ kind: "exercise", status: "DOCUMENTS_IN_PREPARATION", appointmentRouteOpen: false, awardApproved: false, method: { requiresDossier: true, requiresCoordinationRecord: true }, ...x });
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

describe("attaching: an exercise keeps only what its sourcing method asks for", () => {
  const dossierOnly = { requiresDossier: true, requiresCoordinationRecord: false };
  const scopeOnly = { requiresDossier: false, requiresCoordinationRecord: true };
  const neither = { requiresDossier: false, requiresCoordinationRecord: false };
  const attach = (purpose: "DOSSIER_EVIDENCE" | "COORDINATION_SCOPE", method: Extract<OwnerFacts, { kind: "exercise" }>["method"]) =>
    attachFault({ purpose, owner: exercise({ status: "DRAFT", method }), version: live, documentClass: internal });

  it("dossier evidence only where the method keeps a justification dossier", () => {
    expect(attach("DOSSIER_EVIDENCE", dossierOnly)).toEqual([]);
    const f = attach("DOSSIER_EVIDENCE", scopeOnly);
    expect(f).toEqual([{ code: "PURPOSE_NOT_FOR_METHOD", level: "block", data: { purpose: "DOSSIER_EVIDENCE", reason: "METHOD_DOES_NOT_ASK" } }]);
    expect(documentFaultText(f[0])).toMatch(/^Dossier evidence not kept here: the method does not keep a justification dossier\./);
    expect(codes(attach("DOSSIER_EVIDENCE", neither))).toEqual(["PURPOSE_NOT_FOR_METHOD"]);
  });
  it("the coordination scope document only where the method records a coordination meeting", () => {
    expect(attach("COORDINATION_SCOPE", scopeOnly)).toEqual([]);
    const f = attach("COORDINATION_SCOPE", dossierOnly);
    expect(codes(f)).toEqual(["PURPOSE_NOT_FOR_METHOD"]);
    expect(documentFaultText(f[0])).toMatch(/the method does not record a coordination meeting/);
    expect(codes(attach("COORDINATION_SCOPE", neither))).toEqual(["PURPOSE_NOT_FOR_METHOD"]);
  });
  it("a method no longer configured keeps nothing, and says so rather than claiming it asks for nothing", () => {
    for (const p of ["DOSSIER_EVIDENCE", "COORDINATION_SCOPE"] as const) {
      const f = attach(p, null);
      expect(f).toEqual([{ code: "PURPOSE_NOT_FOR_METHOD", level: "block", data: { purpose: p, reason: "METHOD_NOT_CONFIGURED" } }]);
      expect(documentFaultText(f[0])).toMatch(/no longer configured/);
    }
  });
  it("a method that keeps both takes both", () => {
    expect(attach("DOSSIER_EVIDENCE", { requiresDossier: true, requiresCoordinationRecord: true })).toEqual([]);
    expect(attach("COORDINATION_SCOPE", { requiresDossier: true, requiresCoordinationRecord: true })).toEqual([]);
  });
  it("is judged before the owner's state: a frozen exercise still says the method is why", () => {
    expect(codes(attachFault({ purpose: "DOSSIER_EVIDENCE", owner: exercise({ status: "CANCELLED", method: scopeOnly }), version: live, documentClass: internal }))).toEqual(["PURPOSE_NOT_FOR_METHOD"]);
  });
  it("methodKeeps is exercisePurposes for an exercise, and true for every other owner", () => {
    for (const method of [dossierOnly, scopeOnly, neither, null]) {
      for (const p of ["DOSSIER_EVIDENCE", "COORDINATION_SCOPE"] as const) expect(methodKeeps(p, exercise({ method }))).toBe(exercisePurposes(method).includes(p));
    }
    expect(methodKeeps("SIGNED_MINUTES", minuted)).toBe(true);
    expect(methodKeeps("SIGNED_LETTER", award())).toBe(true);
    expect(methodKeeps("HOLDER_RECOMMENDATION", { kind: "delegation", ended: false })).toBe(true);
  });
  it("detach and re-pin are not judged by it: what an exercise holds can still come off after its draft method changes", () => {
    expect(detachFault({ purpose: "DOSSIER_EVIDENCE", owner: exercise({ status: "DRAFT", method: scopeOnly }), reason: "Method changed", reliedOn: null })).toEqual([]);
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
    expect(documentFaultText(approved[0])).toMatch(/Cancel that award/);
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
    expect(documentFaultText(f[0])).toMatch(/Attach a new version/);
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

describe("only a live attachment is relied on (review carry 5)", () => {
  const W = new Date("2026-09-30T00:00:00.000Z");
  const accepted = award({ status: "ACCEPTED" });
  const recommendation: OwnerFacts = { kind: "delegation", ended: false };
  it("a live last scan of an accepted award, and a live last recommendation, are relied on", () => {
    expect(reliedOnAttachment({ detachedAt: null, version: { withdrawnAt: null } }, () => reliedOn("DECLARATION", accepted, 1))).toBe("ACCEPTED_ON_IT");
    expect(reliedOnAttachment({ detachedAt: null, version: { withdrawnAt: null } }, () => reliedOn("HOLDER_RECOMMENDATION", recommendation, 1))).toBe("GRANTED_ON_IT");
  });
  it("a pin whose version was withdrawn is not, though no live one remains (the count is 0)", () => {
    expect(reliedOn("DECLARATION", accepted, 0)).toBe("ACCEPTED_ON_IT"); // what the act asked before
    expect(reliedOnAttachment({ detachedAt: null, version: { withdrawnAt: W } }, () => reliedOn("DECLARATION", accepted, 0))).toBeNull();
    expect(reliedOnAttachment({ detachedAt: null, version: { withdrawnAt: W } }, () => reliedOn("HOLDER_RECOMMENDATION", recommendation, 0))).toBeNull();
  });
  it("so detachFault lets the withdrawn pin come off with a reason, and still refuses the live last one", () => {
    const withdrawn = reliedOnAttachment({ detachedAt: null, version: { withdrawnAt: W } }, () => reliedOn("DECLARATION", accepted, 0));
    expect(detachFault({ purpose: "DECLARATION", owner: accepted, reason: "Version withdrawn; taking the pin off", reliedOn: withdrawn })).toEqual([]);
    const live = reliedOnAttachment({ detachedAt: null, version: { withdrawnAt: null } }, () => reliedOn("DECLARATION", accepted, 1));
    expect(codes(detachFault({ purpose: "DECLARATION", owner: accepted, reason: "Wrong page", reliedOn: live }))).toEqual(["RELIED_ON"]);
  });
  it("one already off is not relied on either, and the owner's rule is not asked", () => {
    let asked = false;
    expect(reliedOnAttachment({ detachedAt: W, version: { withdrawnAt: null } }, () => ((asked = true), "ACCEPTED_ON_IT"))).toBeNull();
    expect(asked).toBe(false);
  });
});

// SR-08, SR-09 (rulings 12 and 13): the owner facts of a panel and of a bill version carry the exercise's pin. The cases below are of an exercise that uses both, which is what every exercise before the pins was backfilled to; the pinned-off and not-set cases are at the end.
describe("6.2 Q-1: the signed specification panel form, on its panel, SULIT", () => {
  const panel = (x: Partial<Extract<OwnerFacts, { kind: "specificationPanel" }>> = {}): OwnerFacts => ({ kind: "specificationPanel", used: true, exerciseStatus: "DRAFT", status: "DRAFT", verifiedScanVersionIds: [], liveScanVersionIds: [], ...x });
  const sulit = { classification: "SULIT" as const };

  it("belongs on a panel only, and a panel takes nothing else", () => {
    expect(purposeFits("SPEC_PANEL_FORM", panel())).toBe(true);
    expect(purposeFits("SPEC_PANEL_FORM", exercise())).toBe(false);
    expect(purposeFits("DOSSIER_EVIDENCE", panel())).toBe(false);
    expect(methodKeeps("SPEC_PANEL_FORM", panel())).toBe(true);
  });
  it("attached only when the document is SULIT: Internal, Public and unset are refused, naming the way out", () => {
    expect(attachFault({ purpose: "SPEC_PANEL_FORM", owner: panel(), version: live, documentClass: sulit })).toEqual([]);
    const f = attachFault({ purpose: "SPEC_PANEL_FORM", owner: panel(), version: live, documentClass: internal });
    expect(f).toEqual([{ code: "CLASSIFICATION_BELOW_PURPOSE", level: "block", data: { purpose: "SPEC_PANEL_FORM", required: "SULIT", classification: "INTERNAL" } }]);
    expect(documentFaultText(f[0])).toBe("Signed specification panel form is kept SULIT, and this document is Internal. Raise its classification to SULIT on the document, or upload it again under a class classified SULIT.");
    expect(codes(attachFault({ purpose: "SPEC_PANEL_FORM", owner: panel(), version: live, documentClass: sulit, documentClassification: "PUBLIC" }))).toEqual(["CLASSIFICATION_BELOW_PURPOSE"]);
    expect(codes(attachFault({ purpose: "SPEC_PANEL_FORM", owner: panel(), version: live, documentClass: { classification: null } }))).toEqual(["CLASSIFICATION_NOT_SET", "CLASSIFICATION_BELOW_PURPOSE"]);
    // The document's own (raised) classification is what counts, not its class's.
    expect(attachFault({ purpose: "SPEC_PANEL_FORM", owner: panel(), version: live, documentClass: internal, documentClassification: "SULIT" })).toEqual([]);
    // Other purposes are untouched by the rule.
    expect(attachFault({ purpose: "SIGNED_MINUTES", owner: minuted, version: live, documentClass: { classification: "PUBLIC" } })).toEqual([]);
  });
  it("a cancelled exercise's panel takes nothing more", () => {
    expect(ownerState("SPEC_PANEL_FORM", panel({ exerciseStatus: "CANCELLED" }))).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
    expect(ownerState("SPEC_PANEL_FORM", panel({ exerciseStatus: "DOCUMENTS_IN_PREPARATION", status: "VERIFIED" }))).toEqual({ state: "OPEN" });
  });
  it("a verified panel stands on its last live scan: replaced by a new version, never simply taken off", () => {
    // BD-62-26: the scan is the one the panel's snapshot names (s1), live.
    const onS1 = { verifiedScanVersionIds: ["s1"], liveScanVersionIds: ["s1"] };
    expect(reliedOn("SPEC_PANEL_FORM", panel({ status: "VERIFIED", ...onS1 }), 1, "s1")).toBe("VERIFIED_ON_IT");
    expect(reliedOn("SPEC_PANEL_FORM", panel({ status: "VERIFIED", verifiedScanVersionIds: ["s1", "s2"], liveScanVersionIds: ["s1", "s2"] }), 2, "s1")).toBeNull();
    expect(reliedOn("SPEC_PANEL_FORM", panel({ status: "DRAFT", ...onS1 }), 1, "s1")).toBeNull();
    const f = detachFault({ purpose: "SPEC_PANEL_FORM", owner: panel({ status: "VERIFIED" }), reason: "wrong file", reliedOn: "VERIFIED_ON_IT" });
    expect(codes(f)).toEqual(["RELIED_ON"]);
    expect(documentFaultText(f[0])).toMatch(/^Panel verified on this scan/);
    // BD-62-26: the words say a new version leaves the panel to be verified again, never that it carries the verification over.
    expect(documentFaultText(f[0])).toMatch(/new version.*verified again/);
  });
});

describe("BD-62-26: a verified panel relies only on the live scan its snapshot names", () => {
  const panel = (x: Partial<Extract<OwnerFacts, { kind: "specificationPanel" }>> = {}): OwnerFacts => ({ kind: "specificationPanel", used: true, exerciseStatus: "DRAFT", status: "VERIFIED", verifiedScanVersionIds: ["snap"], liveScanVersionIds: [], ...x });
  it("the snapshot scan is refused even beside a live scan the panel was never verified on", () => {
    // Two live scans of the purpose: the old count rule let either come off. The snapshot one may not.
    const owner = panel({ liveScanVersionIds: ["snap", "later"] });
    expect(reliedOn("SPEC_PANEL_FORM", owner, 2, "snap")).toBe("VERIFIED_ON_IT");
    const f = detachFault({ purpose: "SPEC_PANEL_FORM", owner, reason: "wrong file", reliedOn: reliedOnAttachment({ detachedAt: null, version: { withdrawnAt: null } }, () => reliedOn("SPEC_PANEL_FORM", owner, 2, "snap")) });
    expect(codes(f)).toEqual(["RELIED_ON"]);
    // The scan it was never verified on, a later version of the same document included, is not relied on.
    expect(reliedOn("SPEC_PANEL_FORM", owner, 2, "later")).toBeNull();
  });
  it("on a SCAN_GONE panel (no scan it names is live) a non-snapshot scan comes off freely", () => {
    const gone = panel({ liveScanVersionIds: ["later"] });
    expect(reliedOn("SPEC_PANEL_FORM", gone, 1, "later")).toBeNull();
    const f = detachFault({ purpose: "SPEC_PANEL_FORM", owner: gone, reason: "wrong file", reliedOn: reliedOnAttachment({ detachedAt: null, version: { withdrawnAt: null } }, () => reliedOn("SPEC_PANEL_FORM", gone, 1, "later")) });
    expect(f).toEqual([]);
  });
  it("a malformed or missing snapshot names nothing, so nothing is relied on", () => {
    expect(reliedOn("SPEC_PANEL_FORM", panel({ verifiedScanVersionIds: [], liveScanVersionIds: ["a"] }), 1, "a")).toBeNull();
  });
  it("asked without the attachment's version, it fails safe while a named scan is live", () => {
    expect(reliedOn("SPEC_PANEL_FORM", panel({ liveScanVersionIds: ["snap"] }), 1)).toBe("VERIFIED_ON_IT");
    expect(reliedOn("SPEC_PANEL_FORM", panel({ liveScanVersionIds: ["later"] }), 1)).toBeNull();
  });
  it("panelFacts reads the names from the snapshot and the live scans from the attachments", async () => {
    const { panelFacts } = await import("./owner-facts");
    const W = new Date("2026-09-30T00:00:00Z");
    const facts = panelFacts({
      status: "VERIFIED",
      exercise: { status: "DOCUMENTS_IN_PREPARATION", specPanelUsed: true },
      verifiedSnapshot: { scans: [{ versionId: "snap" }] },
      attachments: [
        { purpose: "SPEC_PANEL_FORM", versionId: "snap", detachedAt: null, version: { withdrawnAt: null } },
        { purpose: "SPEC_PANEL_FORM", versionId: "off", detachedAt: W, version: { withdrawnAt: null } },
        { purpose: "SPEC_PANEL_FORM", versionId: "withdrawn", detachedAt: null, version: { withdrawnAt: W } },
      ],
    });
    expect(facts).toMatchObject({ verifiedScanVersionIds: ["snap"], liveScanVersionIds: ["snap"] });
  });
});

describe("6.2 Q-3: a bill's imported CSV, on the bill version, attached only by the import", () => {
  const bq = (x: Partial<Extract<OwnerFacts, { kind: "bqVersion" }>> = {}): OwnerFacts => ({ kind: "bqVersion", onScreen: true, exerciseStatus: "DRAFT", status: "DRAFT", ...x });

  it("belongs on a bill version only, and a bill version takes nothing else", () => {
    expect(purposeFits("BQ_IMPORT_SOURCE", bq())).toBe(true);
    expect(purposeFits("BQ_IMPORT_SOURCE", exercise())).toBe(false);
    expect(purposeFits("SPEC_PANEL_FORM", bq())).toBe(false);
  });
  it("is refused from anywhere but the import, naming where to import it", () => {
    const f = attachFault({ purpose: "BQ_IMPORT_SOURCE", owner: bq(), version: live, documentClass: internal });
    expect(f).toEqual([{ code: "ATTACHED_BY_OWNER_ACT", level: "block", data: { purpose: "BQ_IMPORT_SOURCE" } }]);
    expect(documentFaultText(f[0])).toMatch(/attached by the bill import/);
    expect(attachFault({ purpose: "BQ_IMPORT_SOURCE", owner: bq(), version: live, documentClass: internal, byOwnerAct: true })).toEqual([]);
  });
  it("takes any classification the officer chose (doc-store OD-7): no purpose floor", () => {
    expect(attachFault({ purpose: "BQ_IMPORT_SOURCE", owner: bq(), version: live, documentClass: { classification: "PUBLIC" }, byOwnerAct: true })).toEqual([]);
    expect(attachFault({ purpose: "BQ_IMPORT_SOURCE", owner: bq(), version: live, documentClass: { classification: "SULIT" }, byOwnerAct: true })).toEqual([]);
  });
  it("a draft is open; a finalised or superseded version keeps its file; a cancelled exercise takes nothing", () => {
    expect(ownerState("BQ_IMPORT_SOURCE", bq())).toEqual({ state: "OPEN" });
    expect(ownerState("BQ_IMPORT_SOURCE", bq({ status: "FINALISED" }))).toEqual({ state: "FROZEN", exit: "BQ_FINALISED" });
    expect(ownerState("BQ_IMPORT_SOURCE", bq({ status: "SUPERSEDED" }))).toEqual({ state: "FROZEN", exit: "BQ_FINALISED" });
    expect(ownerState("BQ_IMPORT_SOURCE", bq({ exerciseStatus: "CANCELLED" }))).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
    const f = attachFault({ purpose: "BQ_IMPORT_SOURCE", owner: bq({ status: "FINALISED" }), version: live, documentClass: internal, byOwnerAct: true });
    expect(codes(f)).toEqual(["OWNER_FROZEN"]);
    expect(documentFaultText(f[0])).toMatch(/Start a revision/);
  });
  it("every imported file is relied on, even beside another: replaced by a new version, never simply taken off", () => {
    expect(reliedOn("BQ_IMPORT_SOURCE", bq(), 1)).toBe("IMPORTED_FROM_IT");
    expect(reliedOn("BQ_IMPORT_SOURCE", bq(), 2)).toBe("IMPORTED_FROM_IT");
    const f = detachFault({ purpose: "BQ_IMPORT_SOURCE", owner: bq(), reason: "wrong file", reliedOn: "IMPORTED_FROM_IT" });
    expect(codes(f)).toEqual(["RELIED_ON"]);
    expect(documentFaultText(f[0])).toMatch(/^Bill lines were imported from this file/);
  });
  it("is never re-pinned to another version: the bill is corrected by importing again", () => {
    const f = repinFault({ purpose: "BQ_IMPORT_SOURCE", owner: bq(), reason: "corrected", attachment: { detachedAt: null, versionId: "v1", documentId: "d1" }, to: { id: "v2", documentId: "d1", withdrawnAt: null } });
    expect(codes(f)).toEqual(["ATTACHED_BY_OWNER_ACT"]);
    // Other purposes re-pin as before.
    expect(repinFault({ purpose: "SPEC_PANEL_FORM", owner: { kind: "specificationPanel", used: true, exerciseStatus: "DRAFT", status: "DRAFT", verifiedScanVersionIds: [], liveScanVersionIds: [] }, reason: "corrected", attachment: { detachedAt: null, versionId: "v1", documentId: "d1" }, to: { id: "v2", documentId: "d1", withdrawnAt: null } })).toEqual([]);
  });
});

describe("X-8: an exercise's status freezes it, its panel and its bill alike, every status decided", () => {
  it("only a cancelled exercise is frozen", () => {
    expect(exerciseFrozen("DRAFT")).toBe(false);
    expect(exerciseFrozen("DOCUMENTS_IN_PREPARATION")).toBe(false);
    expect(exerciseFrozen("CANCELLED")).toBe(true);
  });
  it("the panel and the bill version read the exercise's status through it", () => {
    for (const exerciseStatus of ["DRAFT", "DOCUMENTS_IN_PREPARATION"] as const) {
      expect(ownerState("SPEC_PANEL_FORM", { kind: "specificationPanel", used: true, exerciseStatus, status: "VERIFIED", verifiedScanVersionIds: [], liveScanVersionIds: [] })).toEqual({ state: "OPEN" });
      expect(ownerState("BQ_IMPORT_SOURCE", { kind: "bqVersion", onScreen: true, exerciseStatus, status: "DRAFT" })).toEqual({ state: "OPEN" });
    }
    expect(ownerState("SPEC_PANEL_FORM", { kind: "specificationPanel", used: true, exerciseStatus: "CANCELLED", status: "DRAFT", verifiedScanVersionIds: [], liveScanVersionIds: [] })).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
    expect(ownerState("BQ_IMPORT_SOURCE", { kind: "bqVersion", onScreen: true, exerciseStatus: "CANCELLED", status: "DRAFT" })).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
  });
});

describe("6.4 (BD-64-4, ADR 0013): the panel stands frozen with the tender pack submitted on it", () => {
  const panel = (exerciseStatus: "PENDING_APPROVAL_FOR_TENDERING" | "APPROVED_FOR_TENDERING"): OwnerFacts => ({ kind: "specificationPanel", used: true, exerciseStatus, status: "VERIFIED", verifiedScanVersionIds: ["v1"], liveScanVersionIds: ["v1"] });
  const filed = { version: { withdrawnAt: null }, documentClass: { classification: "SULIT" as const } };
  for (const exerciseStatus of ["PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING"] as const) {
    it(`${exerciseStatus}: frozen, saying the pack froze on it`, () => {
      expect(ownerState("SPEC_PANEL_FORM", panel(exerciseStatus))).toEqual({ state: "FROZEN", exit: "PACK_FROZEN" });
    });
    it(`${exerciseStatus}: no new version of the verified scan is attached`, () => {
      expect(attachFault({ purpose: "SPEC_PANEL_FORM", owner: panel(exerciseStatus), ...filed }).map((f) => f.code)).toEqual(["OWNER_FROZEN"]);
    });
    it(`${exerciseStatus}: the verified scan is not re-pinned to another version`, () => {
      expect(repinFault({ purpose: "SPEC_PANEL_FORM", owner: panel(exerciseStatus), reason: "corrected", attachment: { detachedAt: null, versionId: "v1", documentId: "d1" }, to: { id: "v2", documentId: "d1", withdrawnAt: null } }).map((f) => f.code)).toEqual(["OWNER_FROZEN"]);
    });
    it(`${exerciseStatus}: nor taken off`, () => {
      expect(detachFault({ purpose: "SPEC_PANEL_FORM", owner: panel(exerciseStatus), reason: "wrong scan", reliedOn: null }).map((f) => f.code)).toEqual(["OWNER_FROZEN"]);
    });
  }
  it("open again once the documents are returned for amendment (the exercise is back in preparation)", () => {
    expect(ownerState("SPEC_PANEL_FORM", { ...panel("PENDING_APPROVAL_FOR_TENDERING"), exerciseStatus: "DOCUMENTS_IN_PREPARATION" } as OwnerFacts)).toEqual({ state: "OPEN" });
  });
});

describe("SR-08, SR-09: an exercise pinned not to use a panel, or not to build its bill on screen, keeps none (rulings 12 and 13)", () => {
  const panel = (used: boolean | null): OwnerFacts => ({ kind: "specificationPanel", used, exerciseStatus: "DOCUMENTS_IN_PREPARATION", status: "DRAFT", verifiedScanVersionIds: [], liveScanVersionIds: [] });
  const bq = (onScreen: boolean | null): OwnerFacts => ({ kind: "bqVersion", onScreen, exerciseStatus: "DOCUMENTS_IN_PREPARATION", status: "DRAFT" });
  it("a panel is open on an exercise that uses one, closed on one that does not, and not ready where the pin is not set", () => {
    expect(ownerState("SPEC_PANEL_FORM", panel(true))).toEqual({ state: "OPEN" });
    expect(ownerState("SPEC_PANEL_FORM", panel(false))).toEqual({ state: "FROZEN", exit: "PANEL_NOT_USED" });
    expect(ownerState("SPEC_PANEL_FORM", panel(null))).toEqual({ state: "NOT_READY", exit: "SWITCH_NOT_SET" });
    const f = attachFault({ purpose: "SPEC_PANEL_FORM", owner: panel(false), version: live, documentClass: { classification: "SULIT" } });
    expect(codes(f)).toEqual(["OWNER_FROZEN"]);
    expect(documentFaultText(f[0])).toMatch(/does not use a specification panel/);
  });
  it("a bill version is open on an exercise that builds one on screen, closed on one that does not, and not ready where the pin is not set", () => {
    expect(ownerState("BQ_IMPORT_SOURCE", bq(true))).toEqual({ state: "OPEN" });
    expect(ownerState("BQ_IMPORT_SOURCE", bq(false))).toEqual({ state: "FROZEN", exit: "BILL_NOT_ON_SCREEN" });
    expect(ownerState("BQ_IMPORT_SOURCE", bq(null))).toEqual({ state: "NOT_READY", exit: "SWITCH_NOT_SET" });
    expect(documentFaultText(attachFault({ purpose: "BQ_IMPORT_SOURCE", owner: bq(false), version: live, documentClass: internal, byOwnerAct: true })[0])).toMatch(/does not build its bill of quantities on screen/);
  });
});
