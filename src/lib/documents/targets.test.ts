import { describe, expect, it } from "vitest";

import { attachFault, type ExerciseMethodFlags } from "./attach";
import { attachableVersion, attachTargets, exercisePurposes, ownerHref, type TargetOwner } from "./targets";
import { ATTACHMENT_PURPOSES } from "./types";

const exercise = (flags: ExerciseMethodFlags | null, over: Partial<{ status: "DRAFT" | "CANCELLED"; awardApproved: boolean }> = {}): TargetOwner => ({
  id: "ex", label: "DEMO/SX/1",
  facts: { kind: "exercise", status: over.status ?? "DRAFT", appointmentRouteOpen: false, awardApproved: over.awardApproved ?? false, method: flags },
});

describe("exercisePurposes", () => {
  it("keeps only what the method asks for", () => {
    expect(exercisePurposes({ requiresDossier: true, requiresCoordinationRecord: false })).toEqual(["DOSSIER_EVIDENCE"]);
    expect(exercisePurposes({ requiresDossier: false, requiresCoordinationRecord: true })).toEqual(["COORDINATION_SCOPE"]);
    expect(exercisePurposes({ requiresDossier: true, requiresCoordinationRecord: true })).toHaveLength(2);
    expect(exercisePurposes(null)).toEqual([]);
  });
});

describe("attachTargets", () => {
  it("offers an exercise only the purposes its method keeps, and says so where it keeps none", () => {
    const [a, b] = attachTargets([exercise({ requiresDossier: true, requiresCoordinationRecord: false }), exercise({ requiresDossier: false, requiresCoordinationRecord: false })]);
    expect(a.purposes.map((p) => p.value)).toEqual(["DOSSIER_EVIDENCE"]);
    expect(b.purposes).toEqual([]);
    expect(b.nothingKept).toMatch(/method asks for no document/);
  });

  it("offers an exercise a purpose exactly where the attach act would not refuse it for the record or its method", () => {
    const methods: (ExerciseMethodFlags | null)[] = [null, ...[false, true].flatMap((d) => [false, true].map((c) => ({ requiresDossier: d, requiresCoordinationRecord: c })))];
    for (const method of methods) {
      const [r] = attachTargets([exercise(method)]);
      for (const p of ATTACHMENT_PURPOSES) {
        const refused = attachFault({ purpose: p, owner: exercise(method).facts, version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" } }).some((f) => f.code.startsWith("PURPOSE_NOT_FOR_"));
        expect(r.purposes.some((x) => x.value === p), `${p} on ${JSON.stringify(method)}`).toBe(!refused);
      }
    }
  });

  it("marks a purpose the owner is not open for, with the way out in words", () => {
    const [m, cancelled] = attachTargets([
      { id: "m", label: "CWC/1", facts: { kind: "meeting", status: "SCHEDULED" } },
      { id: "m2", label: "CWC/2", facts: { kind: "meeting", status: "CANCELLED" } },
    ]);
    expect(m.purposes[0]).toMatchObject({ value: "SIGNED_MINUTES", open: false });
    expect(m.purposes[0].reason).toMatch(/once the sitting is minuted/);
    expect(cancelled.purposes[0].reason).toMatch(/cancelled/);
    expect(attachTargets([{ id: "m", label: "x", facts: { kind: "meeting", status: "MINUTED" } }])[0].purposes[0]).toMatchObject({ open: true, reason: null });
  });

  it("closes the dossier once an award is approved on it, but not the scope document", () => {
    const [r] = attachTargets([exercise({ requiresDossier: true, requiresCoordinationRecord: true }, { awardApproved: true })]);
    expect(r.purposes.find((p) => p.value === "DOSSIER_EVIDENCE")?.open).toBe(false);
    expect(r.purposes.find((p) => p.value === "COORDINATION_SCOPE")?.open).toBe(true);
  });

  it("offers an award only the returns its instrument comes back with", () => {
    const [r] = attachTargets([{ id: "a", label: "AWD/1", facts: { kind: "award", status: "ISSUED", instrumentKind: "WORK_INDENT", scansRequired: true } }]);
    expect(r.purposes.map((p) => p.value)).toEqual(["ACCEPTANCE_PAGE"]);
  });
});

describe("ownerHref", () => {
  it("points at the owner's own screen", () => {
    expect(ownerHref("meeting", "x")).toBe("/committees/x");
    expect(ownerHref("exercise", "x")).toBe("/sourcing/x");
    expect(ownerHref("award", "x")).toBe("/awards/x");
  });
  it("a specification panel is shown on its exercise's screen", () => {
    expect(ownerHref("specificationPanel", "panel1", "ex1")).toBe("/sourcing/ex1");
    expect(ownerHref("specificationPanel", "panel1")).toBe("/sourcing");
  });
});

describe("attachableVersion", () => {
  const v = (id: string, versionNo: number, withdrawn = false) => ({ id, versionNo, withdrawnAt: withdrawn ? new Date() : null });
  it("is the newest version that stands", () => {
    expect(attachableVersion([v("a", 1), v("b", 2)])).toBe("b");
    expect(attachableVersion([v("a", 1), v("b", 2, true)])).toBe("a");
  });
  it("is null where every version is withdrawn", () => {
    expect(attachableVersion([v("a", 1, true)])).toBeNull();
  });
});
