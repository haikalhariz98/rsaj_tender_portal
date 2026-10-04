import { describe, expect, it } from "vitest";

import { claimState, decisionBasisFaults, liveDecisionsByScope, PART_A_LABEL, replacementFaultsOnScope, scopeKey, supersession, supersededNote, type ClaimFact } from "./basis";

/**
 * 6.13 Part B run 1b (613A-C2 (a)(1), (2) as approved, BD-613-89; FR-LAD-001, 011): the damages decision's basis, per
 * scope. Pure.
 */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const claim = (o: Partial<ClaimFact> = {}): ClaimFact => ({ id: "c1", reference: "CM/1", scope: "WHOLE", sectionRef: null, entitlement: null, closed: false, certified: false, ...o });

describe("an EOT claim's state for the damages decision", () => {
  it("open, entitled and uncertified, closed, certified", () => {
    expect(claimState(claim())).toBe("OPEN");
    expect(claimState(claim({ entitlement: "ENTITLED" }))).toBe("ENTITLED_UNCERTIFIED");
    expect(claimState(claim({ entitlement: "NOT_ENTITLED", closed: true }))).toBe("CLOSED");
    expect(claimState(claim({ entitlement: "ENTITLED", certified: true }))).toBe("CERTIFIED");
  });
});

describe("FR-LAD-001: the LAD path cannot open while a determination is outstanding or positive", () => {
  it("open claim blocks LAD_APPLIES, naming it", () => {
    const f = decisionBasisFaults({ outcome: "LAD_APPLIES", scope: "WHOLE", sectionRef: null, claims: [claim()], eotClaimId: null });
    expect(f).toEqual([{ code: "EOT_DETERMINATION_OUTSTANDING", level: "block", data: { claim: "CM/1", state: "OPEN" } }]);
  });
  it("an entitled, uncertified claim blocks it too; a certified or closed one does not", () => {
    expect(codes(decisionBasisFaults({ outcome: "LAD_APPLIES", scope: "WHOLE", sectionRef: null, claims: [claim({ entitlement: "ENTITLED" })], eotClaimId: null }))).toEqual(["EOT_DETERMINATION_OUTSTANDING"]);
    expect(decisionBasisFaults({ outcome: "LAD_APPLIES", scope: "WHOLE", sectionRef: null, claims: [claim({ entitlement: "ENTITLED", certified: true }), claim({ id: "c2", closed: true, entitlement: "NOT_ENTITLED" })], eotClaimId: null })).toEqual([]);
  });
  it("a claim on the whole works blocks every scope; a section's claim blocks that section and the whole works, not another section", () => {
    expect(codes(decisionBasisFaults({ outcome: "LAD_APPLIES", scope: "SECTION", sectionRef: "2", claims: [claim()], eotClaimId: null }))).toEqual(["EOT_DETERMINATION_OUTSTANDING"]);
    const s2 = claim({ scope: "SECTION", sectionRef: "2" });
    expect(codes(decisionBasisFaults({ outcome: "LAD_APPLIES", scope: "WHOLE", sectionRef: null, claims: [s2], eotClaimId: null }))).toEqual(["EOT_DETERMINATION_OUTSTANDING"]);
    expect(decisionBasisFaults({ outcome: "LAD_APPLIES", scope: "SECTION", sectionRef: "1", claims: [s2], eotClaimId: null })).toEqual([]);
  });
  it("EXCUSED_OR_PENDING without a claim refused; naming one neither open nor entitled refused; naming the open one passes", () => {
    expect(codes(decisionBasisFaults({ outcome: "EXCUSED_OR_PENDING", scope: "WHOLE", sectionRef: null, claims: [claim()], eotClaimId: null }))).toEqual(["EOT_CLAIM_REQUIRED"]);
    expect(codes(decisionBasisFaults({ outcome: "EXCUSED_OR_PENDING", scope: "WHOLE", sectionRef: null, claims: [claim({ closed: true })], eotClaimId: "c1" }))).toEqual(["EOT_CLAIM_NOT_OUTSTANDING"]);
    expect(codes(decisionBasisFaults({ outcome: "EXCUSED_OR_PENDING", scope: "WHOLE", sectionRef: null, claims: [], eotClaimId: "elsewhere" }))).toEqual(["EOT_CLAIM_NOT_OUTSTANDING"]);
    expect(decisionBasisFaults({ outcome: "EXCUSED_OR_PENDING", scope: "WHOLE", sectionRef: null, claims: [claim()], eotClaimId: "c1" })).toEqual([]);
  });
});

