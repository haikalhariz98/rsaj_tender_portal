import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A code shown once must stay on screen (found in the rehearsal of recording an application, and again in review for opening an account from the supplier's page). A success
 * revalidates the supplier's pages, Next renders the page again with the action's answer, and a contact that now has an account gets a different component where "open an
 * account" was: React unmounts the dialog and the code with it. The acts that return a code therefore do not revalidate.
 *
 * Unlike `account-actions.test.ts`, `./shared` is NOT mocked here: the real `inSupplier` and its real call to `revalidatePath` are what is under test. Only the database,
 * the lock and the rules behind the acts are stood in for.
 */

const h = vi.hoisted(() => ({ revalidated: [] as string[], closed: null as string | null }));

vi.mock("next/cache", () => ({ revalidatePath: (path: string) => void h.revalidated.push(path) }));
vi.mock("@/lib/db", () => ({ db: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ supplierContact: { findFirst: async () => ({ id: "c1", isPrimary: false }), update: async () => ({}) }, auditEntry: { create: async () => ({ id: "audit-1" }) } }) } }));
vi.mock("@/lib/suppliers/write", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/suppliers/write")>()),
  withLockedSupplier: async (tx: unknown, _org: string, supplierId: string, fn: (tx: unknown, l: unknown) => Promise<unknown>) =>
    fn(tx, { org: { id: "org_test", today: "2026-10-12", timeZone: "Asia/Kuala_Lumpur" }, supplier: { id: supplierId, reference: "DEMO/SUP/0001/2026", registeredName: "Sampel", status: "APPLICANT", organisationId: "org_test" } }),
}));
vi.mock("@/app/_auth/actor", async () => (await import("@/lib/test-support/staff")).actorModule());
vi.mock("@/app/_auth/cookies", () => ({ currentRequestFacts: async () => ({ sourceAddress: null, userAgent: "" }), refuseForeignPost: async () => null }));
vi.mock("@/lib/auth/sulit-store", () => ({ sulitWriteRefusal: async () => h.closed }));
vi.mock("@/lib/auth/policy-store", () => ({ loadSecurityPolicy: async () => ({ resetCodeValidityMinutes: 60 }) }));
vi.mock("@/lib/auth/supplier-administration", async (importOriginal) => {
  const issued = { code: "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ", expiresAt: new Date("2026-10-12T04:00:00.000Z") };
  return {
    ...(await importOriginal<typeof import("@/lib/auth/supplier-administration")>()),
    unusableSupplierPasswordHash: async () => "$scrypt$stand-in",
    openSupplierAccount: async () => ({ ok: true, issued }),
    issueSupplierCode: async () => ({ ok: true, issued }),
    unlockSupplierAccount: async () => ({ ok: true }),
    disableAccountOfRetiredContact: async () => undefined,
  };
});

import { STAFF_FIXTURE } from "@/lib/test-support/staff";

import { issueSupplierCodeAction, openSupplierAccountAction, retireContactAction, unlockSupplierAccountAction } from "./account-actions";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  (STAFF_FIXTURE.permissions as Set<string>).clear();
  (STAFF_FIXTURE.permissions as Set<string>).add("supplierAccounts.manage");
  h.revalidated = [];
  h.closed = null;
});

describe("the acts that return a code do not make Next render the supplier's page again while the code is on screen", () => {
  it("opening an account returns the code and revalidates nothing", async () => {
    const r = await openSupplierAccountAction({ ok: false }, form({ supplierId: "s1", contactId: "c1", loginName: "aini.x", identityCheck: "Seen at the counter" }));
    expect(r.ok).toBe(true);
    expect(r.issued?.code).toBeTruthy();
    expect(h.revalidated).toEqual([]);
  });

  it("issuing a code returns it and revalidates nothing", async () => {
    const r = await issueSupplierCodeAction({ ok: false }, form({ supplierId: "s1", accountId: "acc1", purpose: "ACTIVATION", identityCheck: "Called back" }));
    expect(r.ok).toBe(true);
    expect(r.issued?.code).toBeTruthy();
    expect(h.revalidated).toEqual([]);
  });

  it("the acts that return no code still revalidate the supplier's page (unlocking, retiring a contact)", async () => {
    expect((await unlockSupplierAccountAction({ ok: false }, form({ supplierId: "s1", accountId: "acc1", identityCheck: "Called back" }))).ok).toBe(true);
    expect(h.revalidated).toContain("/suppliers/s1");
    h.revalidated = [];
    expect((await retireContactAction({ ok: false }, form({ supplierId: "s1", contactId: "c1", reason: "Left" }))).ok).toBe(true);
    expect(h.revalidated).toContain("/suppliers/s1");
  });
});
