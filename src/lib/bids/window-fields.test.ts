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
  // SR-06 (ruling 9): once submitted under the notice gate, the validity can be changed but not cleared.
  it("submitted under the notice gate: a set validity is changed, not cleared", () => {
    const set = { days: 90, alternativesPermitted: false };
    const cleared = { days: null, provenance: null, alternativesPermitted: false };
    expect(codes({ validityRequired: true, current: set, next: cleared })).toEqual(["VALIDITY_REQUIRED"]);
    expect(codes({ validityRequired: true, status: "PENDING_APPROVAL_FOR_TENDERING", current: set, next: cleared })).toEqual(["VALIDITY_REQUIRED"]);
    expect(codes({ validityRequired: true, current: set, next: { ...next, alternativesPermitted: false } })).toEqual([]);
    // Still being prepared, or made before the gate: an ordinary edit.
    expect(codes({ validityRequired: true, status: "DOCUMENTS_IN_PREPARATION", current: set, next: cleared })).toEqual([]);
    expect(codes({ validityRequired: false, current: set, next: cleared })).toEqual([]);
  });
  it("not before preparation, never on a cancelled exercise", () => {
    expect(codes({ status: "DRAFT" })).toEqual(["WINDOW_NOT_EDITABLE"]);
    expect(codes({ status: "CANCELLED" })).toEqual(["WINDOW_NOT_EDITABLE"]);
  });
});

describe("the validity recorded after publication, shown on the card (6.6 review S-6)", () => {
  const PUB = new Date("2026-10-20T03:00:00Z");
  const at = (h: number) => new Date(PUB.getTime() + h * 3600_000);
  const set = (before: string, after: string, extra: object[] = []) => [{ field: "bidValidity", before, after }, ...extra];
  it("reads when, by whom and why from the entry that moved it from Not set after publication", async () => {
    const { validityExitOf } = await import("./window-fields");
    const exit = validityExitOf([{ at: at(48), reason: "From the instructions to tenderers.", changes: set("Not set", "120 days", [{ field: "recordedBy", before: null, after: "Chen Wei Ling, recorded on their behalf, not signed" }]) }], PUB);
    expect(exit).toEqual({ at: at(48), by: "Chen Wei Ling, recorded on their behalf, not signed", reason: "From the instructions to tenderers." });
  });
  it("a validity set before publication is no exit; neither is an entry that did not set it", async () => {
    const { validityExitOf } = await import("./window-fields");
    expect(validityExitOf([{ at: at(-1), reason: "", changes: set("Not set", "120 days") }], PUB)).toBeNull();
    expect(validityExitOf([{ at: at(2), reason: "x", changes: [{ field: "alternatives", before: "Not stated", after: "Permitted" }] }], PUB)).toBeNull();
    expect(validityExitOf([{ at: at(2), reason: "x", changes: set("Not set", "120 days") }], null)).toBeNull();
    expect(validityExitOf([], PUB)).toBeNull();
  });
  it("at the publication instant counts as after it; an entry naming nobody says so (null), never a guess", async () => {
    const { validityExitOf } = await import("./window-fields");
    expect(validityExitOf([{ at: PUB, reason: "r", changes: set("Not set", "90 days") }], PUB)).toEqual({ at: PUB, by: null, reason: "r" });
  });
  it("the earliest such entry is the exit, whatever order the trail comes in", async () => {
    const { validityExitOf } = await import("./window-fields");
    expect(validityExitOf([{ at: at(5), reason: "second", changes: set("Not set", "90 days") }, { at: at(3), reason: "first", changes: set("Not set", "120 days") }, { at: at(1), reason: "malformed", changes: "nonsense" }], PUB)?.reason).toBe("first");
  });
});
