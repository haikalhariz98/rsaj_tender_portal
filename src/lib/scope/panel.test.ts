import { describe, expect, it } from "vitest";

import { columnsInForce, editClearsVerifications, panelEditFault, panelFaults, panelState, verifiedScanVersionIds, verifyFaults, verifyPanelFault, type PanelColumn, type PanelFacts } from "./panel";
import { UNSET_SCOPE_POLICY, type ScopePolicy } from "./types";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const columns: PanelColumn[] = [
  { code: "prepared", labelEn: "Prepared by", retiredOn: null },
  { code: "checked", labelEn: "Checked by", retiredOn: null },
  { code: "certified", labelEn: "Certified by", retiredOn: null },
];
const policy: ScopePolicy = { ...UNSET_SCOPE_POLICY, panelSignatoryLimit: 3, panelContractKindTaxonomyCode: "kind", panelProjectStatusTaxonomyCode: "status" };
const verified = (personIds = ["a", "b", "c"]) => columns.map((c, i) => ({ columnCode: c.code, personId: personIds[i], clearedAt: null }));
const panel = (x: Partial<PanelFacts> = {}): PanelFacts => ({
  status: "DRAFT", contractKindCode: "works", contractKindOther: "", projectStatusCode: "new", projectStatusOther: "", bq: { status: "FINALISED" },
  verifications: verified(), liveSulitScans: 1, ...x,
});
const judge = (p: PanelFacts, x: Partial<Parameters<typeof panelFaults>[1]> = {}) =>
  panelFaults(p, { columns, policy, today: "2026-09-30", exerciseStatus: "DRAFT", bqRequired: true, ...x });

describe("verifying the panel (FR-EST-005, Q-1)", () => {
  it("every column verified, within the limit, the facts given, the bill finalised and a live SULIT scan: nothing stands in the way", () => {
    expect(judge(panel())).toEqual([]);
  });
  it("Q-1: no live SULIT scan of the signed form, no VERIFIED", () => {
    expect(codes(judge(panel({ liveSulitScans: 0 })))).toEqual(["SCAN_REQUIRED"]);
  });
  it("each column must be verified; a cleared verification does not count", () => {
    const f = judge(panel({ verifications: [verified()[0], { ...verified()[1], clearedAt: new Date() }] }));
    expect(f).toEqual([
      { code: "COLUMN_UNVERIFIED", level: "block", data: { column: "Checked by" } },
      { code: "COLUMN_UNVERIFIED", level: "block", data: { column: "Certified by" } },
    ]);
  });
  it("no columns configured blocks, naming the setting; a retired column is not asked for", () => {
    expect(codes(judge(panel(), { columns: [] }))).toEqual(["COLUMNS_NOT_SET"]);
    const retired = [...columns.slice(0, 2), { ...columns[2], retiredOn: "2026-09-01" }];
    expect(columnsInForce(retired, "2026-09-30").map((c) => c.code)).toEqual(["prepared", "checked"]);
    expect(judge(panel({ verifications: verified().slice(0, 2) }), { columns: retired })).toEqual([]);
  });
  it("more distinct verifiers than the limit is refused; at the limit is not; one person on two columns counts once", () => {
    expect(judge(panel(), { policy: { ...policy, panelSignatoryLimit: 2 } })).toEqual([{ code: "OVER_SIGNATORY_LIMIT", level: "block", data: { signatories: 3, limit: 2 } }]);
    expect(judge(panel(), { policy: { ...policy, panelSignatoryLimit: 3 } })).toEqual([]);
    expect(judge(panel({ verifications: verified(["a", "a", "b"]) }), { policy: { ...policy, panelSignatoryLimit: 2 } })).toEqual([]);
  });
  it("no limit set is a warning, never a limit of nothing", () => {
    expect(judge(panel(), { policy: { ...policy, panelSignatoryLimit: null } })).toEqual([{ code: "LIMIT_NOT_SET", level: "warn" }]);
  });
  it("contract kind and project status: from the list or specified; neither blocks; lists unset warns", () => {
    expect(codes(judge(panel({ contractKindCode: null })))).toEqual(["KIND_NOT_SET"]);
    expect(judge(panel({ contractKindCode: null, contractKindOther: "Pipe laying" }))).toEqual([]);
    expect(codes(judge(panel({ projectStatusCode: null })))).toEqual(["STATUS_NOT_SET"]);
    expect(codes(judge(panel(), { policy: { ...policy, panelContractKindTaxonomyCode: null } }))).toEqual(["LISTS_NOT_SET"]);
  });
  it("the bill it certifies: named where the basis is let on a bill, and finalised where named", () => {
    expect(codes(judge(panel({ bq: null })))).toEqual(["BQ_NOT_NAMED"]);
    expect(judge(panel({ bq: null }), { bqRequired: false })).toEqual([]);
    expect(judge(panel({ bq: null }), { bqRequired: null })).toEqual([]);
    expect(codes(judge(panel({ bq: { status: "DRAFT" } })))).toEqual(["BQ_NOT_FINALISED"]);
    expect(codes(judge(panel({ bq: { status: "SUPERSEDED" } })))).toEqual(["BQ_NOT_FINALISED"]);
  });
  it("a cancelled exercise's panel is not verified", () => {
    expect(codes(judge(panel(), { exerciseStatus: "CANCELLED" }))).toEqual(["EXERCISE_CANCELLED"]);
    expect(codes(panelEditFault("CANCELLED"))).toEqual(["EXERCISE_CANCELLED"]);
    expect(panelEditFault("DOCUMENTS_IN_PREPARATION")).toEqual([]);
  });
});

