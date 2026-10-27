import { describe, expect, it } from "vitest";

import { assembleCaseGroup, type LoadedCase } from "./case-group";
import type { ProjectRow } from "./hits";
import { CASE_GROUP_SIZE } from "./types";

const award = (id: string, exerciseId: string, contract: string | null): ProjectRow => ({ id, reference: `AW/${id}`, status: "ISSUED", exerciseId, contract: contract ? { number: contract, status: "NUMBER_ALLOCATED" } : null });
// Each level as the store reads it: newest first.
const loaded = (): LoadedCase => ({
  requisition: { id: "r1", reference: "REQ/1", title: "Roof repair", status: "APPROVED", erpRequisitionNo: null },
  exercises: [
    { id: "e2", reference: "EX/2", title: "Secret tender", status: "DRAFT", awards: [award("a3", "e2", "C/3")] },
    { id: "e1", reference: "EX/1", title: "Roof tender", status: "DRAFT", awards: [award("a2", "e1", null), award("a1", "e1", "C/1")] },
  ],
  contractOnly: [award("a3", "e2", "C/3")],
});

describe("assembleCaseGroup", () => {
  it("holds an exercise with two awards, one with a contract", () => {
    const g = assembleCaseGroup({ ...loaded(), contractOnly: [] }, []);
    expect(g.requisition.exact).toBe(true);
    expect(g.exercises).toHaveLength(2);
    expect(g.exercises.map((e) => e.hit.id)).toEqual(["e1", "e2"]);
    expect(g.exercises[0].projects.map((p) => p.title)).toEqual(["C/1", "AW/a2"]);
    expect(g.capped).toBe(false);
  });
  // Phase 0.2 item 7: the store reads one more than the cap, newest first; the group keeps the latest, oldest first, and says it was cut.
  it("keeps the latest CASE_GROUP_SIZE of a level, oldest first, and says so only when one more was read", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => award(`b${n - i}`, "e1", `C/${n - i}`));
    const at = (n: number) => assembleCaseGroup({ ...loaded(), exercises: [{ ...loaded().exercises[1], awards: many(n) }], contractOnly: [] }, []);
    expect(at(CASE_GROUP_SIZE).capped).toBe(false);
    expect(at(CASE_GROUP_SIZE).exercises[0].projects).toHaveLength(CASE_GROUP_SIZE);
    const cut = at(CASE_GROUP_SIZE + 1);
    expect(cut.capped).toBe(true);
    expect(cut.exercises[0].projects.map((p) => p.title)).toEqual(Array.from({ length: CASE_GROUP_SIZE }, (_, i) => `C/${i + 2}`));
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
