import { describe, expect, it } from "vitest";

import { scopeFaultText } from "./labels";
import { packFaults, type PackInput } from "./pack";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const ready: PackInput = { basis: { requiresBq: true }, method: { requiresCompanyEstimate: true }, bq: [{ status: "FINALISED" }], panel: "VERIFIED", estimate: { state: "LODGED", behind: false }, scope: "APPROVED" };
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
  it("ESTIMATE_NOT_LODGED where the method needs one; behind its lodgement after an amendment; nothing where it does not", () => {
    expect(codes(judge({ estimate: null }))).toEqual(["ESTIMATE_NOT_LODGED"]);
    expect(codes(judge({ estimate: { state: "DRAFT", behind: false } }))).toEqual(["ESTIMATE_NOT_LODGED"]);
    expect(codes(judge({ estimate: { state: "LODGED", behind: true } }))).toEqual(["ESTIMATE_BEHIND"]);
    expect(judge({ method: { requiresCompanyEstimate: false }, estimate: null })).toEqual([]);
  });
  it("each finding names where to fix it", () => {
    const all = packFaults({ basis: { requiresBq: null }, method: { requiresCompanyEstimate: null }, bq: [], panel: "NONE", estimate: null, scope: "NOT_REQUIRED" });
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
    expect(scopeFaultText(judge({ scope: "RULE_NOT_SET" })[0])).toMatch(/Configuration, Scope and estimate/);
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
