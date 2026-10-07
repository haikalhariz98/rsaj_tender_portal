import { beforeEach, describe, expect, it, vi } from "vitest";

const { versionFindFirst, holdFindFirst } = vi.hoisted(() => ({ versionFindFirst: vi.fn(), holdFindFirst: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
// Phase 1b: every action asks who is signed in first; these tests are not about sign-in, so a signed-in officer stands in for the session.
vi.mock("@/app/_auth/actor", async () => (await import("@/lib/test-support/staff")).actorModule());
// Phase 2b: every act is attributed to the signed-in person (`beginAct`). The real reading of the form stands, with the organisation's switch, the password and the write faked.
vi.mock("@/app/_auth/act", async () => (await import("@/lib/test-support/staff")).actModule().module);
vi.mock("@/lib/db", () => ({ db: { documentVersion: { findFirst: versionFindFirst }, legalHold: { findFirst: holdFindFirst } } }));
vi.mock("@/lib/documents/service", () => ({ documentOrg: async () => ({ id: "org1" }), lockDocument: async () => undefined, logAccess: async () => undefined }));

import { releaseLegalHold, withdrawVersion } from "./actions";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  versionFindFirst.mockReset();
  holdFindFirst.mockReset();
});

describe("a foreign id reads as unknown (audit C-5)", () => {
  it("withdrawing looks the version up within the organisation, and answers as for a missing one", async () => {
    versionFindFirst.mockResolvedValue(null);
    const r = await withdrawVersion({ ok: false }, form({ versionId: "foreign", reason: "x" }));
    expect(versionFindFirst).toHaveBeenCalledWith({ where: { id: "foreign", organisationId: "org1" }, select: { documentId: true } });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("That version no longer exists.");
  });
  it("releasing looks the hold up within the organisation, and answers as for a missing one", async () => {
    holdFindFirst.mockResolvedValue(null);
    const r = await releaseLegalHold({ ok: false }, form({ holdId: "foreign", reason: "x" }));
    expect(holdFindFirst).toHaveBeenCalledWith({ where: { id: "foreign", organisationId: "org1" }, select: { documentId: true } });
    expect(r).toEqual({ ok: false, message: "That record no longer exists." });
  });
});
