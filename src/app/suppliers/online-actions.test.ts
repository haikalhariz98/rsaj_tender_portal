import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An officer's two acts on an online application: set it aside, or record the supplier from it. Both
 * erase what the applicant typed once decided, and neither puts the applicant's details in the audit
 * trail of the application. The database is a recording stand-in.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  portal: null as Row | null,
  person: { id: "p1", name: "Officer Aziz" } as { id: string; name: string } | null,
  holder: null as { reference: string; registeredName: string } | null,
  updates: [] as { model: string; where: Row; data: Row }[],
  created: [] as { model: string; data: Row }[],
  audits: [] as { entity: string; label: string; action: string; changes: { field: string; before: unknown; after: unknown }[]; reason: string }[],
  locks: [] as string[],
  today: "2026-10-07" as string | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
// Phase 1b: every action asks who is signed in first; these tests are not about sign-in, so a signed-in officer stands in for the session.
vi.mock("@/app/_auth/actor", async () => (await import("@/lib/test-support/staff")).actorModule());
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: async (strings: TemplateStringsArray) => {
          h.locks.push(strings.join("?"));
          return [];
        },
        // Setting aside runs in the lib (src/lib/suppliers/application-acts.ts), which reads the person and writes the audit row itself.
        person: { findFirst: async () => h.person },
        auditEntry: {
          create: async ({ data }: { data: { entity: string; entityLabel: string; action: string; changes: { field: string; before: unknown; after: unknown }[]; reason: string } }) => {
            h.audits.push({ entity: data.entity, label: data.entityLabel, action: data.action, changes: data.changes, reason: data.reason });
          },
        },
        portalApplication: {
          findFirst: async () => h.portal,
          update: async ({ where, data }: { where: Row; data: Row }) => {
            h.updates.push({ model: "portalApplication", where, data });
            return { ...h.portal, ...data };
          },
        },
        supplier: {
          findFirst: async () => h.holder,
          create: async ({ data }: { data: Row }) => {
            h.created.push({ model: "supplier", data });
            return { id: "s1", ...data };
          },
        },
        supplierContact: {
          create: async ({ data }: { data: Row }) => {
            h.created.push({ model: "supplierContact", data });
            return { id: "c1", ...data };
          },
        },
        supplierApplication: {
          create: async ({ data }: { data: Row }) => {
            h.created.push({ model: "supplierApplication", data });
            return { id: "a1", ...data, supplier: { reference: "DEMO/SUP/0009/2026" } };
          },
        },
      }),
  },
}));
vi.mock("@/lib/suppliers/repo", () => ({
  supplierOrg: async () => ({ id: "o1", timeZone: "Asia/Kuala_Lumpur", today: h.today }),
  loadSupplierConfig: async () => ({ format: null, liveCodes: (kind: string) => (kind === "ENTITY_TYPE" ? ["sdn_bhd"] : ["my"]), listName: (_k: string, code: string) => code }),
  documentFacts: () => ({}),
  typeFacts: () => ({}),
}));
vi.mock("@/lib/numbering/issue", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/numbering/issue")>()), issueReference: async () => "DEMO/SUP/0009/2026" }));
vi.mock("./shared", () => ({
  activePerson: async () => h.person,
  // Phase 1b: the shared audit helper takes who acted as its second argument.
  audit: async (_tx: unknown, _actor: unknown, _org: string, entity: string, _id: string, label: string, action: string, changes: { field: string; before: unknown; after: unknown }[], reason = "") => {
    h.audits.push({ entity, label, action, changes, reason });
  },
  CHANGED: { ok: false },
  GONE: { ok: false },
  inSupplier: async () => ({ ok: false }),
  label: (s: { reference: string }, what: string) => `${s.reference} · ${what}`,
  lockOrganisation: async () => {
    h.locks.push("organisation");
  },
  NO_ORG: { ok: false, message: "No organisation" },
  refuse: () => ({ ok: false }),
  Refusal: class extends Error {},
  stampNow: () => new Date("2026-10-07T03:00:00.000Z"),
}));

import { discardPortalApplication, recordApplication } from "./actions";

const WAITING: Row = {
  id: "pa1",
  organisationId: "o1",
  reference: "DEMO/APP/0007/2026",
  status: "RECEIVED",
  receivedOn: new Date("2026-10-05T00:00:00.000Z"),
  registeredName: "Sampel Works Sdn Bhd",
  registrationNo: "202001000123",
  registrationNoKey: "202001000123",
  contactName: "Aini",
  contactEmail: "aini@sampel.example",
};
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const PERSONAL = ["registeredName", "registrationNo", "registrationNoKey", "entityTypeCode", "countryCode", "registeredAddress", "companyEmail", "contactName", "contactDesignation", "contactEmail", "contactPhone"];

beforeEach(() => {
  h.portal = { ...WAITING };
  h.person = { id: "p1", name: "Officer Aziz" };
  h.holder = null;
  h.updates = [];
  h.created = [];
  h.audits = [];
  h.locks = [];
  h.today = "2026-10-07";
});

describe("setting an online application aside", () => {
  const discard = (o: Record<string, string> = {}) => discardPortalApplication({ ok: false }, form({ portalApplicationId: "pa1", reason: "Not a real company: the certificate does not exist", recordedByPersonId: "p1", ...o }));

  it("sets it aside, erases what the applicant typed and keeps who, when and why", async () => {
    const r = await discard();
    expect(r).toEqual({ ok: true, href: "/suppliers?tab=portal" });
    const { data } = h.updates[0];
    expect(data).toMatchObject({ status: "DISCARDED", decidedByPersonId: "p1", discardReason: "Not a real company: the certificate does not exist" });
    expect(data.erasedAt).toEqual(new Date("2026-10-07T03:00:00.000Z"));
    for (const f of PERSONAL) expect(data[f], f).toBe("");
  });

  it("audits the outcome and the reason, and none of the applicant's details", async () => {
    await discard();
    const a = h.audits[0];
    expect(a).toMatchObject({ entity: "PortalApplication", action: "UPDATE", label: "DEMO/APP/0007/2026 · Online application", reason: "Not a real company: the certificate does not exist" });
    const text = JSON.stringify(a);
    expect(text).not.toMatch(/Sampel|202001000123|Aini|sampel\.example/);
  });

  it("locks the application's own row, not the organisation", async () => {
    await discard();
    expect(h.locks.join(" ")).toMatch(/FOR UPDATE/);
    expect(h.locks).not.toContain("organisation");
  });

  it("asks for a reason and a named officer, and changes nothing without them", async () => {
    expect((await discard({ reason: " " })).errors?.reason).toBeTruthy();
    h.person = null;
    expect((await discard()).errors?.recordedByPersonId).toBeTruthy();
    expect(h.updates).toEqual([]);
  });

  it("will not decide an application twice, or one that is not there", async () => {
    h.portal = { ...WAITING, status: "RECORDED" };
    expect((await discard()).message).toMatch(/not waiting any more/);
    h.portal = null;
    expect((await discard()).message).toMatch(/no longer exists/);
    expect(h.updates).toEqual([]);
  });
});

describe("recording the supplier from an online application", () => {
  const FIELDS = { registeredName: "Sampel Works Sdn Bhd", registrationNo: "202001000123", entityTypeCode: "sdn_bhd", countryCode: "my", registeredAddress: "1 Jalan Contoh", companyEmail: "office@sampel.example", contactName: "Aini", contactDesignation: "", contactEmail: "aini@sampel.example", contactPhone: "", recordedByPersonId: "p1" };
  const record = (o: Record<string, string> = {}) => recordApplication({ ok: false }, form({ ...FIELDS, portalApplicationId: "pa1", ...o }));

  it("takes the channel and the day from the online application, never from the form", async () => {
    await expect(record({ channel: "COUNTER", receivedOn: "2020-01-01", declarationSignedOn: "2026-10-01", epaymentFormReceivedOn: "2026-10-01" })).rejects.toThrow(/REDIRECT \/suppliers\/s1/);
    const app = h.created.find((c) => c.model === "supplierApplication")!.data;
    expect(app).toMatchObject({ channel: "PORTAL", recordedByPersonId: "p1", declarationSignedOn: null, epaymentFormReceivedOn: null });
    expect((app.receivedOn as Date).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("marks the online application recorded, links the supplier, and erases the applicant's own words", async () => {
    await expect(record()).rejects.toThrow(/REDIRECT/);
    const u = h.updates.find((x) => x.model === "portalApplication")!;
    expect(u.data).toMatchObject({ status: "RECORDED", acceptedSupplierId: "s1", decidedByPersonId: "p1" });
    for (const f of PERSONAL) expect(u.data[f], f).toBe("");
    const audit = h.audits.find((a) => a.entity === "PortalApplication")!;
    expect(JSON.stringify(audit)).not.toMatch(/Sampel|202001000123|Aini/);
    expect(audit.changes.find((c) => c.field === "supplier")?.after).toBe("DEMO/SUP/0009/2026");
  });

  it("lets the officer correct what the applicant typed: the supplier holds what was checked", async () => {
    await expect(record({ registeredName: "Sampel Works Bhd (corrected)" })).rejects.toThrow(/REDIRECT/);
    expect(h.created.find((c) => c.model === "supplier")!.data.registeredName).toBe("Sampel Works Bhd (corrected)");
  });

  it("refuses a number the register already holds, naming the holder to the officer, and records nothing", async () => {
    h.holder = { reference: "DEMO/SUP/0001/2026", registeredName: "Contoh Bina Sdn Bhd" };
    const r = await record();
    expect(r.ok).toBe(false);
    expect(h.created).toEqual([]);
    expect(h.updates).toEqual([]);
  });

  it("refuses an online application that was decided already, or is gone", async () => {
    h.portal = { ...WAITING, status: "DISCARDED" };
    expect((await record()).message).toMatch(/not waiting any more/);
    h.portal = null;
    expect((await record()).message).toMatch(/not waiting any more/);
    expect(h.created).toEqual([]);
  });

  it("still needs an officer named as the recorder", async () => {
    h.person = null;
    const r = await record();
    expect(r.ok).toBe(false);
    expect(h.created).toEqual([]);
  });
});
