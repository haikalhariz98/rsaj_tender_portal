import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The public application makes what an officer's paper application makes, but through the portal
 * channel, on the organisation's day, with nobody named as the recorder. The database is a recording
 * stand-in: these tests read what would be written.
 */

const h = vi.hoisted(() => ({
  created: [] as { model: string; data: Record<string, unknown> }[],
  audits: [] as { entity: string; action: string; changes: { field: string; after: string | null }[] }[],
  transactions: 0,
  issued: 0,
  numbering: "ok" as "ok" | "missing",
  today: "2026-10-06" as string | null,
  holders: 0,
  lists: { ENTITY_TYPE: ["sdn_bhd"], COUNTRY: ["my"] } as Record<string, string[]>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      h.transactions += 1;
      const model = (name: string) => ({
        create: async ({ data }: { data: Record<string, unknown> }) => {
          h.created.push({ model: name, data });
          return { id: `${name}1`, reference: data.reference, registeredName: data.registeredName, registrationNo: data.registrationNo, entityTypeCode: data.entityTypeCode, countryCode: data.countryCode, registeredAddress: data.registeredAddress, companyEmail: data.companyEmail, name: data.name, designation: data.designation, email: data.email, phone: data.phone, receivedOn: data.receivedOn, supplier: { reference: "DEMO/SUP/008/2026" } };
        },
        count: async () => h.holders,
      });
      return fn({ supplier: model("supplier"), supplierContact: model("supplierContact"), supplierApplication: model("supplierApplication") });
    },
  },
}));
vi.mock("@/lib/suppliers/repo", () => ({
  supplierOrg: async () => ({ id: "o1", timeZone: "Asia/Kuala_Lumpur", today: h.today }),
  loadSupplierConfig: async () => ({ format: null, liveCodes: (kind: string) => h.lists[kind] ?? [], listName: (_k: string, code: string) => code }),
}));
vi.mock("@/lib/numbering/issue", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/numbering/issue")>();
  return {
    ...real,
    issueReference: async () => {
      if (h.numbering === "missing") throw new real.NumberingError("SERIES_MISSING", "supplier");
      h.issued += 1;
      return "DEMO/SUP/008/2026";
    },
  };
});
vi.mock("../../suppliers/shared", () => ({
  lockOrganisation: async () => undefined,
  stampNow: () => new Date("2026-10-06T03:00:00.000Z"),
  label: (s: { reference: string }, what: string) => `${s.reference} · ${what}`,
  audit: async (_tx: unknown, _org: string, entity: string, _id: string, _label: string, action: string, changes: { field: string; after: string | null }[]) => {
    h.audits.push({ entity, action, changes });
  },
}));

import { receiveApplication } from "./receive";

const FORM = {
  registeredName: "Sampel Works Sdn Bhd",
  registrationNo: "202001000123",
  entityTypeCode: "sdn_bhd",
  countryCode: "my",
  registeredAddress: "1 Jalan Contoh, 50000 Kuala Lumpur",
  companyEmail: "office@sampel.example",
  contactName: "Aini",
  contactDesignation: "",
  contactEmail: "aini@sampel.example",
  contactPhone: "",
};
const form = (o: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...FORM, ...o })) f.set(k, v);
  return f;
};
const send = (o?: Record<string, string>) => receiveApplication(form(o));
const row = (model: string) => h.created.find((c) => c.model === model)?.data;

beforeEach(() => {
  h.created = [];
  h.audits = [];
  h.transactions = 0;
  h.issued = 0;
  h.numbering = "ok";
  h.today = "2026-10-06";
  h.holders = 0;
  h.lists = { ENTITY_TYPE: ["sdn_bhd"], COUNTRY: ["my"] };
});

