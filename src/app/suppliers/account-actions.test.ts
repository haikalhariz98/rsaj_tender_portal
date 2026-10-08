import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An officer's acts on a supplier's portal account (Phase 4a): who may, what is asked first, and what is written. The database is a recording stand-in; the
 * rules behind it (`supplier-administration.ts`) run for real, and `supplier.db.test.ts` runs them against a database.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  contact: null as Row | null,
  account: null as Row | null,
  validityMinutes: 60 as number | null,
  foreign: null as { code: string } | null,
  sulitClosed: null as string | null,
  today: "2026-10-12" as string | null,
  updates: [] as { model: string; where: Row; data: Row }[],
  created: [] as { model: string; data: Row }[],
  audits: [] as { entity: string; label: string; action: string; changes: { field: string; before: unknown; after: unknown }[]; reason: string }[],
  events: [] as Row[],
  revoked: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/app/_auth/actor", async () => (await import("@/lib/test-support/staff")).actorModule());
vi.mock("@/app/_auth/cookies", () => ({ currentRequestFacts: async () => ({ sourceAddress: null, userAgent: "" }), refuseForeignPost: async () => h.foreign }));
vi.mock("@/lib/auth/sulit-store", () => ({ sulitWriteRefusal: async () => h.sulitClosed }));
vi.mock("@/lib/auth/policy-store", () => ({ loadSecurityPolicy: async () => (h.validityMinutes == null ? { resetCodeValidityMinutes: null } : { resetCodeValidityMinutes: h.validityMinutes }) }));
vi.mock("@/lib/auth/supplier-identity", () => ({ lockSupplierAccount: async () => undefined }));
vi.mock("@/lib/auth/supplier-session-store", () => ({
  revokeSupplierAccountSessions: async () => {
    h.revoked += 1;
    return 1;
  },
}));
vi.mock("@/lib/auth/supplier-administration", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/supplier-administration")>()), unusableSupplierPasswordHash: async () => "$scrypt$stand-in" }));
vi.mock("./shared", () => {
  const tx = {
    supplierContact: {
      findFirst: async () => h.contact,
      update: async ({ where, data }: { where: Row; data: Row }) => {
        h.updates.push({ model: "supplierContact", where, data });
        return { ...h.contact, ...data };
      },
    },
    supplierAccount: {
      findFirst: async () => h.account,
      findUnique: async () => null,
      create: async ({ data }: { data: Row }) => {
        h.created.push({ model: "supplierAccount", data });
        return { id: "acc1" };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        h.updates.push({ model: "supplierAccount", where, data });
        return { ...h.account, ...data };
      },
    },
    oneTimeCode: {
      create: async ({ data }: { data: Row }) => {
        h.created.push({ model: "oneTimeCode", data });
        return { id: "code1" };
      },
      updateMany: async () => ({ count: 0 }),
    },
    signInEvent: {
      create: async ({ data }: { data: Row }) => {
        h.events.push(data);
        return { id: "ev1" };
      },
    },
    auditEntry: {
      create: async ({ data }: { data: { entity: string; entityLabel: string; action: string; changes: { field: string; before: unknown; after: unknown }[]; reason: string } }) => {
        h.audits.push({ entity: data.entity, label: data.entityLabel, action: data.action, changes: data.changes, reason: data.reason });
      },
    },
  };
  return {
    GONE: { ok: false, message: "That supplier no longer exists." },
    Refusal: class extends Error {
      constructor(readonly state: { ok: boolean }) {
        super("Refused");
      }
    },
    stampNow: () => new Date("2026-10-12T03:00:00.000Z"),
    label: (s: { reference: string }, what: string) => `${s.reference} · ${what}`,
    audit: async (_tx: unknown, _actor: unknown, _org: string, entity: string, _id: string, label: string, action: string, changes: { field: string; before: unknown; after: unknown }[], reason = "") => {
      h.audits.push({ entity, label, action, changes, reason });
    },
    inSupplier: async (_scope: unknown, supplierId: string, fn: (tx: unknown, l: unknown) => Promise<{ ok: boolean }>) => fn(tx, { org: { id: "org_test", today: h.today, timeZone: "Asia/Kuala_Lumpur" }, supplier: { id: supplierId, reference: "DEMO/SUP/0001/2026", registeredName: "Sampel", status: "APPLICANT", organisationId: "org_test" } }),
  };
});

import { STAFF_FIXTURE } from "@/lib/test-support/staff";

import { issueSupplierCodeAction, openSupplierAccountAction, retireContactAction, unlockSupplierAccountAction } from "./account-actions";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const grant = () => (STAFF_FIXTURE.permissions as Set<string>).add("supplierAccounts.manage");

beforeEach(() => {
  (STAFF_FIXTURE.permissions as Set<string>).clear();
  h.contact = { id: "c1", name: "Aini", isPrimary: false, retiredOn: null, email: "aini@x.example", account: null };
  h.account = { id: "acc1", loginName: "aini.x", status: "ACTIVE", failedAttempts: 2, lockedUntil: null, contact: { retiredOn: null } };
  h.validityMinutes = 60;
  h.foreign = null;
  h.sulitClosed = null;
  h.today = "2026-10-12";
  h.updates = [];
  h.created = [];
  h.audits = [];
  h.events = [];
  h.revoked = 0;
});

const OPEN = { supplierId: "s1", contactId: "c1", loginName: "aini.x", identityCheck: "Seen at the counter" };
const ISSUE = { supplierId: "s1", accountId: "acc1", purpose: "RESET", identityCheck: "Called back" };
const UNLOCK = { supplierId: "s1", accountId: "acc1", identityCheck: "Called back" };

describe("the three acts that need the permission to manage supplier accounts", () => {
  const acts = [
    ["open an account", (f: Record<string, string>) => openSupplierAccountAction({ ok: false }, form(f)), OPEN],
    ["issue a code", (f: Record<string, string>) => issueSupplierCodeAction({ ok: false }, form(f)), ISSUE],
    ["unlock an account", (f: Record<string, string>) => unlockSupplierAccountAction({ ok: false }, form(f)), UNLOCK],
  ] as const;

  it.each(acts)("%s: is refused to an officer who does not hold the permission, and nothing is read or written", async (_n, act, fields) => {
    const r = await act(fields);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/supplierAccounts\.manage|manage supplier accounts/);
    expect(h.created).toEqual([]);
    expect(h.updates).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it.each(acts)("%s: is refused a request from another site before anything is parsed", async (_n, act, fields) => {
    grant();
    h.foreign = { code: "CROSS_SITE" };
    const r = await act(fields);
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/did not come from this site/) });
    expect(h.created).toEqual([]);
  });

  it.each(acts)("%s: names a field it does not take, and a missing one, by field", async (_n, act, fields) => {
    grant();
    const extra = await act({ ...fields, supplierIdOfTheirChoice: "s2" });
    expect(extra.errors).toHaveProperty("supplierIdOfTheirChoice");
    const { identityCheck, ...rest } = fields as Record<string, string>;
    void identityCheck;
    const missing = await act(rest);
    expect(missing.errors).toHaveProperty("identityCheck");
    expect(h.created).toEqual([]);
  });
});

