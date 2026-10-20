import { describe, expect, it } from "vitest";

import type { CapturedAudit } from "@/lib/ambient/ambient-tx";

import {
  describeEdit,
  EDIT_DECIDE_PERMISSION,
  EDIT_KINDS,
  EDIT_KIND_WORDS,
  EDIT_PROPOSE_PERMISSION,
  editIsStale,
  editKindsReadBy,
  RECORD_EDIT_KINDS,
  unresolvedEditRule,
  isEditKind,
  isStoredField,
  MAX_FILE_BYTES,
  parseEditPayload,
  readRehearsal,
  rehearsalOf,
  samePayload,
  SULIT_HIDDEN,
  withheldFaults,
} from "./configuration-edit";
import { RETURN_CORRECTION_KIND, RETURN_CORRECTION_OPERATION, RETURN_WITHHELD_FIELDS } from "@/lib/award/return-withheld";
import { mayReadQueue } from "./configuration-change";
import type { PermissionKey } from "./types";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const row = (over: Partial<CapturedAudit> = {}): CapturedAudit => ({
  entity: "NumberingSeries",
  entityId: "s1",
  entityLabel: "Purchase requests",
  action: "UPDATE",
  reason: "",
  changes: [{ field: "pattern", before: "PR/{SERIAL}", after: "PR/{YEAR}/{SERIAL}" }],
  ...over,
});

describe("the kinds of an editor's save", () => {
  // Wave 3b (SR-13, ADR 0036 D1, build plan §1.4 and step 7): BID_SEALING_POLICY, the bid sealing policy's editor on the two-person path, is the ninth.
  it("are nine, each with words in both languages, and none is one of the five kinds with a rule of their own", () => {
    expect(EDIT_KINDS).toHaveLength(9);
    for (const k of EDIT_KINDS) {
      expect(isEditKind(k)).toBe(true);
      expect(EDIT_KIND_WORDS[k].en.length).toBeGreaterThan(5);
    }
    for (const k of ["SECURITY_POLICY", "PERMISSION_GRANT", "ADMINISTRATOR_GRANT", "ADMINISTRATOR_REVOKE", "ACCOUNT_CODE", "", "NOPE"]) expect(isEditKind(k)).toBe(false);
  });

  it("are made by the drafting permission and decided by the issuing one, as the approval matrix is", () => {
    expect(EDIT_PROPOSE_PERMISSION).toBe("configuration.draft");
    expect(EDIT_DECIDE_PERMISSION).toBe("configuration.issue");
    expect(EDIT_PROPOSE_PERMISSION).not.toBe(EDIT_DECIDE_PERMISSION);
  });

  it("are read in the queue by a maker, a checker and a reader of the audit trail, and by nobody else", () => {
    const has = (...k: PermissionKey[]) => new Set<PermissionKey>(k);
    // A correction of the record names a document, an award or a contract, perhaps in a restricted exercise: it is read by the one who decides corrections (and its proposer), not by the
    // makers and readers of configuration.
    for (const k of ["configuration.draft", "configuration.issue", "audit.read"] as const) {
      expect(editKindsReadBy(has(k))).toEqual(EDIT_KINDS.filter((x) => !RECORD_EDIT_KINDS.includes(x)));
      expect(mayReadQueue(has(k))).toBe(true);
    }
    expect(editKindsReadBy(has("corrections.decide"))).toEqual([...EDIT_KINDS]);
    expect(editKindsReadBy(has("accounts.manage", "acts.recordOnBehalf"))).toEqual([]);
    expect(mayReadQueue(has("sulit.read.organisation"))).toBe(false);
  });
});

