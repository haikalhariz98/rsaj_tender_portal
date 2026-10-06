import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { tabledVersionFault } from "./bundle";
import { evaluationFindingText } from "./labels";
import { appointmentOutcomeOn } from "./state";

/**
 * 6.8 fix M-3 (E-8, against 6.10 and 6.11): an appointment matter records the evaluation version it
 * was tabled on. Its decision is cited at award, and its NOT_CARRIED loop opens a version, only while
 * that version is still the one in force.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("the version a matter was tabled on (M-3)", () => {
  it("tabled on the version in force: stands", () => {
    expect(tabledVersionFault({ applies: true, tabledOn: 2, inForce: 2 })).toBeNull();
  });
  it("tabled on an earlier version: refused, naming both versions and the way on", () => {
    const f = tabledVersionFault({ applies: true, tabledOn: 1, inForce: 2 })!;
    expect(f.code).toBe("TABLED_ON_EARLIER_VERSION");
    const text = evaluationFindingText(f);
    expect(text).toContain("tabled on evaluation version 1");
    expect(text).toContain("version 2 is in force now");
    expect(text).toContain("Table the appointment again");
  });
  it("no version in force now (closed): refused, saying it is no longer in force", () => {
    const f = tabledVersionFault({ applies: true, tabledOn: 1, inForce: null })!;
    expect(evaluationFindingText(f)).toContain("which is no longer in force");
  });
  it("no version recorded on the matter: refused, never assumed to stand", () => {
    const f = tabledVersionFault({ applies: true, tabledOn: null, inForce: 1 })!;
    expect(f.code).toBe("TABLED_VERSION_NOT_RECORDED");
    expect(evaluationFindingText(f)).toMatch(/cannot be told/);
  });
  it("an exercise not evaluated in the portal: nothing judged (CO-3)", () => {
    expect(tabledVersionFault({ applies: false, tabledOn: null, inForce: null })).toBeNull();
  });
  it("the loop's words say the decision stands and nothing opens", () => {
    expect(evaluationFindingText({ code: "LOOP_ON_EARLIER_VERSION", level: "info", data: { tabled: 1 } })).toMatch(/version 1, which is no longer in force, so no new evaluation version opens/);
    expect(evaluationFindingText({ code: "LOOP_VERSION_NOT_RECORDED", level: "info" })).toMatch(/no new evaluation version opens/);
  });
});

describe("the phase reads only the version in force's appointment (M-3)", () => {
  const m = (outcome: "PENDING" | "DEFERRED" | "CARRIED" | "NOT_CARRIED", evaluationVersion: number | null) => ({ outcome, evaluationVersion });
  it("a NOT_CARRIED decision on version 1 is not version 2's outcome", () => {
    expect(appointmentOutcomeOn([m("NOT_CARRIED", 1)], 2)).toBeNull();
    expect(appointmentOutcomeOn([m("NOT_CARRIED", 1), m("PENDING", 2)], 2)).toBe("PENDING");
    expect(appointmentOutcomeOn([m("CARRIED", 1)], 1)).toBe("CARRIED");
    expect(appointmentOutcomeOn([m("CARRIED", null)], 1)).toBeNull();
  });
});

describe("the acts record and check it (source scan)", () => {
  const committee = read("src", "app", "committees", "actions.ts");
  const awards = read("src", "app", "awards", "actions.ts");
  it("tabling records the version in force once the bundle stands", () => {
    expect(committee).toMatch(/else if \(gate\.bundle\.applies\) evaluationVersion = gate\.version;/);
    expect(committee).toMatch(/dependsOnDecisionId, sequence, evaluationVersion \}/);
  });
  it("the loop opens nothing for a matter tabled on another version, before any version opens", () => {
    const loop = committee.slice(committee.indexOf("async function loopBack("), committee.indexOf("/**\n * Withdraw a tabled matter"));
    expect(loop.indexOf("tabledVersionFault(")).toBeGreaterThan(0);
    expect(loop.indexOf("tabledVersionFault(")).toBeLessThan(loop.indexOf("openNewVersion("));
    expect(loop).toMatch(/if \(vf\) return evaluationFindingText/);
  });
  it("citation at award refuses a decision on another version, after the bundle check and before the write", () => {
    // Founder, 2026-10-05: the citation moved, unchanged, to the module's route writer, the one function its act and a sitting's outcome both run.
    const routeWrite = read("src", "lib", "award", "route-write.ts");
    expect(awards).toMatch(/citeAppointmentStep\(tx, toAuditActor\(actor\), l, stepId, decisionId\)/); // Phase 1b: who acted is the argument after the transaction
    expect(routeWrite.indexOf("const gate = await loadEvaluationGate(l.ex.id, tx);")).toBeGreaterThan(routeWrite.indexOf("export async function citeAppointmentStep("));
    const cite = routeWrite.slice(routeWrite.indexOf("const gate = await loadEvaluationGate(l.ex.id, tx);"));
    expect(cite.indexOf("bundleFaults(gate.bundle)")).toBeLessThan(cite.indexOf("tabledVersionFault("));
    expect(cite.indexOf("tabledVersionFault({ applies: gate.bundle.applies, tabledOn: matter.evaluationVersion ?? null, inForce: gate.version })")).toBeGreaterThan(0);
    expect(cite.indexOf("tabledVersionFault(")).toBeLessThan(cite.indexOf("tx.approvalStep.updateMany("));
  });
});