describe("the panel as a reader takes it", () => {
  // Faithful update (BD-62-26): the input names the live scans and the snapshot, not a count.
  const snap = (...versionIds: string[]) => ({ scans: versionIds.map((versionId, i) => ({ versionId, title: "Signed form", versionNo: i + 1 })) });
  it("a verified panel whose scan has gone is not verified", () => {
    expect(panelState(null)).toBe("NONE");
    expect(panelState({ status: "DRAFT", liveScanVersionIds: ["v1"], verifiedSnapshot: null })).toBe("DRAFT");
    expect(panelState({ status: "VERIFIED", liveScanVersionIds: ["v1"], verifiedSnapshot: snap("v1") })).toBe("VERIFIED");
    expect(panelState({ status: "VERIFIED", liveScanVersionIds: [], verifiedSnapshot: snap("v1") })).toBe("SCAN_GONE");
  });
  it("BD-62-26: verified only while a scan named in its snapshot is live; another scan never re-verifies it", () => {
    // One of two verified scans withdrawn: the other still stands.
    expect(panelState({ status: "VERIFIED", liveScanVersionIds: ["v2"], verifiedSnapshot: snap("v1", "v2") })).toBe("VERIFIED");
    // A different document attached after the verified scan was withdrawn.
    expect(panelState({ status: "VERIFIED", liveScanVersionIds: ["other-doc-v1"], verifiedSnapshot: snap("v1") })).toBe("SCAN_GONE");
    // A new version of the same document (re-pinned): not the scan it was verified on.
    expect(panelState({ status: "VERIFIED", liveScanVersionIds: ["v1-second-version"], verifiedSnapshot: snap("v1") })).toBe("SCAN_GONE");
  });
  it("a verified panel with no snapshot, or one naming no scan, is never read as verified", () => {
    expect(panelState({ status: "VERIFIED", liveScanVersionIds: ["v1"], verifiedSnapshot: null })).toBe("SCAN_GONE");
    expect(panelState({ status: "VERIFIED", liveScanVersionIds: ["v1"], verifiedSnapshot: { scans: "v1" } })).toBe("SCAN_GONE");
    expect(panelState({ status: "VERIFIED", liveScanVersionIds: ["v1"], verifiedSnapshot: { scans: [{ title: "no id" }] } })).toBe("SCAN_GONE");
    expect(verifiedScanVersionIds(snap("a", "b"))).toEqual(["a", "b"]);
    expect(verifiedScanVersionIds(undefined)).toEqual([]);
  });
  it("marking verified: a draft may, a panel whose scan has gone may again, a standing verified one may not", () => {
    expect(verifyPanelFault("DRAFT")).toBeNull();
    expect(verifyPanelFault("SCAN_GONE")).toBeNull();
    expect(verifyPanelFault("VERIFIED")).toEqual({ code: "PANEL_ALREADY_VERIFIED", level: "block" });
    expect(verifyPanelFault("NONE")).toEqual({ code: "PANEL_NOT_STARTED", level: "block" });
  });
  it("re-verifying from SCAN_GONE is judged like a first verification: it needs a live scan", () => {
    expect(codes(judge(panel({ status: "VERIFIED", liveSulitScans: 0 })))).toEqual(["SCAN_REQUIRED"]);
    expect(judge(panel({ status: "VERIFIED", liveSulitScans: 1 }))).toEqual([]);
  });
  it("editing clears standing verifications (and a verified panel's)", () => {
    expect(editClearsVerifications({ status: "DRAFT", verifications: [] })).toBe(false);
    expect(editClearsVerifications({ status: "DRAFT", verifications: [{ columnCode: "x", personId: "a", clearedAt: new Date() }] })).toBe(false);
    expect(editClearsVerifications({ status: "DRAFT", verifications: verified() })).toBe(true);
    expect(editClearsVerifications({ status: "VERIFIED", verifications: [] })).toBe(true);
  });
});

describe("recording a column's verification (attested, recorded on behalf of, not signed)", () => {
  const p = panel({ verifications: [] });
  const verify = (i: Partial<Parameters<typeof verifyFaults>[0]> = {}, q = p, today: string | null = "2026-09-30") =>
    codes(verifyFaults({ columnCode: "prepared", personId: "a", verifiedOn: "2026-09-30", ...i }, q, { columns, today, exerciseStatus: "DRAFT" }));
  it("a configured column, a named person, a day not after today", () => {
    expect(verify()).toEqual([]);
    expect(verify({ personId: null })).toEqual(["PERSON_REQUIRED"]);
    expect(verify({ columnCode: "nope" })).toEqual(["COLUMN_UNKNOWN"]);
    expect(verify({ verifiedOn: null })).toEqual(["DAY_REQUIRED"]);
    expect(verify({ verifiedOn: "2026-10-01" })).toEqual(["DAY_IN_FUTURE"]);
    expect(verify({}, p, null)).toEqual(["TIME_ZONE_NOT_SET"]);
  });
  it("one standing verification per column; a cleared one may be recorded again; never on a verified panel", () => {
    expect(verify({}, panel({ verifications: verified() }))).toEqual(["ALREADY_VERIFIED"]);
    expect(verify({}, panel({ verifications: [{ columnCode: "prepared", personId: "a", clearedAt: new Date() }] }))).toEqual([]);
    expect(verify({}, panel({ status: "VERIFIED", verifications: [] }))).toEqual(["PANEL_VERIFIED"]);
  });
});