describe("what is stored of a posted form", () => {
  it("never stores a password, an act's attribution fields or the form's token", () => {
    for (const name of ["personId:password", "issuedByPersonId:password", "personId:onBehalf", "personId:backdate", "personId:backdateReason", "personId:backdateAuthorisedBy", "formToken", "password", "currentPassword", "newPassword", "confirmPassword", "$ACTION_ID_1", "__proto__"]) {
      expect(isStoredField(name), name).toBe(false);
    }
    // Ruling 1982(h)(1) (log line 2036): the paper's reference and the act's reason are stored, so the apply can attribute a named subject's act through the proposer. The password never is.
    for (const name of ["fromPersonId:paperReference", "fromPersonId:reason"]) expect(isStoredField(name), name).toBe(true);
    for (const name of ["nameEn", "pattern", "id", "personId", "roleCode", "a:b", "reasonCode"]) expect(isStoredField(name), name).toBe(true);
  });

  it("refuses a payload that is not exactly an editor and a list of fields, naming what is wrong", () => {
    expect(parseEditPayload(null, null)).toMatchObject({ ok: false });
    expect(parseEditPayload([], null)).toMatchObject({ ok: false });
    expect(parseEditPayload({ operation: "numbering.saveSeries", fields: [], extra: 1 }, null)).toMatchObject({ ok: false, faults: [{ field: "extra", code: "UNKNOWN_FIELD" }] });
    expect(parseEditPayload({ operation: "not an editor", fields: [] }, null)).toMatchObject({ ok: false, faults: [{ code: "BAD_OPERATION" }] });
    expect(parseEditPayload({ operation: "numbering.saveSeries", fields: "x" }, null)).toMatchObject({ ok: false, faults: [{ code: "BAD_FIELDS" }] });
    expect(parseEditPayload({ operation: "numbering.saveSeries", fields: [["a"]] }, null)).toMatchObject({ ok: false, faults: [{ code: "BAD_FIELD" }] });
    expect(parseEditPayload({ operation: "numbering.saveSeries", fields: [["personId:password", "hunter2"]] }, null)).toMatchObject({ ok: false, faults: [{ field: "personId:password", code: "NOT_STORED" }] });
    expect(parseEditPayload({ operation: "numbering.saveSeries", fields: [["a", 3]] }, null)).toMatchObject({ ok: false, faults: [{ code: "BAD_VALUE" }] });
  });

  it("holds text and small files, and refuses a value or a file too large to hold", () => {
    const ok = parseEditPayload({ operation: "numbering.saveSeries", fields: [["a", "x"], ["a", "y"], ["f", { file: { name: "a.png", type: "image/png", size: 3, base64: "AAAA" } }]] }, null);
    expect(ok).toMatchObject({ ok: true });
    if (ok.ok) expect(ok.payload.fields.map(([n]) => n)).toEqual(["a", "a", "f"]);
    expect(parseEditPayload({ operation: "numbering.saveSeries", fields: [["a", "x".repeat(200_001)]] }, null)).toMatchObject({ ok: false, faults: [{ code: "TOO_LONG" }] });
    expect(parseEditPayload({ operation: "numbering.saveSeries", fields: [["f", { file: { name: "a.png", type: "image/png", size: MAX_FILE_BYTES + 1, base64: "" } }]] }, null)).toMatchObject({ ok: false, faults: [{ code: "FILE_TOO_LARGE" }] });
    expect(parseEditPayload({ operation: "numbering.saveSeries", fields: [["f", { file: { name: "a.png" } }]] }, null)).toMatchObject({ ok: false, faults: [{ code: "BAD_FILE" }] });
    expect(parseEditPayload({ operation: "numbering.saveSeries", fields: Array.from({ length: 601 }, (_, i) => [`f${i}`, "x"]) }, null)).toMatchObject({ ok: false, faults: [{ code: "TOO_MANY" }] });
  });

  it("knows the same proposal twice, whatever the order of its fields", () => {
    const p = (fields: [string, string][]) => ({ operation: "numbering.saveSeries", fields });
    expect(samePayload(p([["a", "1"], ["b", "2"]]), p([["b", "2"], ["a", "1"]]))).toBe(true);
    expect(samePayload(p([["a", "1"]]), p([["a", "2"]]))).toBe(false);
    expect(samePayload(p([["a", "1"]]), { operation: "numbering.removeSeries", fields: [["a", "1"]] })).toBe(false);
    expect(samePayload(p([["a", "1"]]), p([["a", "1"], ["a", "1"]]))).toBe(false);
  });
});

