import { describe, expect, it } from "vitest";

import { bidFieldsFaults } from "./window-fields";

type Input = Parameters<typeof bidFieldsFaults>[0];
const next: Input["next"] = { days: 120, provenance: "ASSUMED", alternativesPermitted: false };
const base: Input = { status: "APPROVED_FOR_TENDERING", packKind: "TENDER", current: { days: null, alternativesPermitted: null }, next, reason: "" };
const codes = (i: Partial<Input>) => bidFieldsFaults({ ...base, ...i }).map((f) => f.code);

describe("the window's bid answers (FR-BID-006, 009)", () => {
  it("prepared before publication, with where the days came from", () => {
    expect(codes({})).toEqual([]);
    expect(codes({ next: { ...next, provenance: null } })).toEqual(["PROVENANCE_REQUIRED"]);
  });
  it("published with the validity unset: the days are recorded once, with a reason (the exit)", () => {
    expect(codes({ status: "ADVERTISED", current: { days: null, alternativesPermitted: false }, reason: "As stated in the instructions to tenderers" })).toEqual([]);
    expect(codes({ status: "ADVERTISED", current: { days: null, alternativesPermitted: false } })).toEqual(["REASON_REQUIRED"]);
  });
  it("published with the validity set: it stands; alternatives never change after publication", () => {
    expect(codes({ status: "ADVERTISED", current: { days: 90, alternativesPermitted: false }, reason: "x" })).toEqual(["VALIDITY_ALREADY_SET"]);
    expect(codes({ status: "INVITED", current: { days: null, alternativesPermitted: null }, reason: "x" })).toEqual(["WINDOW_NOT_EDITABLE"]);
  });
  it("not before preparation, never on a cancelled exercise", () => {
    expect(codes({ status: "DRAFT" })).toEqual(["WINDOW_NOT_EDITABLE"]);
    expect(codes({ status: "CANCELLED" })).toEqual(["WINDOW_NOT_EDITABLE"]);
  });
});
