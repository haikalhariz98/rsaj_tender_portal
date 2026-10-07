import { describe, expect, it } from "vitest";

import { attributeSeededRows, DEMO_ATTRIBUTION_REASON } from "../../../prisma/demo-attribution";

/**
 * The attribution of the demo's own rows (review of Phase 2b): scoped to the organisation it is run for, and only where the demo loader is the only one that ever
 * acted on the record. The database is faked: the function reads the slot columns, the people, the existing attributions and the trail, and writes one batch.
 */

type Row = Record<string, string | null>;
interface Trail {
  entityId: string;
  actorKind: "STAFF" | "SUPPLIER" | "SYSTEM" | null;
  actorSystemLabel: string | null;
}

function fake(world: { organisations?: number; people: string[]; steps: Row[]; trail: Trail[]; have?: string[] }) {
  const created: { entityId: string; slot: string; subjectPersonId: string; organisationId: string }[] = [];
  const empty = { findMany: async () => [] as Row[] };
  const models: Record<string, { findMany: (a?: unknown) => Promise<Row[]> }> = {
    approvalStep: { findMany: async () => world.steps },
  };
  const db = new Proxy(
    {
      organisation: { count: async () => world.organisations ?? 1 },
      person: { findMany: async () => world.people.map((id) => ({ id })) },
      actAttribution: {
        findMany: async (a: { where: { entity: string } }) => (a.where.entity === "ApprovalStep" ? (world.have ?? []).map((entityId) => ({ entityId })) : []),
        createMany: async (a: { data: typeof created }) => (created.push(...a.data), { count: a.data.length }),
      },
      auditEntry: { findMany: async (a: { where: { entity: string } }) => (a.where.entity === "ApprovalStep" ? world.trail : []) },
    } as Record<string, unknown>,
    { get: (t, k: string) => t[k] ?? models[k] ?? empty },
  );
  return { db: db as never, created };
}

const loader: Trail["actorKind"] = "SYSTEM";
const step = (id: string, person: string): Row => ({ id, decidedByPersonId: person });

describe("attributing the demo's own rows", () => {
  it("attributes a row the demo loader wrote, to the demo loader, for the person it names", async () => {
    const w = fake({ people: ["p1"], steps: [step("s1", "p1")], trail: [{ entityId: "s1", actorKind: loader, actorSystemLabel: "demo loader" }] });
    expect(await attributeSeededRows(w.db, "org1")).toBe(1);
    expect(w.created).toEqual([expect.objectContaining({ entityId: "s1", slot: "decidedBy", subjectPersonId: "p1", organisationId: "org1", reason: DEMO_ATTRIBUTION_REASON, recordedBySystemLabel: "demo loader" })]);
  });

  it("attributes a demo_ id the trail does not mention, and writes nothing again for one already attributed", async () => {
    const w = fake({ people: ["p1"], steps: [step("demo_s1", "p1")], trail: [] });
    expect(await attributeSeededRows(w.db, "org1")).toBe(1);
    const again = fake({ people: ["p1"], steps: [step("demo_s1", "p1")], trail: [], have: ["demo_s1"] });
    expect(await attributeSeededRows(again.db, "org1")).toBe(0);
  });

  it("leaves a record a signed-in person acted on alone: its missing attribution stays visible, in an append-only table", async () => {
    // A demo step the loader created and a signed-in officer then decided by a path that wrote no attribution.
    const w = fake({
      people: ["p1"],
      steps: [step("demo_s1", "p1")],
      trail: [
        { entityId: "demo_s1", actorKind: loader, actorSystemLabel: "demo loader" },
        { entityId: "demo_s1", actorKind: "STAFF", actorSystemLabel: null },
      ],
    });
    expect(await attributeSeededRows(w.db, "org1")).toBe(0);
    expect(w.created).toEqual([]);
  });

  it("leaves a row of an organisation that is not the one named: its person is not this organisation's", async () => {
    const w = fake({ people: ["p1"], steps: [step("demo_s1", "p1"), step("demo_s2", "someone-in-another-organisation")], trail: [] });
    expect(await attributeSeededRows(w.db, "org1")).toBe(1);
    expect(w.created.map((c) => c.entityId)).toEqual(["demo_s1"]);
  });

  it("leaves an ordinary row of the organisation's own: not a demo row, and not the loader's", async () => {
    const w = fake({ people: ["p1"], steps: [step("cmgx1", "p1")], trail: [{ entityId: "cmgx1", actorKind: null, actorSystemLabel: null }] });
    expect(await attributeSeededRows(w.db, "org1")).toBe(0);
  });

  it("refuses a database that holds more than the demo's organisation, and writes nothing", async () => {
    const w = fake({ organisations: 2, people: ["p1"], steps: [step("demo_s1", "p1")], trail: [] });
    await expect(attributeSeededRows(w.db, "org1")).rejects.toThrow(/2 organisations/);
    expect(w.created).toEqual([]);
  });
});
