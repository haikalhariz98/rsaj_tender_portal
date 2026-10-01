import { describe, expect, it } from "vitest";

import { scopeFaultText } from "./labels";
import { packFaults, type PackInput } from "./pack";
import { scopeApproval } from "./scope-matter";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const ready: PackInput = { basis: { requiresBq: true }, method: { requiresCompanyEstimate: true }, bq: [{ status: "FINALISED" }], panel: "VERIFIED", panelBill: { versionNo: 1, status: "FINALISED" }, estimate: { state: "LODGED", behind: false }, scope: "APPROVED" };
const judge = (x: Partial<PackInput> = {}) => packFaults({ ...ready, ...x });

describe("packFaults: what 6.4 enforces when the documents go for approval (OD-4)", () => {
  it("a finalised bill, a verified panel and a lodged estimate: ready", () => {
    expect(judge()).toEqual([]);
    expect(judge({ estimate: { state: "DISCLOSED", behind: false } })).toEqual([]);
  });
  it("BQ_NOT_FINALISED where the basis is let on a bill; a draft revision beside a finalised one only warns", () => {
    expect(codes(judge({ bq: [] }))).toEqual(["BQ_NOT_FINALISED"]);
    expect(codes(judge({ bq: [{ status: "DRAFT" }] }))).toEqual(["BQ_NOT_FINALISED"]);
    expect(judge({ bq: [{ status: "SUPERSEDED" }, { status: "FINALISED" }, { status: "DRAFT" }] })).toEqual([{ code: "BQ_REVISION_OPEN", level: "warn" }]);
    expect(judge({ basis: { requiresBq: false }, bq: [] })).toEqual([]);
  });
  it("OD-6/OD-9 style three-state: an unset rule blocks naming it, never reads as not needed", () => {
    expect(codes(judge({ basis: { requiresBq: null }, bq: [] }))).toEqual(["BASIS_BQ_NOT_SET"]);
    expect(codes(judge({ basis: null }))).toEqual(["BASIS_NOT_CHOSEN"]);
    expect(codes(judge({ method: { requiresCompanyEstimate: null }, estimate: null }))).toEqual(["ESTIMATE_RULE_NOT_SET"]);
    expect(codes(judge({ method: null }))).toEqual(["METHOD_NOT_CONFIGURED"]);
  });
  it("PANEL_NOT_VERIFIED for none or a draft; a verified panel whose scan has gone says so", () => {
    expect(codes(judge({ panel: "NONE" }))).toEqual(["PANEL_NOT_VERIFIED"]);
    expect(codes(judge({ panel: "DRAFT" }))).toEqual(["PANEL_NOT_VERIFIED"]);
    expect(codes(judge({ panel: "SCAN_GONE" }))).toEqual(["PANEL_SCAN_GONE"]);
  });
  it("a panel verified on a bill since superseded blocks, naming both versions and the way out", () => {
    const f = judge({ bq: [{ status: "SUPERSEDED", versionNo: 1 }, { status: "FINALISED", versionNo: 2 }], panelBill: { versionNo: 1, status: "SUPERSEDED" } });
    expect(f).toEqual([{ code: "PANEL_BILL_SUPERSEDED", level: "block", data: { panelVersion: 1, current: 2 } }]);
    expect(scopeFaultText(f[0])).toBe("The specification panel was verified on version 1 of the bill, which is no longer the finalised one (version 2 is). Edit the panel under Scope and estimate, Scope to name the current bill, then verify it again.");
    // Whose scan has gone too: both are said.
    expect(codes(judge({ panel: "SCAN_GONE", panelBill: { versionNo: 1, status: "SUPERSEDED" } }))).toEqual(["PANEL_SCAN_GONE", "PANEL_BILL_SUPERSEDED"]);
    // On the current finalised bill, or naming none (a basis not let on a bill): nothing to say.
    expect(judge({ panelBill: { versionNo: 2, status: "FINALISED" } })).toEqual([]);
    expect(judge({ basis: { requiresBq: false }, bq: [], panelBill: null })).toEqual([]);
    // A draft panel is already PANEL_NOT_VERIFIED; its bill is judged when it is verified.
    expect(codes(judge({ panel: "DRAFT", panelBill: { versionNo: 1, status: "SUPERSEDED" } }))).toEqual(["PANEL_NOT_VERIFIED"]);
  });
  it("with no bill at all the finding says the bill is not started, never that a panel names the wrong one (sx4)", () => {
    const none = judge({ bq: [], panel: "NONE", panelBill: null });
    expect(codes(none)).toEqual(["BQ_NOT_FINALISED", "PANEL_NOT_VERIFIED"]);
    const text = scopeFaultText(none[0]);
    expect(text).toMatch(/not started/);
    expect(text).not.toMatch(/panel/i);
    // A draft only: said as a draft, and still not the panel's sentence.
    const draftOnly = judge({ bq: [{ status: "DRAFT" }] });
    expect(scopeFaultText(draftOnly[0])).toMatch(/no finalised version/);
    expect(scopeFaultText(draftOnly[0])).not.toMatch(/panel/i);
    // The panel's own finding of the same code keeps its own sentence.
    expect(scopeFaultText("BQ_NOT_FINALISED")).toMatch(/the panel names/);
  });
  it("PANEL_BILL_SUPERSEDED only where the panel names a bill and a finalised bill exists to compare", () => {
    // A panel naming a superseded bill while no bill is finalised: the missing bill is said, once.
    const f = judge({ bq: [{ status: "SUPERSEDED", versionNo: 1 }], panelBill: { versionNo: 1, status: "SUPERSEDED" } });
    expect(codes(f)).toEqual(["BQ_NOT_FINALISED"]);
    expect(codes(judge({ bq: [], panelBill: { versionNo: 1, status: "DRAFT" } }))).toEqual(["BQ_NOT_FINALISED"]);
  });
  it("ESTIMATE_NOT_LODGED where the method needs one; behind its lodgement after an amendment; nothing where it does not", () => {
    expect(codes(judge({ estimate: null }))).toEqual(["ESTIMATE_NOT_LODGED"]);
    expect(codes(judge({ estimate: { state: "DRAFT", behind: false } }))).toEqual(["ESTIMATE_NOT_LODGED"]);
    expect(codes(judge({ estimate: { state: "LODGED", behind: true } }))).toEqual(["ESTIMATE_BEHIND"]);
    expect(judge({ method: { requiresCompanyEstimate: false }, estimate: null })).toEqual([]);
  });
  it("each finding names where to fix it", () => {
    const all = packFaults({ basis: { requiresBq: null }, method: { requiresCompanyEstimate: null }, bq: [], panel: "NONE", panelBill: null, estimate: null, scope: "NOT_REQUIRED" });
    for (const f of all) expect(scopeFaultText(f)).toMatch(/Configuration|tab|Scope|Company estimate|Contract type/);
  });
});

