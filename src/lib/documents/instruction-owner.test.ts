import { describe, expect, it } from "vitest";

import { attachFault, ownerState, purposeFits, type OwnerFacts } from "./attach";
import { documentWipePlan, onDemoSide } from "./demo-wipe-plan";
import { EXIT_TEXT, PURPOSE_LABEL } from "./labels";
import { variationInstructionFacts, variationInstructionLabel } from "./owner-facts";
import { ownerHref } from "./targets";

/**
 * 6.13 Part A acceptance S-2 (FR-VAR-015): plans or sketches are attached to the S.O.'s Instruction through the
 * document store. Open while the instruction stands, drafted, at signing or issued (they may follow its issue, and
 * none is required at it); a void instruction, a closed variation and a cancelled contract keep what they have.
 */
const i = (x: Partial<Extract<OwnerFacts, { kind: "variationInstruction" }>> = {}): OwnerFacts => ({ kind: "variationInstruction", contractStatus: "ACTIVE", certificateStatus: "ISSUED", variationClosed: false, ...x });

describe("an S.O.'s Instruction's plans or sketches", () => {
  it("are kept while it stands, before and after its issue", () => {
    for (const s of ["DRAFT", "SIGNING", "ISSUED"]) expect(ownerState("INSTRUCTION_SKETCH", i({ certificateStatus: s }))).toEqual({ state: "OPEN" });
    expect(purposeFits("INSTRUCTION_SKETCH", i())).toBe(true);
  });
  it("a void instruction, a closed variation and a cancelled contract keep what they have", () => {
    expect(ownerState("INSTRUCTION_SKETCH", i({ certificateStatus: "VOID" }))).toEqual({ state: "FROZEN", exit: "INSTRUCTION_VOID" });
    expect(ownerState("INSTRUCTION_SKETCH", i({ variationClosed: true }))).toEqual({ state: "FROZEN", exit: "VARIATION_CLOSED" });
    expect(ownerState("INSTRUCTION_SKETCH", i({ contractStatus: "CANCELLED" }))).toEqual({ state: "FROZEN", exit: "CONTRACT_CANCELLED" });
    expect(EXIT_TEXT.INSTRUCTION_VOID).toMatch(/void/);
    expect(EXIT_TEXT.VARIATION_CLOSED).toMatch(/closed/);
  });
  it("only its own purpose: a contract's paper is refused on it, and its sketch on a contract", () => {
    expect(attachFault({ purpose: "AS_BUILT", owner: i(), version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" } }).map((f) => f.code)).toEqual(["PURPOSE_NOT_FOR_OWNER"]);
    expect(purposeFits("INSTRUCTION_SKETCH", { kind: "contract", status: "ACTIVE", legalSubmitted: true, contractorSigned: true })).toBe(false);
    expect(attachFault({ purpose: "INSTRUCTION_SKETCH", owner: i(), version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" } })).toEqual([]);
  });
  it("is named and linked by its contract, variation and certificate, never an id", () => {
    const row = { certificate: { status: "ISSUED", number: "DEMO/CERT/00234" }, variation: { status: "SUPPORTED", reference: "DEMO/VO/002/2026", contract: { status: "ACTIVE" as const, number: "DEMO/KP/T/005/2026", award: { awardeeName: "Syarikat Contoh" } } } };
    expect(variationInstructionLabel(row)).toBe("Contract DEMO/KP/T/005/2026 · variation DEMO/VO/002/2026 · the S.O.'s instruction DEMO/CERT/00234");
    expect(variationInstructionFacts(row)).toEqual(i());
    expect(ownerHref("variationInstruction", "vin1", "con13/variations/vvo2")).toBe("/projects/con13/variations/vvo2?tab=instruction");
    expect(PURPOSE_LABEL.INSTRUCTION_SKETCH).toBe("Plan or sketch for the S.O.'s instruction");
  });
  it("goes with its contract when the demo is wiped", () => {
    const side = { isDemo: (id: string) => id.startsWith("demo_"), removedExerciseIds: new Set<string>(), removedAwardIds: new Set<string>(), removedInstructionIds: new Set(["made-on-a-demo-contract"]) };
    const a = (variationInstructionId: string) => ({ id: "a", purpose: "INSTRUCTION_SKETCH" as const, meetingId: null, exerciseId: null, awardId: null, delegationId: null, variationInstructionId });
    expect(onDemoSide(a("demo_vin1"), side)).toBe(true);
    expect(onDemoSide(a("made-on-a-demo-contract"), side)).toBe(true);
    expect(onDemoSide(a("a-real-one"), side)).toBe(false);
    expect(documentWipePlan([], side, false)).toBeTruthy();
  });
});