describe("a change is stale when the editor would now change something other than it was rehearsed to change", () => {
  const seen = rehearsalOf([row()]);

  it("is not stale when the world is as the proposer saw it, whatever the editor moves the fields to", () => {
    expect(editIsStale(seen, [row()])).toBe(false);
    expect(editIsStale(seen, [row({ entityId: "another id", changes: [{ field: "pattern", before: "PR/{SERIAL}", after: "something else entirely" }] })])).toBe(false);
  });

  it("is stale when a field held something else before", () => {
    expect(editIsStale(seen, [row({ changes: [{ field: "pattern", before: "PR-{SERIAL}", after: "PR/{YEAR}/{SERIAL}" }] })])).toBe(true);
  });

  it("is stale when the editor writes a record, a field or an action it was not rehearsed to write, or fewer", () => {
    expect(editIsStale(seen, [])).toBe(true);
    expect(editIsStale(seen, [row(), row({ entity: "Other" })])).toBe(true);
    expect(editIsStale(seen, [row({ action: "CREATE" })])).toBe(true);
    expect(editIsStale(seen, [row({ changes: [{ field: "padding", before: "1", after: "2" }] })])).toBe(true);
    expect(editIsStale(seen, [row({ changes: [] })])).toBe(true);
  });

  it("tells a field that was null from one that was empty", () => {
    const withNull = rehearsalOf([row({ changes: [{ field: "notes", before: null, after: "x" }] })]);
    expect(editIsStale(withNull, [row({ changes: [{ field: "notes", before: null, after: "y" }] })])).toBe(false);
    expect(editIsStale(withNull, [row({ changes: [{ field: "notes", before: "", after: "y" }] })])).toBe(true);
  });

  it("does not depend on the order of the rows", () => {
    const two = rehearsalOf([row(), row({ entity: "B", changes: [{ field: "x", before: "1", after: "2" }] })]);
    expect(editIsStale(two, [row({ entity: "B", changes: [{ field: "x", before: "1", after: "9" }] }), row()])).toBe(false);
  });

  it("reads back only a rehearsal that is one", () => {
    expect(readRehearsal(seen)).toEqual(seen);
    expect(readRehearsal({})).toBeNull();
    expect(readRehearsal(null)).toBeNull();
    expect(readRehearsal({ rows: [{ entity: 1 }] })).toBeNull();
    expect(readRehearsal({ rows: [{ entity: "A", entityLabel: "a", action: "MERGE", changes: [] }] })).toBeNull();
  });
});

describe("a stored edit in words", () => {
  it("names the editor, the record and each field from what it was to what it becomes", () => {
    const s = describeEdit("CONFIGURATION_EDIT", "Numbering: Save a numbering series", rehearsalOf([row()]));
    expect(s.title).toBe("Numbering: Save a numbering series");
    expect(s.subject).toBe("Purchase requests");
    expect(s.lines).toEqual([{ label: "Pattern", before: "PR/{SERIAL}", after: "PR/{YEAR}/{SERIAL}" }]);
  });

  it("says a record was added or removed, and shows no 'before' for one that is new", () => {
    const added = describeEdit("CONFIGURATION_EDIT", "X: Y", rehearsalOf([row({ action: "CREATE", changes: [{ field: "nameEn", before: null, after: "New" }] })]));
    expect(added.lines).toEqual([{ label: "Purchase requests (added) · Name (EN)", before: null, after: "New" }]);
    const removed = describeEdit("CONFIGURATION_EDIT", "X: Y", rehearsalOf([row({ action: "DELETE", changes: [] })]));
    expect(removed.lines).toEqual([{ label: "Purchase requests", before: null, after: "Removed" }]);
  });

  it("names a record in each line when the editor wrote several", () => {
    const s = describeEdit("CONFIGURATION_EDIT", "X: Y", rehearsalOf([row(), row({ entityLabel: "Orders" })]));
    expect(s.lines.map((l) => l.label)).toEqual(["Purchase requests · Pattern", "Orders · Pattern"]);
  });

  it("does not show a value that is held SULIT, before or after", () => {
    const s = describeEdit("CONFIGURATION_EDIT", "X: Y", rehearsalOf([{ ...row(), entity: "BqItem", entityLabel: "Item 1", changes: [{ field: "bqRate", before: "100.00", after: "250.00" }] }]));
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].before).toBe(SULIT_HIDDEN);
    expect(s.lines[0].after).toBe(SULIT_HIDDEN);
    expect(JSON.stringify(s)).not.toContain("250");
  });

  it("uses the kind's own words for the named corrections and says so when it cannot be read", () => {
    expect(describeEdit("QUORUM_CHANGE", null, rehearsalOf([row()])).title).toBe(EDIT_KIND_WORDS.QUORUM_CHANGE.en);
    expect(describeEdit("CONFIGURATION_EDIT", "A: B", { rows: "no" }).lines[0].after).toMatch(/Cannot be read/);
    expect(describeEdit("CONFIGURATION_EDIT", "A: B", rehearsalOf([])).lines[0].after).toBe("Writes nothing.");
  });
});

