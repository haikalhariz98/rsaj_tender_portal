import { describe, expect, it } from "vitest";

import { capacityFor, inForce, type DelegationFacts } from "./authority";
import { delegationFaults, delegationState, revokeFaults } from "./delegation";
import { supervisionFaultWords } from "./labels";

/**
 * FR-SUP-002–004. The S.O. (Head of Division) is held by Aminah; Ravi is her Principal Representative from the
 * day his letter was issued, scoped to the diary and progress; Siti is a Specialist Representative whose letter
 * is not yet issued. A delegate as grantor is refused (no sub-delegation); an act outside the scope is refused.
 */

const so = { roleLabel: "Head of Division", holderIds: ["aminah"], actingIds: ["acting"] };
const ravi: DelegationFacts = { id: "d1", kind: "PRINCIPAL", delegatePersonId: "ravi", letterIssuedOn: "2026-10-02", revokedOn: null, scope: ["DIARY", "PROGRESS"] };
const siti: DelegationFacts = { id: "d2", kind: "SPECIALIST", delegatePersonId: "siti", letterIssuedOn: null, revokedOn: null, scope: ["VALUATION"] };
const ds = [ravi, siti];
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("who may be recorded for an act", () => {
  it("the S.O., or someone acting in the office, for anything", () => {
    expect(capacityFor("aminah", { soOnly: true }, so, ds, "2026-10-03").capacity).toEqual({ as: "SO" });
    expect(capacityFor("acting", { act: "OBSERVATION" }, so, ds, "2026-10-03").capacity).toEqual({ as: "SO" });
  });
  it("a representative in force, for an act in scope", () => {
    expect(capacityFor("ravi", { act: "DIARY" }, so, ds, "2026-10-03").capacity).toEqual({ as: "DELEGATE", delegationId: "d1", kind: "PRINCIPAL" });
    expect(codes(capacityFor("ravi", { act: "OBSERVATION" }, so, ds, "2026-10-03").faults)).toEqual(["NOT_IN_SCOPE"]);
  });
  it("not before the letter is issued, nor from the day it is revoked", () => {
    expect(codes(capacityFor("ravi", { act: "DIARY" }, so, ds, "2026-10-01").faults)).toEqual(["NOT_AUTHORISED"]);
    expect(codes(capacityFor("siti", { act: "VALUATION" }, so, ds, "2026-10-03").faults)).toEqual(["NOT_AUTHORISED"]);
    expect(inForce({ ...ravi, revokedOn: "2026-10-05" }, "2026-10-04")).toBe(true);
    expect(inForce({ ...ravi, revokedOn: "2026-10-05" }, "2026-10-05")).toBe(false);
  });
  it("the S.O.'s own acts, and the Principal Representative's", () => {
    expect(codes(capacityFor("ravi", { soOnly: true }, so, ds, "2026-10-03").faults)).toEqual(["NOT_SO"]);
    expect(capacityFor("ravi", { principalOrSo: true }, so, ds, "2026-10-03").capacity).toMatchObject({ as: "DELEGATE", kind: "PRINCIPAL" });
    expect(codes(capacityFor("someone", { principalOrSo: true }, so, ds, "2026-10-03").faults)).toEqual(["NOT_PRINCIPAL"]);
  });
  it("nobody, with no S.O. resolved", () => {
    expect(codes(capacityFor("aminah", { act: "DIARY" }, null, ds, "2026-10-03").faults)).toEqual(["NO_SO"]);
  });
  it("outside the scope says so in words", () => {
    expect(supervisionFaultWords(capacityFor("ravi", { act: "OBSERVATION" }, so, ds, "2026-10-03").faults[0]).en).toMatch(/"Record compliance observations" is outside their delegation's scope/);
  });
});

describe("making a delegation", () => {
  const ctx = { so, delegations: ds, today: "2026-10-03", variant: "CONVENTIONAL" as const, typeName: "Works", forms: { letter: "t1", notice: "t2" } };
  const ok = { kind: "SPECIALIST" as const, grantorId: "aminah", delegate: { id: "lee", isActive: true }, competencyConfirmed: true, competencyNote: "Ten years on water mains.", scope: ["OBSERVATION" as const] };
  it("by the S.O., with the competency confirmation and a scope", () => {
    expect(delegationFaults(ok, ctx)).toEqual([]);
  });
  it("a delegate as grantor is refused: no sub-delegation", () => {
    expect(codes(delegationFaults({ ...ok, grantorId: "ravi" }, ctx))).toEqual(["SUB_DELEGATION"]);
  });
  it("nobody else delegates; not to oneself; not twice; not without the confirmation or a scope", () => {
    expect(codes(delegationFaults({ ...ok, grantorId: "x" }, ctx))).toEqual(["GRANTOR_NOT_SO"]);
    expect(codes(delegationFaults({ ...ok, delegate: { id: "aminah", isActive: true } }, ctx))).toEqual(["DELEGATE_IS_GRANTOR"]);
    expect(codes(delegationFaults({ ...ok, delegate: { id: "ravi", isActive: true } }, ctx))).toEqual(["ALREADY_DELEGATED"]);
    expect(codes(delegationFaults({ ...ok, competencyConfirmed: false }, ctx))).toEqual(["COMPETENCY_NOT_CONFIRMED"]);
    expect(codes(delegationFaults({ ...ok, competencyNote: "" }, ctx))).toEqual(["COMPETENCY_NOT_CONFIRMED"]);
    expect(codes(delegationFaults({ ...ok, scope: [] }, ctx))).toEqual(["SCOPE_EMPTY"]);
  });
  it("the letter pair: the type's variant and its forms, each unset blocking and naming the setting", () => {
    expect(codes(delegationFaults(ok, { ...ctx, variant: null }))).toEqual(["VARIANT_NOT_SET"]);
    expect(supervisionFaultWords(delegationFaults(ok, { ...ctx, variant: null })[0]).en).toMatch(/Set its delegation letter variant under Configuration › Reference data\.$/);
    expect(codes(delegationFaults(ok, { ...ctx, forms: { letter: "t1", notice: null } }))).toEqual(["FORMS_NOT_SET"]);
    expect(supervisionFaultWords(delegationFaults(ok, { ...ctx, forms: { letter: null, notice: null } })[0]).en).toMatch(/Set them under Configuration › Post-award\.$/);
  });
  it("revoking: once, with the reason, not in the future, not before it was made", () => {
    const r = { revokedOn: null, recordedOn: "2026-10-01", on: "2026-10-03", today: "2026-10-03", reason: "Transferred." };
    expect(revokeFaults(r)).toEqual([]);
    expect(codes(revokeFaults({ ...r, revokedOn: "2026-10-02", reason: "", on: "2026-09-30" }))).toEqual(["ALREADY_REVOKED", "REASON_REQUIRED", "BEFORE_RECORDED"]);
  });
  it("its state reads from its letter and its revocation", () => {
    expect(delegationState({ letterStatus: "DRAFT", revokedOn: null }, "2026-10-03")).toBe("LETTER_NOT_ISSUED");
    expect(delegationState({ letterStatus: "ISSUED", revokedOn: null }, "2026-10-03")).toBe("IN_FORCE");
    expect(delegationState({ letterStatus: "ISSUED", revokedOn: "2026-10-03" }, "2026-10-03")).toBe("REVOKED");
    expect(delegationState({ letterStatus: "VOID", revokedOn: null }, "2026-10-03")).toBe("LETTER_VOID");
  });
});
