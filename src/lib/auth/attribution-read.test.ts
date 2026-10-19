import { describe, expect, it } from "vitest";

import { buildIndex, loadAttributions } from "./attribution-read";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const row = (over: Record<string, unknown> = {}) => ({
  entity: "ApprovalStep",
  entityId: "s1",
  slot: "decidedBy",
  occurrence: 1,
  mode: "SIGNED" as const,
  recordedBySystemLabel: null,
  effectiveOn: null,
  recordedByPerson: { name: "Aini" },
  backdateAuthorisedByPerson: null,
  ...over,
});
const ref = { entity: "ApprovalStep", id: "s1", slot: "decidedBy" };

describe("how a screen reads who did an act", () => {
  it("reads a signature as signed, in the words of the slot", () => {
    expect(buildIndex([row()], new Set()).read(ref, "Aini").en).toBe("Signed by Aini");
    // An act that is signed but is not a signature reads in its own slot's words.
    const own = buildIndex([row({ entity: "Possession", slot: "recordedBy", entityId: "p1" })], new Set()).read({ entity: "Possession", id: "p1", slot: "recordedBy" }, "Aini");
    expect(own).toMatchObject({ state: "SIGNED", en: "Recorded by Aini" });
  });

  it("reads an act recorded from paper as the recorder's, for the person, not signed", () => {
    const read = buildIndex([row({ mode: "RECORDED_ON_BEHALF", recordedByPerson: { name: "Clerk" } })], new Set()).read(ref, "Aini");
    expect(read).toMatchObject({ state: "ON_BEHALF", en: "Recorded by Clerk on behalf of Aini, not signed" });
  });

  it("reads an act the system recorded as the system's, by its label", () => {
    const read = buildIndex([row({ mode: "RECORDED_ON_BEHALF", recordedByPerson: null, recordedBySystemLabel: "demo loader" })], new Set()).read(ref, "Aini");
    expect(read.en).toContain("demo loader");
  });

  it("reads the latest occurrence of a slot written again, and never an earlier one", () => {
    const rows = [row({ occurrence: 1, mode: "RECORDED_ON_BEHALF", recordedByPerson: { name: "Clerk" } }), row({ occurrence: 2 })];
    expect(buildIndex(rows, new Set()).read(ref, "Aini").state).toBe("SIGNED");
  });

  it("says when a signature was back-dated, the day and who authorised it", () => {
    const read = buildIndex([row({ effectiveOn: new Date("2026-09-30"), backdateAuthorisedByPerson: { name: "Boss" } })], new Set()).read(ref, "Aini");
    expect(read.en).toBe("Signed by Aini, dated 2026-09-30 (back-dated; the signer names Boss as authorising it, not confirmed)");
  });

  it("names the day a back-dating was confirmed in the organisation's zone, not in UTC", () => {
    // 23:30 UTC on the 8th is 07:30 on the 9th in Kuala Lumpur.
    const r = row({ effectiveOn: new Date("2026-09-30"), backdateAuthorisedByPerson: { name: "Boss" }, confirmation: { confirmedAt: new Date("2026-10-08T23:30:00Z") } });
    expect(buildIndex([r], new Set(), "Asia/Kuala_Lumpur").read(ref, "Aini").en).toContain("Boss confirmed it on 2026-10-09");
    expect(buildIndex([r], new Set(), "UTC").read(ref, "Aini").en).toContain("Boss confirmed it on 2026-10-08");
  });

  it("reads an act with no attribution as before sign-in where nothing in the trail names who, and as missing where it does", () => {
    expect(buildIndex([], new Set()).read(ref, "Aini")).toMatchObject({ state: "LEGACY", en: "Recorded on behalf of Aini, not signed (before sign-in)" });
    expect(buildIndex([], new Set(["ApprovalStep\u0000s1"])).read(ref, "Aini")).toMatchObject({ state: "MISSING", en: "Attribution missing" });
  });

  it("reads no person as a person no longer on record, never as a blank", () => {
    expect(buildIndex([], new Set()).read(ref, null).en).toContain("a person no longer on record");
  });
});

describe("the batch read", () => {
  it("makes no query where nothing is asked, and asks the trail only for the acts that have no attribution", async () => {
    const calls: string[] = [];
    const client = {
      actAttribution: { findMany: async () => (calls.push("attributions"), [row({ entityId: "s1" })]) },
      auditEntry: {
        findMany: async (q: { where: { OR: { entityId: { in: string[] } }[] } }) => (calls.push(`trail ${q.where.OR[0].entityId.in.join(",")}`), [{ entity: "ApprovalStep", entityId: "s2", unattributed: false }]),
      },
    };
    expect(await loadAttributions(client as never, "org", [])).toBeTruthy();
    expect(calls).toEqual([]);
    const index = await loadAttributions(client as never, "org", [{ entity: "ApprovalStep", ids: ["s1", "s2"], slot: "decidedBy" }]);
    expect(calls).toEqual(["attributions", "trail s2"]);
    expect(index.read(ref, "Aini").state).toBe("SIGNED");
    expect(index.read({ ...ref, id: "s2" }, "Boss").state).toBe("MISSING");
  });
});

describe("a record made before sign-in and acted on after it (review of Phase 2b)", () => {
  // The trail of one step: created before sign-in (names nobody), decided after (names the actor), and the decision wrote no attribution.
  const trail = [
    { entity: "ApprovalStep", entityId: "s9", unattributed: true, at: 1 },
    { entity: "ApprovalStep", entityId: "s9", unattributed: false, at: 2 },
    { entity: "ApprovalStep", entityId: "old", unattributed: true, at: 1 },
  ];
  const client = {
    actAttribution: { findMany: async () => [] },
    auditEntry: {
      findMany: async (q: { where: { unattributed?: boolean; OR: { entityId: { in: string[] } }[] }; distinct?: string[] }) => {
        const ids = new Set(q.where.OR.flatMap((o) => o.entityId.in));
        const rows = trail.filter((t) => ids.has(t.entityId) && (q.where.unattributed === undefined || t.unattributed === q.where.unattributed));
        return q.distinct ? rows.filter((r, i) => rows.findIndex((x) => x.entity === r.entity && x.entityId === r.entityId) === i) : rows;
      },
    },
  };

  it("reads Attribution missing, not before sign-in: the first row of the record is old and the act's own is not", async () => {
    const index = await loadAttributions(client as never, "org", [{ entity: "ApprovalStep", ids: ["s9", "old"], slot: "decidedBy" }]);
    expect(index.read({ entity: "ApprovalStep", id: "s9", slot: "decidedBy" }, "Aini")).toMatchObject({ state: "MISSING", en: "Attribution missing" });
    // A record whose whole trail names nobody is still before sign-in.
    expect(index.read({ entity: "ApprovalStep", id: "old", slot: "decidedBy" }, "Aini").state).toBe("LEGACY");
  });
});
