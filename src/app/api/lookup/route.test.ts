import { beforeEach, describe, expect, it, vi } from "vitest";

const { guard, supplierFind, contractFind, hidden } = vi.hoisted(() => ({
  guard: { refuse: false },
  supplierFind: vi.fn(async (a: unknown) => (void a, [{ id: "s1", registeredName: "Acme Sdn Bhd", registrationNo: "123-A" }])),
  contractFind: vi.fn(async (a: unknown) => (void a, [{ number: "C/1", award: { awardeeName: "Acme Sdn Bhd" } }])),
  hidden: vi.fn(async () => ["ex_secret"]),
}));

vi.mock("@/app/_auth/route", async () => {
  const { STAFF_FIXTURE } = await import("@/lib/test-support/staff");
  return { staffRoute: async () => (guard.refuse ? { ok: false as const, response: Response.json({}, { status: 401 }) } : { ok: true as const, actor: STAFF_FIXTURE }) };
});
vi.mock("@/app/_auth/sulit", () => ({ hiddenExercises: hidden }));
vi.mock("@/lib/db", () => ({ db: { supplier: { findMany: supplierFind }, contract: { findMany: contractFind } } }));

import { GET } from "./route";

const get = (qs: string) => GET(new Request(`http://localhost/api/lookup?${qs}`));

describe("GET /api/lookup", () => {
  beforeEach(() => {
    guard.refuse = false;
    vi.clearAllMocks();
  });

  it("refuses nobody signed in", async () => {
    guard.refuse = true;
    expect((await get("kind=supplier")).status).toBe(401);
    expect(supplierFind).not.toHaveBeenCalled();
  });

  it("searches registered suppliers of the officer's organisation only, as name and number", async () => {
    const body = await (await get("kind=supplier&q=acme")).json();
    expect(body).toEqual({ options: [{ value: "s1", label: "Acme Sdn Bhd (123-A)" }], hasMore: false });
    const where = (supplierFind.mock.calls[0][0] as { where: { organisationId: string; status: string } }).where;
    expect(where.organisationId).toBe("org_test");
    expect(where.status).toBe("REGISTERED");
  });

  it("leaves out contracts on exercises hidden from the officer, and values them by number", async () => {
    const body = await (await get("kind=contract")).json();
    expect(body.options).toEqual([{ value: "C/1", label: "C/1 — Acme Sdn Bhd" }]);
    const where = (contractFind.mock.calls[0][0] as { where: { organisationId: string; award: { exerciseId: { notIn: string[] } } } }).where;
    expect(where.organisationId).toBe("org_test");
    expect(where.award.exerciseId.notIn).toEqual(["ex_secret"]);
  });

  it("says hasMore past a page", async () => {
    supplierFind.mockResolvedValueOnce(Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, registeredName: "N", registrationNo: "r" })));
    const body = await (await get("kind=supplier")).json();
    expect(body.options).toHaveLength(20);
    expect(body.hasMore).toBe(true);
  });

  it("refuses an unknown kind", async () => {
    expect((await get("kind=person")).status).toBe(400);
  });
});
