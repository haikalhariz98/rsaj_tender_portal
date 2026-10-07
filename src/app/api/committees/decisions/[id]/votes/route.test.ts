import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A vote is the signed-in member's own (ADR 0034 D12, Phase 2b; F1): the body never says who is voting. A vote on another member's signed sheet is recorded for
 * them only by the holder of the committee's Secretariat office on the day, and then stores both people. The sitting, the database and the rules of
 * `canVote` are stand-ins; the reading of the body, the attribution and the secretariat's seat are the real ones.
 */

const h = vi.hoisted(() => ({
  secretariat: [] as { id: string }[],
  upserts: [] as { personId: string }[],
  audits: [] as string[],
  act: null as unknown as { module: Record<string, unknown>; written: { entity: string; slot: string; subjectPersonId: string | null; mode: string; reason: string | undefined; paperReference: string | undefined }[] },
}));

vi.mock("@/app/_auth/actor", async () => (await import("@/lib/test-support/staff")).actorModule());
vi.mock("@/app/_auth/route", async () => (await import("@/lib/test-support/staff")).routeModule());
vi.mock("@/app/_auth/act", async () => {
  h.act = (await import("@/lib/test-support/staff")).actModule();
  return h.act.module;
});
vi.mock("@/lib/db", () => ({ db: { committeeDecision: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "d1" ? { meetingId: "m1" } : null) } } }));
vi.mock("@/lib/audit/record", () => ({ writeAudit: async (_tx: unknown, ctx: { entityLabel: string }) => void h.audits.push(ctx.entityLabel) }));
vi.mock("@/lib/committee/matter", async (orig) => ({ ...(await orig<typeof import("@/lib/committee/matter")>()), canVote: () => ({ ok: true as const }) }));
vi.mock("@/lib/committee/tabling", async (orig) => ({ ...(await orig<typeof import("@/lib/committee/tabling")>()), secretariatHoldersOn: () => h.secretariat }));
vi.mock("@/lib/committee/sittings", () => ({
  withLockedSitting: async (_scope: unknown, _id: string, fn: (tx: unknown, s: unknown) => Promise<Response>) =>
    fn(
      { vote: { upsert: async ({ create }: { create: { personId: string } }) => (h.upserts.push(create), { id: "vote1", choice: "SETUJU" }) } },
      {
        organisationId: "org_test",
        today: "2026-10-07",
        roster: {},
        names: { person_test: "Test Officer", member: "A Member" },
        assessment: { matters: { d1: { entitledIds: ["person_test", "member"] } } },
        meeting: { status: "IN_PROGRESS", meetingDate: new Date("2026-10-07"), committee: { secretariatRoleCode: "SETIAUSAHA" }, decisions: [{ id: "d1", outcome: null, tabledByPersonId: "t", recusals: [], votes: [], withdrawnAt: null, subject: "A matter" }] },
      },
    ),
}));

import { STAFF_FIXTURE } from "@/lib/test-support/staff";

import { POST } from "./route";

const ask = async (body: Record<string, unknown>, id = "d1") => {
  const res = await POST(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ choice: "SETUJU", votedAt: "2026-10-07", ...body }) }), { params: Promise.resolve({ id }) } as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  h.secretariat = [];
  h.upserts = [];
  h.audits = [];
  h.act.written.length = 0;
});

describe("who votes", () => {
  it("is the member signed in, and a body that names no one, or names them, votes as them", async () => {
    expect((await ask({})).status).toBe(200);
    expect((await ask({ personId: STAFF_FIXTURE.personId })).status).toBe(200);
    expect(h.upserts.map((u) => u.personId)).toEqual([STAFF_FIXTURE.personId, STAFF_FIXTURE.personId]);
    expect(h.act.written).toEqual([expect.objectContaining({ entity: "Vote", slot: "person", subjectPersonId: STAFF_FIXTURE.personId, mode: "SIGNED" }), expect.objectContaining({ mode: "SIGNED" })]);
  });

  it("is refused where the body names another member and the signed-in person does not hold the Secretariat office", async () => {
    const r = await ask({ onBehalfOf: "member", reason: "The member's signed sheet" });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/Secretariat office/);
    expect(h.upserts).toEqual([]);
    expect(h.act.written).toEqual([]);
  });

  it("is refused where the body names another member in the old key (personId) and the signed-in person does not hold the office", async () => {
    h.secretariat = [];
    const r = await ask({ personId: "member", reason: "The member's signed sheet" });
    expect(r.status).toBe(403);
    expect(h.upserts).toEqual([]);
  });

  it("is refused where the body names another member without the sheet's reference or the reason, even for the Secretariat", async () => {
    h.secretariat = [{ id: STAFF_FIXTURE.personId }];
    const r = await ask({ onBehalfOf: "member" });
    expect(r.status).toBe(403);
    expect(h.upserts).toEqual([]);
  });

  it("is recorded for the member by the holder of the Secretariat office, and both people are stored: the member's vote, and the officer who recorded it", async () => {
    h.secretariat = [{ id: STAFF_FIXTURE.personId }];
    const r = await ask({ onBehalfOf: "member", paperReference: "Sheet 14/2026" });
    expect(r.status).toBe(200);
    expect(h.upserts).toEqual([{ personId: "member", choice: "SETUJU", comment: "", votedAt: expect.any(Date), decisionId: "d1" }]);
    expect(h.act.written).toEqual([expect.objectContaining({ entity: "Vote", slot: "person", subjectPersonId: "member", mode: "RECORDED_ON_BEHALF", paperReference: "Sheet 14/2026" })]);
  });

  it("answers a matter that is not this organisation's as a matter that is not there, before it reads who is voting", async () => {
    const r = await ask({ onBehalfOf: "member" }, "elsewhere");
    expect(r.status).toBe(404);
  });
});
