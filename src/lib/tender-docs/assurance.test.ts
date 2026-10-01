import { describe, expect, it } from "vitest";

import { assuranceFaults, assuranceKindsFor, confirmFaults } from "./assurance";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const withDrawings = [{ role: "FORM_OF_TENDER" as const, state: "READY" as const }, { role: "DRAWINGS" as const, state: "READY" as const }];
const withoutDrawings = [{ role: "FORM_OF_TENDER" as const, state: "READY" as const }, { role: "DRAWINGS" as const, state: "OMITTED" as const }];
const both = [
  { kind: "NO_AMBIGUITY" as const, personName: "Nur Aina", confirmedOn: "2026-09-25" },
  { kind: "DRAWINGS_COORDINATED" as const, personName: "Rajesh Kumar", confirmedOn: "2026-09-25" },
];

describe("FR-DOC-014: the document-assurance gate", () => {
  it("the policy unset blocks: no answer is assumed", () => {
    expect(codes(assuranceFaults(null, withDrawings, both))).toEqual(["ASSURANCE_POLICY_NOT_SET"]);
  });
  it("the policy's no is recorded as its decision, not a block", () => {
    expect(assuranceFaults(false, withDrawings, [])).toEqual([{ code: "ASSURANCE_NOT_REQUIRED", level: "info" }]);
  });
  it("acceptance: required, the pack cannot go until both confirmations name a person and a day", () => {
    expect(assuranceFaults(true, withDrawings, both)).toEqual([]);
    expect(assuranceFaults(true, withDrawings, [both[0]])).toEqual([{ code: "ASSURANCE_MISSING", level: "block", data: { kind: "DRAWINGS_COORDINATED" } }]);
    expect(codes(assuranceFaults(true, withDrawings, []))).toEqual(["ASSURANCE_MISSING", "ASSURANCE_MISSING"]);
  });
  it("a pack binding no drawings needs only the first", () => {
    expect(assuranceKindsFor(withoutDrawings)).toEqual(["NO_AMBIGUITY"]);
    expect(assuranceFaults(true, withoutDrawings, [both[0]])).toEqual([]);
  });
});

describe("recording a confirmation", () => {
  const ok = { packStatus: "DRAFT" as const, exerciseStatus: "DOCUMENTS_IN_PREPARATION" as const, kind: "NO_AMBIGUITY" as const, parts: withDrawings, existing: [], person: { isActive: true }, confirmedOn: "2026-09-30", today: "2026-10-01", packStartedOn: "2026-09-25" };
  it("on a draft, once per kind, a kind the pack needs, by an active Person, on a day between the version's start and today", () => {
    expect(confirmFaults(ok)).toEqual([]);
    expect(confirmFaults({ ...ok, confirmedOn: "2026-10-01" })).toEqual([]);
    expect(confirmFaults({ ...ok, confirmedOn: "2026-09-25" })).toEqual([]);
    expect(codes(confirmFaults({ ...ok, packStatus: "SUBMITTED" }))).toEqual(["PACK_NOT_EDITABLE"]);
    expect(codes(confirmFaults({ ...ok, today: null }))).toEqual(["TIME_ZONE_NOT_SET"]);
    expect(codes(confirmFaults({ ...ok, existing: [{ kind: "NO_AMBIGUITY" }] }))).toEqual(["ALREADY_CONFIRMED"]);
    expect(codes(confirmFaults({ ...ok, kind: "DRAWINGS_COORDINATED", parts: withoutDrawings }))).toEqual(["NOT_NEEDED"]);
    expect(codes(confirmFaults({ ...ok, person: null }))).toEqual(["PERSON_REQUIRED"]);
    expect(codes(confirmFaults({ ...ok, person: { isActive: false } }))).toEqual(["PERSON_NOT_ACTIVE"]);
    expect(codes(confirmFaults({ ...ok, confirmedOn: "2026-02-30" }))).toEqual(["DAY_REQUIRED"]);
    expect(codes(confirmFaults({ ...ok, confirmedOn: "2026-10-02" }))).toEqual(["DAY_IN_FUTURE"]);
    expect(codes(confirmFaults({ ...ok, confirmedOn: "2026-09-24" }))).toEqual(["DAY_BEFORE_PACK"]);
  });
});
