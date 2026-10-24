import { describe, expect, it } from "vitest";

import { contractTypeConfigFaults, dominanceShareFault, exerciseSeriesOf, keptForMethod, methodConfigFaults, nameRoutesToWithdraw } from "./config";
import { SPEC_METHODS } from "./fixture";

const m = (code: string) => SPEC_METHODS.find((x) => x.code === code)!;
const fields = (fs: { field: string }[]) => fs.map((f) => f.field);

describe("a method's configuration", () => {
  it("is refused with no band, or proposed where it is not available", () => {
    expect(fields(methodConfigFaults({ ...m("open_tender"), availableInTender: false, defaultInTender: false }, [], []))).toEqual(["availableInTender"]);
    expect(fields(methodConfigFaults({ ...m("open_tender"), defaultInQuotation: true }, [], []))).toEqual(["defaultInQuotation"]);
  });
  it("allows one proposed method per band", () => {
    const f = methodConfigFaults({ ...m("selected_tender"), defaultInTender: true }, [m("open_tender")], []);
    expect(f.map((x) => x.message)).toEqual(["Open tender is already the method proposed in the tender band. Untick it there first."]);
    expect(methodConfigFaults(m("open_tender"), [m("open_quotation")], [])).toEqual([]);
  });
  it("numbers a dossier from a configured series", () => {
    expect(fields(methodConfigFaults({ ...m("selective_direct"), dossierSeriesKey: null }, [], []))).toEqual(["dossierSeriesKey"]);
    expect(fields(methodConfigFaults(m("selective_direct"), [], []))).toEqual(["dossierSeriesKey"]);
    expect(methodConfigFaults(m("selective_direct"), [], ["direct_appointment"])).toEqual([]);
  });
  it("numbers an exercise from the method's own series, refusing one not configured, or from the standard series (RSAJ answer 22)", () => {
    expect(fields(methodConfigFaults({ ...m("open_tender"), exerciseSeriesKey: "exercise_tender" }, [], ["exercise"]))).toEqual(["exerciseSeriesKey"]);
    expect(methodConfigFaults({ ...m("open_tender"), exerciseSeriesKey: "exercise_tender" }, [], ["exercise_tender"])).toEqual([]);
    expect(methodConfigFaults({ ...m("open_tender"), exerciseSeriesKey: null }, [], [])).toEqual([]);
    expect([exerciseSeriesOf({ exerciseSeriesKey: "exercise_tender" }), exerciseSeriesOf({ exerciseSeriesKey: null }), exerciseSeriesOf({})]).toEqual(["exercise_tender", "exercise", "exercise"]);
  });
  it("reviews a proposal on its way to approval of the name", () => {
    expect(fields(methodConfigFaults({ ...m("selected_tender"), requiresNameApproval: false }, [], []))).toEqual(["requiresNameApproval"]);
  });
});

describe("a contract type's deliverable", () => {
  it("is the default of one type in force only", () => {
    expect(fields(contractTypeConfigFaults({ deliverableKind: "GOODS_DELIVERED" }, [{ nameEn: "Supply", deliverableKind: "GOODS_DELIVERED" }]))).toEqual(["deliverableKind"]);
    expect(contractTypeConfigFaults({ deliverableKind: null }, [{ nameEn: "Supply", deliverableKind: null }])).toEqual([]);
  });
});

describe("the mixed-scope threshold as typed (ruling R-11)", () => {
  it("empty is not set, never a default", () => {
    expect(dominanceShareFault("  ")).toEqual({ value: null, fault: null });
  });
  it("is a share strictly between 0 and 100", () => {
    expect(dominanceShareFault("60").value).toBe("60");
    expect(dominanceShareFault("0").fault).not.toBeNull();
    expect(dominanceShareFault("100").fault).not.toBeNull();
    expect(dominanceShareFault("50.12345").fault).not.toBeNull();
  });
});

describe("an edit that withdraws the name route (BD-5)", () => {
  const routes = [{ id: "a", status: "PENDING" }, { id: "b", status: "APPROVED" }, { id: "c", status: "RECALLED" }];
  it("withdraws open and approved routes when the method or value changes", () => {
    expect(nameRoutesToWithdraw(routes, { methodChanged: true, valueChanged: false }).routes.map((r) => r.id)).toEqual(["a", "b"]);
    expect(nameRoutesToWithdraw(routes, { methodChanged: false, valueChanged: true }).reason).toMatch(/value changed/);
  });
  it("withdraws nothing when neither changed", () => {
    expect(nameRoutesToWithdraw(routes, { methodChanged: false, valueChanged: false }).routes).toEqual([]);
  });
});

describe("what an exercise keeps for its method", () => {
  const d = { methodCode: "direct", proposedCode: "direct", methodReason: "x", parentContractRef: "KT/1", justificationReasonCode: "R", justificationText: "j", evidenceNote: "e", emergencyTrigger: "t", coordinationMeetingOn: "2026-09-01", coordinationAttendees: "a", coordinationScopeNote: "s", bqReference: "BQ" };
  it("keeps the reason only for an override, and nothing the method does not ask for", () => {
    expect(keptForMethod(m("direct"), d)).toMatchObject({ methodReason: "", parentContractRef: null, justificationReasonCode: null, emergencyTrigger: "", bqReference: null });
  });
  it("keeps what the method asks for", () => {
    expect(keptForMethod(m("emergency"), { ...d, methodCode: "emergency" })).toMatchObject({ methodReason: "x", emergencyTrigger: "t", coordinationMeetingOn: "2026-09-01" });
    expect(keptForMethod(m("selective_direct"), { ...d, methodCode: "selective_direct" })).toMatchObject({ justificationReasonCode: "R", evidenceNote: "e" });
    expect(keptForMethod(m("call_off"), { ...d, methodCode: "call_off" }).parentContractRef).toBe("KT/1");
  });
});
