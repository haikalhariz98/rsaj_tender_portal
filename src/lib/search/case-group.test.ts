import { describe, expect, it } from "vitest";

import { assembleCaseGroup, type LoadedCase } from "./case-group";
import type { ProjectRow } from "./hits";

const award = (id: string, exerciseId: string, contract: string | null): ProjectRow => ({ id, reference: `AW/${id}`, status: "ISSUED", exerciseId, contract: contract ? { number: contract, status: "NUMBER_ALLOCATED" } : null });
const loaded = (): LoadedCase => ({
  requisition: { id: "r1", reference: "REQ/1", title: "Roof repair", status: "APPROVED", erpRequisitionNo: null },
  exercises: [
    { id: "e1", reference: "EX/1", title: "Roof tender", status: "DRAFT", awards: [award("a1", "e1", "C/1"), award("a2", "e1", null)] },
    { id: "e2", reference: "EX/2", title: "Secret tender", status: "DRAFT", awards: [award("a3", "e2", "C/3")] },
  ],
  contractOnly: [award("a3", "e2", "C/3")],
});

describe("assembleCaseGroup", () => {
  it("holds an exercise with two awards, one with a contract", () => {
    const g = assembleCaseGroup({ ...loaded(), contractOnly: [] }, []);
    expect(g.requisition.exact).toBe(true);
    expect(g.exercises).toHaveLength(2);
    expect(g.exercises[0].projects.map((p) => p.title)).toEqual(["C/1", "AW/a2"]);
  });
  it("drops a hidden exercise and its count; its contract shows at the top without the exercise's words", () => {
    const g = assembleCaseGroup(loaded(), ["e2"]);
    expect(g.exercises.map((e) => e.hit.id)).toEqual(["e1"]);
    expect(g.projects.map((p) => p.title)).toEqual(["C/3"]);
    expect(JSON.stringify(g)).not.toMatch(/Secret|EX\/2/);
  });
  it("shows no contract-less award of a hidden exercise", () => {
    const l = loaded();
    l.contractOnly = [award("a9", "e2", null)];
    expect(assembleCaseGroup(l, ["e2"]).projects).toEqual([]);
  });
});