describe("a public application, as written", () => {
  it("creates the supplier, its primary contact and an application received through the portal, with no recorder", async () => {
    const r = await send();
    expect(r).toEqual({ ok: true, reference: "DEMO/SUP/008/2026" });
    expect(h.created.map((c) => c.model)).toEqual(["supplier", "supplierContact", "supplierApplication"]);
    expect(row("supplierContact")).toMatchObject({ isPrimary: true, name: "Aini", email: "aini@sampel.example" });
    const app = row("supplierApplication")!;
    expect(app).toMatchObject({ kind: "NEW", channel: "PORTAL", recordedByPersonId: null, declarationSignedOn: null, epaymentFormReceivedOn: null });
    expect(app.receivedOn).toEqual(new Date("2026-10-06T00:00:00.000Z"));
    expect(app.recordedAt).toEqual(new Date("2026-10-06T03:00:00.000Z"));
  });

  it("audits the three rows, naming nobody as the recorder", async () => {
    await send();
    expect(h.audits.map((a) => [a.entity, a.action])).toHaveLength(3);
    expect(h.audits.every((a) => a.action === "CREATE")).toBe(true);
    const application = h.audits[2].changes;
    expect(application.find((c) => c.field === "recordedBy")?.after).toMatch(/Nobody/);
  });

  it("ignores a channel, a recorder, a received day and a paper day posted by hand", async () => {
    await send({ channel: "COUNTER", recordedByPersonId: "p1", receivedOn: "2020-01-01", declarationSignedOn: "2026-10-01", epaymentFormReceivedOn: "2026-10-01" });
    expect(row("supplierApplication")).toMatchObject({ channel: "PORTAL", recordedByPersonId: null, declarationSignedOn: null, epaymentFormReceivedOn: null });
    expect((row("supplierApplication")!.receivedOn as Date).toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });

  it("takes no bank field and no file", async () => {
    await send({ bankAccount: "1234", bankName: "X" });
    for (const c of h.created) expect(JSON.stringify(c.data)).not.toMatch(/1234|bank/i);
  });
});

describe("what a stranger can and cannot do", () => {
  it("drops a filled bait field without creating anything, and says only that it was received", async () => {
    const r = await send({ faxNumber: "http://spam.example" });
    expect(r).toEqual({ ok: true, reference: null });
    expect(h.transactions).toBe(0);
    expect(h.created).toEqual([]);
  });

  it("refuses a number already on the register in neutral words, and spends no serial", async () => {
    h.holders = 1;
    const r = await send();
    expect(r.ok).toBe(false);
    expect(r.errors?.registrationNo).toBe("This registration number cannot be accepted online. Please contact the procurement office.");
    expect(JSON.stringify(r)).not.toMatch(/DEMO\/SUP|Sampel/);
    expect(h.issued).toBe(0);
    expect(h.created).toEqual([]);
  });

  it("refuses a field over its limit, in plain words, before any write", async () => {
    const r = await send({ registeredName: "x".repeat(241) });
    expect(r.ok).toBe(false);
    expect(r.errors?.registeredName).toBe("Registered name must be 240 characters or fewer.");
    expect(h.transactions).toBe(0);
  });

  it("names each missing field and writes nothing", async () => {
    const r = await send({ registeredName: "", contactName: "", contactEmail: "" });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors ?? {}).sort()).toEqual(["contactEmail", "contactName", "registeredName"]);
    expect(h.created).toEqual([]);
  });

  it("does not take an application while the register is not set up, and says so without a setting's name", async () => {
    for (const set of [() => { h.today = null; }, () => { h.lists.COUNTRY = []; }, () => { h.lists.ENTITY_TYPE = []; }, () => { h.numbering = "missing"; }]) {
      beforeEachReset();
      set();
      const r = await send();
      expect(r.ok).toBe(false);
      expect(r.message).toBe("Online applications are not open yet, so nothing was sent.");
      expect(h.created).toEqual([]);
    }
  });
});

function beforeEachReset() {
  h.created = [];
  h.today = "2026-10-06";
  h.numbering = "ok";
  h.lists = { ENTITY_TYPE: ["sdn_bhd"], COUNTRY: ["my"] };
}