// Go-live N7 (plan docs/notes/plans/golive-n7.md 3.2): a decided return correction holds `null` for each withheld value, and only there is `null` read.
describe("a withheld value", () => {
  const OP = RETURN_CORRECTION_OPERATION;
  const KIND = RETURN_CORRECTION_KIND;

  it("is read on a listed name of the return correction, left out of the fields and named in withheld", () => {
    const parsed = parseEditPayload({ operation: OP, fields: [["id", "r1"], ["icNumber", null], ["capacity", "Director"], ["address", null], ["address", null]] }, KIND);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.payload.fields).toEqual([["id", "r1"], ["capacity", "Director"]]);
    // One entry per withheld element, in stored order: duplicates are kept, as the fields keep them.
    expect(parsed.payload.withheld).toEqual(["icNumber", "address", "address"]);
  });

  it("is read on every listed name", () => {
    const parsed = parseEditPayload({ operation: OP, fields: RETURN_WITHHELD_FIELDS.map((n) => [n, null]) }, KIND);
    expect(parsed).toMatchObject({ ok: true, payload: { fields: [], withheld: [...RETURN_WITHHELD_FIELDS] } });
  });

  it("stays BAD_VALUE anywhere else", () => {
    const bad = { ok: false, faults: [{ code: "BAD_VALUE" }] };
    expect(parseEditPayload({ operation: OP, fields: [["capacity", null]] }, KIND), "another name").toMatchObject(bad);
    expect(parseEditPayload({ operation: OP, fields: [["id", null]] }, KIND), "another name").toMatchObject(bad);
    expect(parseEditPayload({ operation: "awards-records.recordTerms", fields: [["icNumber", null]] }, KIND), "another operation").toMatchObject(bad);
    expect(parseEditPayload({ operation: OP, fields: [["icNumber", null]] }, "BASELINE_CORRECTION"), "another kind").toMatchObject(bad);
    expect(parseEditPayload({ operation: OP, fields: [["icNumber", null]] }, null), "no kind").toMatchObject(bad);
  });

  it("is never in a payload read without one", () => {
    const parsed = parseEditPayload({ operation: OP, fields: [["icNumber", "900101145678"]] }, KIND);
    expect(parsed).toMatchObject({ ok: true, payload: { fields: [["icNumber", "900101145678"]], withheld: [] } });
    expect(parseEditPayload({ operation: "numbering.saveSeries", fields: [["a", "x"]] }, null)).toMatchObject({ ok: true, payload: { withheld: [] } });
  });

  it("refuses a file on a listed name, so a listed name holds text or the marker only", () => {
    const file = { file: { name: "a.png", type: "image/png", size: 3, base64: "AAAA" } };
    expect(parseEditPayload({ operation: OP, fields: [["icNumber", file]] }, KIND)).toMatchObject({ ok: false, faults: [{ field: "icNumber", code: "BAD_VALUE" }] });
    expect(parseEditPayload({ operation: OP, fields: [["whereHeld", file]] }, KIND)).toMatchObject({ ok: true });
    expect(parseEditPayload({ operation: OP, fields: [["icNumber", file]] }, null)).toMatchObject({ ok: true });
  });

  it("refuses to be proposed or run", () => {
    expect(withheldFaults({ withheld: [] })).toEqual([]);
    const faults = withheldFaults({ withheld: ["icNumber"] });
    expect(faults).toHaveLength(1);
    expect(faults[0].code).toBe("WITHHELD_NOT_APPLICABLE");
    expect(faults[0].en).not.toContain("WITHHELD");
  });
});

describe("the rule for a change whose editor cannot be resolved (N7 review)", () => {
  it("is the corrections checker, kept from an administrator, for a correction of the record, and the issuer of configuration for the rest", () => {
    for (const k of RECORD_EDIT_KINDS) expect(unresolvedEditRule(k), k).toEqual({ decidePermission: "corrections.decide", administratorMay: false });
    for (const k of EDIT_KINDS.filter((x) => !RECORD_EDIT_KINDS.includes(x))) expect(unresolvedEditRule(k), k).toEqual({ decidePermission: "configuration.issue", administratorMay: true });
  });
});
