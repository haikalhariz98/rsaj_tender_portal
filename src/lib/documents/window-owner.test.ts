import { describe, expect, it } from "vitest";

import { attachFault, detachFault, methodKeeps, ownerState, purposeFits, type OwnerFacts } from "./attach";
import { EXIT_TEXT } from "./labels";
import { addendumFacts, exerciseFacts } from "./owner-facts";
import { attachTargets } from "./targets";

/**
 * 6.5 (FR-ADV-001, 013, 014): an addendum keeps its signed copy while it is a draft and stands as
 * issued; an advertised exercise keeps its publications' proof once it may be published; any
 * window keeps attendance sheets once it is published. The window's purposes are the window's,
 * never the method's.
 */

const filed = { version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" as const } };
const addendum = (status: "DRAFT" | "ISSUED" | "VOID", exerciseStatus: "ADVERTISED" | "CANCELLED" = "ADVERTISED"): OwnerFacts => addendumFacts({ status, window: { exercise: { status: exerciseStatus } } });
type Status = Parameters<typeof exerciseFacts>[0]["status"];
const exercise = (status: Status, path: "ADVERTISED" | "INVITED" | null): OwnerFacts =>
  exerciseFacts({ status }, [], { requiresDossier: false, requiresCoordinationRecord: false }, path ? { path } : null);

describe("an addendum as an attachment owner", () => {
  it("takes only its signed copy", () => {
    expect(purposeFits("ADDENDUM_SIGNED", addendum("DRAFT"))).toBe(true);
    expect(purposeFits("TENDER_PART", addendum("DRAFT"))).toBe(false);
  });
  it("is open while a draft, and stands once issued or voided, saying why", () => {
    expect(attachFault({ purpose: "ADDENDUM_SIGNED", owner: addendum("DRAFT"), ...filed })).toEqual([]);
    expect(ownerState("ADDENDUM_SIGNED", addendum("ISSUED"))).toEqual({ state: "FROZEN", exit: "ADDENDUM_ISSUED" });
    expect(ownerState("ADDENDUM_SIGNED", addendum("VOID"))).toEqual({ state: "FROZEN", exit: "ADDENDUM_VOID" });
    expect(detachFault({ purpose: "ADDENDUM_SIGNED", owner: addendum("ISSUED"), reason: "wrong scan", reliedOn: null }).map((f) => f.code)).toEqual(["OWNER_FROZEN"]);
    expect(EXIT_TEXT.ADDENDUM_ISSUED).toMatch(/another addendum/);
  });
  it("is frozen with a cancelled exercise", () => {
    expect(ownerState("ADDENDUM_SIGNED", addendum("DRAFT", "CANCELLED"))).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
  });
});

describe("the window's purposes on an exercise", () => {
  it("a publication's proof only on an advertised window; an attendance sheet on any window; neither without one", () => {
    expect(purposeFits("PUBLICATION_PROOF", exercise("ADVERTISED", "ADVERTISED"))).toBe(true);
    expect(purposeFits("PUBLICATION_PROOF", exercise("INVITED", "INVITED"))).toBe(false);
    expect(purposeFits("ATTENDANCE_SHEET", exercise("INVITED", "INVITED"))).toBe(true);
    expect(purposeFits("PUBLICATION_PROOF", exercise("DOCUMENTS_IN_PREPARATION", null))).toBe(false);
    expect(purposeFits("ATTENDANCE_SHEET", exercise("DOCUMENTS_IN_PREPARATION", null))).toBe(false);
  });
  it("are kept by the window, whatever the method asks", () => {
    expect(methodKeeps("PUBLICATION_PROOF", exercise("ADVERTISED", "ADVERTISED"))).toBe(true);
    expect(methodKeeps("DOSSIER_EVIDENCE", exercise("ADVERTISED", "ADVERTISED"))).toBe(false);
  });
  it("a proof is attached from approval for tendering; an attendance sheet once published", () => {
    expect(ownerState("PUBLICATION_PROOF", exercise("DOCUMENTS_IN_PREPARATION", "ADVERTISED"))).toEqual({ state: "NOT_READY", exit: "NOT_APPROVED_FOR_TENDERING" });
    expect(ownerState("PUBLICATION_PROOF", exercise("APPROVED_FOR_TENDERING", "ADVERTISED"))).toEqual({ state: "OPEN" });
    expect(ownerState("ATTENDANCE_SHEET", exercise("APPROVED_FOR_TENDERING", "INVITED"))).toEqual({ state: "NOT_READY", exit: "WINDOW_NOT_PUBLISHED" });
    expect(ownerState("ATTENDANCE_SHEET", exercise("INVITED", "INVITED"))).toEqual({ state: "OPEN" });
    expect(ownerState("ATTENDANCE_SHEET", exercise("CANCELLED", "INVITED"))).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
  });
  // Go-live R4: and the published schedule, closed here: this exercise's opening is not finalised and no award is issued.
  it("the shared attach choice offers exactly those", () => {
    const [t] = attachTargets([{ id: "x", label: "SX/1", facts: exercise("ADVERTISED", "ADVERTISED") }]);
    expect(t.purposes.map((p) => [p.value, p.open])).toEqual([["PUBLICATION_PROOF", true], ["ATTENDANCE_SHEET", true], ["PUBLISHED_SCHEDULE", false]]);
  });
});