describe("opening an account and issuing a code", () => {
  it("opens the account and returns the code once, with the check in the trail and the code nowhere else", async () => {
    grant();
    const r = await openSupplierAccountAction({ ok: false }, form(OPEN));
    expect(r.ok).toBe(true);
    expect(r.issued?.code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{2,4}){5,6}$/);
    expect(h.created.map((c) => c.model)).toEqual(["supplierAccount", "oneTimeCode"]);
    expect(h.events.map((e) => e.kind)).toEqual(["ACCOUNT_CREATED", "CODE_ISSUED"]);
    const trail = JSON.stringify(h.audits);
    expect(trail).toContain("Seen at the counter");
    expect(trail).not.toContain(r.issued!.code.replace(/-/g, ""));
    expect(trail).not.toContain("aini.x");
  });

  it("is refused, naming the setting, while the code's validity is not set", async () => {
    grant();
    h.validityMinutes = null;
    const r = await issueSupplierCodeAction({ ok: false }, form(ISSUE));
    expect(r.ok).toBe(false);
    expect(r.message).toContain("How long a one-time code stays valid");
    expect(h.created).toEqual([]);
  });

  it("issues a reset code for an active account, ends its sessions at once, and shows the code once", async () => {
    grant();
    const r = await issueSupplierCodeAction({ ok: false }, form(ISSUE));
    expect(r.ok).toBe(true);
    expect(r.issued?.code).toBeTruthy();
    expect(h.revoked).toBe(1);
    expect(h.created).toEqual([expect.objectContaining({ model: "oneTimeCode", data: expect.objectContaining({ purpose: "RESET", store: "SUPPLIER", identityCheck: "Called back" }) })]);
  });

  it("will not issue an activation code for an active account, and says so", async () => {
    grant();
    const r = await issueSupplierCodeAction({ ok: false }, form({ ...ISSUE, purpose: "ACTIVATION" }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not been activated|has been/);
    expect(h.created).toEqual([]);
  });

  it("unlocks only an account with something to unlock", async () => {
    grant();
    const ok = await unlockSupplierAccountAction({ ok: false }, form(UNLOCK));
    expect(ok.ok).toBe(true);
    expect(h.updates).toEqual([expect.objectContaining({ model: "supplierAccount", data: { failedAttempts: 0, lockedUntil: null } })]);
    h.updates = [];
    h.account = { ...h.account, failedAttempts: 0, lockedUntil: null };
    const none = await unlockSupplierAccountAction({ ok: false }, form(UNLOCK));
    expect(none.ok).toBe(false);
    expect(h.updates).toEqual([]);
  });
});