describe("packFaults: scope approval (increment 2, OD-9, FR-REQ-014)", () => {
  it("approved, or not required by the method: nothing to say", () => {
    expect(judge({ scope: "APPROVED" })).toEqual([]);
    expect(judge({ scope: "NOT_REQUIRED" })).toEqual([]);
  });
  it("an unset rule blocks naming it, never reads as not required; a rule with no committee blocks naming that", () => {
    expect(codes(judge({ scope: "RULE_NOT_SET" }))).toEqual(["SCOPE_RULE_NOT_SET"]);
    expect(codes(judge({ scope: "COMMITTEE_NOT_SET" }))).toEqual(["SCOPE_COMMITTEE_NOT_SET"]);
    // Overrides BD-62-16: an unset act blocks the documents, naming the setting.
    expect(codes(judge({ scope: "ACT_NOT_SET" }))).toEqual(["SCOPE_ACT_NOT_SET"]);
    expect(scopeFaultText(judge({ scope: "ACT_NOT_SET" })[0])).toMatch(/act the committee discharges.*Configuration, Scope and estimate/);
    expect(scopeFaultText(judge({ scope: "RULE_NOT_SET" })[0])).toMatch(/Configuration, Scope and estimate/);
  });
  it("62-C1: a matter carried under the act configured when it was tabled lets the documents go after the act moves; an unset act blocks only with nothing decided", () => {
    const record = { committee: "Technical Committee", meetingReference: "SIT/1", meetingDate: new Date("2026-09-25T00:00:00Z"), subject: "Scope", matterRef: null, outcome: "CARRIED" as const, decisionDate: new Date("2026-09-25T00:00:00Z"), quorum: { required: 2, present: 2, recused: 0 }, votingRule: { rule: "SIMPLE_MAJORITY" as const, provenance: "ASSUMED" as const }, notApproved: null, note: "", votes: [] };
    const carriedR = { id: "d1", bqVersionId: "v1", committeeCode: "TECH", act: "R", withdrawn: false, sittingCancelled: false, tabledAt: new Date("2026-09-20T00:00:00Z"), record };
    // Was SCOPE_NOT_APPROVED (read against today's act): tabled when the method's act was R
    // (tabling writes the configured act and no other), carried, it stays approved after A.
    const scope = scopeApproval({ scopeApprovalRequired: true, scopeCommitteeCode: "TECH", scopeAct: "A" }, [{ id: "v1", versionNo: 1, status: "FINALISED" }], [carriedR]).state;
    expect(codes(judge({ scope }))).toEqual([]);
    // Was SCOPE_ACT_NOT_SET with a carried matter: unsetting the act later does not undo it.
    const unsetAfter = scopeApproval({ scopeApprovalRequired: true, scopeCommitteeCode: "TECH", scopeAct: null }, [{ id: "v1", versionNo: 1, status: "FINALISED" }], [{ ...carriedR, act: "A" }]).state;
    expect(codes(judge({ scope: unsetAfter }))).toEqual([]);
    // With nothing decided, an unset act blocks, naming the setting rather than the matter.
    const unset = scopeApproval({ scopeApprovalRequired: true, scopeCommitteeCode: "TECH", scopeAct: null }, [{ id: "v1", versionNo: 1, status: "FINALISED" }], []).state;
    expect(codes(judge({ scope: unset }))).toEqual(["SCOPE_ACT_NOT_SET"]);
  });
  it("every other state blocks until the finalised bill's scope matter is carried, saying where it stands", () => {
    for (const s of ["NO_FINALISED_BILL", "NOT_TABLED", "PENDING", "DEFERRED", "RETURNED", "ENDED", "OUTCOME_NOT_RECORDED"] as const) {
      const f = judge({ scope: s });
      expect(codes(f), s).toEqual(["SCOPE_NOT_APPROVED"]);
      expect(f[0].data, s).toEqual({ state: s });
      expect(scopeFaultText(f[0]), s).toMatch(/Scope/);
    }
  });
  it("a method no longer configured is said once, not again for scope", () => {
    expect(codes(judge({ method: null, scope: "METHOD_NOT_CONFIGURED" }))).toEqual(["METHOD_NOT_CONFIGURED"]);
  });
});