describe("FR-LAD-011: one live decision per scope", () => {
  const row = (id: string, scope: "WHOLE" | "SECTION" | null, sectionRef: string | null, replacesId: string | null = null, certificateStatus: string | null = "ISSUED") => ({ id, scope, sectionRef, replacesId, certificateStatus });
  it("each scope has its own live decision; a decision with no scope (Part A's excusable) reads as the whole works", () => {
    const live = liveDecisionsByScope([row("a", "WHOLE", null), row("b", "SECTION", "2"), row("c", "WHOLE", null, "a"), row("d", null, null)]);
    expect([...live].map(([k, v]) => [k, v.id])).toEqual([["WHOLE", "d"], ["SECTION:2", "b"]]);
  });
  it("a void certificate's decision is not live", () => {
    expect([...liveDecisionsByScope([row("a", "SECTION", "1", null, "VOID")])]).toEqual([]);
  });
  it("a further decision replaces its own scope's live one, with its reason; another scope's needs no replacement", () => {
    const live = liveDecisionsByScope([row("a", "WHOLE", null)]);
    expect(codes(replacementFaultsOnScope(live, "WHOLE", null, { replacesId: null, reason: "" }))).toEqual(["DECISION_ALREADY_LIVE"]);
    expect(replacementFaultsOnScope(live, "WHOLE", null, { replacesId: "a", reason: "The extension of time moved the date." })).toEqual([]);
    expect(replacementFaultsOnScope(live, "SECTION", "2", { replacesId: null, reason: "" })).toEqual([]);
    expect(scopeKey("SECTION", "2")).toBe("SECTION:2");
    expect(scopeKey("WHOLE", null)).toBe("WHOLE");
  });
});

describe("613A-C2 (a)(2) as amended (BD-613-89): supersession for later certificates only", () => {
  const sup = { eotNumber: "EOT/1", newDate: "2026-09-14" };
  it("a later valuation past the new date is refused NON_COMPLETION_SUPERSEDED, naming the EOT certificate", () => {
    expect(supersession(sup, "2026-09-30", "the whole works")).toEqual({ state: "REFUSED", fault: { code: "NON_COMPLETION_SUPERSEDED", level: "block", data: { scope: "the whole works", eotNumber: "EOT/1", day: "2026-09-14" } } });
  });
  it("no replacement is asked for when the extension moves the date past the valuation day", () => {
    expect(supersession(sup, "2026-09-14", "the whole works")).toEqual({ state: "CLOSED_BY_EXTENSION" });
    expect(supersession(sup, "2026-09-10", "the whole works")).toEqual({ state: "CLOSED_BY_EXTENSION" });
  });
  it("not superseded: nothing", () => expect(supersession(null, "2026-09-30", "x")).toEqual({ state: "LIVE" }));
  it("the note recorded at the issue, in both languages, by whether the new date is past", () => {
    expect(supersededNote("EOT/1", "2026-09-14", "2026-09-10").en).toBe("Closed by the extension of time EOT/1: the new date for completion 14 Sep 2026 is not yet past.");
    expect(supersededNote("EOT/1", "2026-09-14", "2026-09-20").en).toMatch(/^Superseded by the extension of time EOT\/1: a valuation past 14 Sep 2026 needs a replacement decision\.$/);
    expect(supersededNote("EOT/1", "2026-09-14", "2026-09-10").ms).toMatch(/Ditutup oleh lanjutan masa EOT\/1/);
  });
  it("a Part A decision is labelled as such", () => {
    expect(PART_A_LABEL.en).toBe("Entitlement determined on the non-completion decision, before extension-of-time records");
    expect(PART_A_LABEL.ms).toBe("Kelayakan diputuskan pada keputusan kerja tidak siap, sebelum rekod lanjutan masa");
  });
});