describe("retiring a contact", () => {
  const RETIRE = { supplierId: "s1", contactId: "c1", reason: "Left the company" };
  const retire = (o: Record<string, string> = {}) => retireContactAction({ ok: false }, form({ ...RETIRE, ...o }));

  it("retires a contact who is not the primary one, on the organisation's day, and disables their account in the same transaction", async () => {
    const r = await retire();
    expect(r.ok).toBe(true);
    expect(h.updates[0]).toMatchObject({ model: "supplierContact", data: { retiredOn: new Date("2026-10-12T00:00:00.000Z") } });
    expect(h.updates.find((u) => u.model === "supplierAccount")?.data).toMatchObject({ status: "DISABLED", disabledReason: "The contact was retired: Left the company" });
    expect(h.revoked).toBe(1);
    expect(h.events.map((e) => e.kind)).toContain("ACCOUNT_DISABLED");
    const contactRow = h.audits.find((a) => a.entity === "SupplierContact")!;
    expect(contactRow.changes.find((c) => c.field === "retiredOn")?.after).toBe("2026-10-12");
    expect(contactRow.reason).toBe("Left the company");
  });

  it("does not retire the primary contact: another is made primary first, and nothing is written", async () => {
    h.contact = { ...h.contact, isPrimary: true };
    const r = await retire();
    expect(r.ok).toBe(false);
    expect(r.errors?.reason).toMatch(/primary contact/);
    expect(h.updates).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it("is refused a reader the contact's details are closed to, as editing them is, and writes nothing", async () => {
    h.sulitClosed = "The organisation has not yet decided which roles read these.";
    const r = await retire();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/SULIT and are closed to you/);
    expect(h.updates).toEqual([]);
  });

  it("answers 'no such supplier' for a contact that is not on this supplier, or already retired", async () => {
    h.contact = null;
    const r = await retire();
    expect(r).toMatchObject({ ok: false, message: "That supplier no longer exists." });
    expect(h.updates).toEqual([]);
  });

  it("needs a reason, and an organisation time zone", async () => {
    expect((await retire({ reason: " " })).errors).toHaveProperty("reason");
    h.today = null;
    const r = await retire();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/time zone/);
    expect(h.updates).toEqual([]);
  });

  it("does nothing to an account when the contact has none", async () => {
    h.account = null;
    const r = await retire();
    expect(r.ok).toBe(true);
    expect(h.updates.map((u) => u.model)).toEqual(["supplierContact"]);
    expect(h.revoked).toBe(0);
  });
});
