import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The public application is staged: a PortalApplication row and nothing else. No supplier, no
 * contact, no supplier reference, no audit row, no organisation lock. The database is a recording
 * stand-in: these tests read what would be written.
 */

const h = vi.hoisted(() => ({
  created: [] as { model: string; data: Record<string, unknown> }[],
  transactions: 0,
  issued: [] as string[],
  numbering: "ok" as "ok" | "missing",
  today: "2026-10-06" as string | null,
  /// What the counts return: [in the last 24 hours, for this number].
  counts: [0, 0] as [number, number],
  countWheres: [] as Record<string, unknown>[],
  lists: { ENTITY_TYPE: ["sdn_bhd"], COUNTRY: ["my"] } as Record<string, string[]>,
  policy: { personalDataNoticeEn: "We use your details to review this application.", personalDataNoticeMs: "Kami menggunakan butiran anda untuk menyemak permohonan ini.", portalDailyLimit: 50, portalDailyLimitPerNumber: 3 } as Record<string, unknown> | null,
  /// Anything that touches the register or the audit trail is recorded here: the public path must leave it empty.
  touched: [] as string[],
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      h.transactions += 1;
      const trap = (name: string) => new Proxy({}, { get: (_t, op) => async () => { h.touched.push(`${name}.${String(op)}`); return null; } });
      return fn({
        portalApplication: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            h.created.push({ model: "portalApplication", data });
            return { id: "pa1", ...data };
          },
          count: async ({ where }: { where: Record<string, unknown> }) => {
            h.countWheres.push(where);
            return h.countWheres.length % 2 === 1 ? h.counts[0] : h.counts[1];
          },
        },
        supplier: trap("supplier"),
        supplierContact: trap("supplierContact"),
        supplierApplication: trap("supplierApplication"),
        auditEntry: trap("auditEntry"),
        $queryRaw: async () => {
          h.touched.push("$queryRaw");
          return [];
        },
      });
    },
  },
}));
// Phase 1c (ADR 0034 D10): the public form names its organisation through the deployment's one (`src/lib/portal/deployment.ts`), no longer
// through `supplierOrg()` reading ORGANISATION_CODE itself. The stand-in answers it as the stand-in organisation; nothing else here changes.
vi.mock("@/lib/portal/deployment", () => ({ deploymentOrganisation: async () => ({ id: "o1", code: "ORG", timeZone: "Asia/Kuala_Lumpur" }) }));
vi.mock("@/lib/suppliers/repo", () => ({
  supplierOrg: async () => ({ id: "o1", timeZone: "Asia/Kuala_Lumpur", today: h.today }),
  loadSupplierConfig: async () => ({ policy: h.policy, format: null, liveCodes: (kind: string) => h.lists[kind] ?? [] }),
}));
vi.mock("@/lib/numbering/issue", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/numbering/issue")>();
  return {
    ...real,
    issueReference: async (_tx: unknown, _org: string, key: string) => {
      if (h.numbering === "missing") throw new real.NumberingError("SERIES_MISSING", key);
      h.issued.push(key);
      return "DEMO/APP/0007/2026";
    },
  };
});
vi.mock("../../suppliers/shared", () => ({ stampNow: () => new Date("2026-10-06T03:00:00.000Z") }));

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
const row = () => h.created.find((c) => c.model === "portalApplication")?.data;

const PRISTINE = { notice: "We use your details to review this application." };
beforeEach(() => {
  h.created = [];
  h.transactions = 0;
  h.issued = [];
  h.numbering = "ok";
  h.today = "2026-10-06";
  h.counts = [0, 0];
  h.countWheres = [];
  h.lists = { ENTITY_TYPE: ["sdn_bhd"], COUNTRY: ["my"] };
  h.policy = { personalDataNoticeEn: PRISTINE.notice, personalDataNoticeMs: "Kami menggunakan butiran anda untuk menyemak permohonan ini.", portalDailyLimit: 50, portalDailyLimitPerNumber: 3 };
  h.touched = [];
});

describe("a public application, as written", () => {
  it("stages one application with its own reference, on the organisation's day, and touches nothing else", async () => {
    const r = await send();
    expect(r).toEqual({ ok: true, reference: "DEMO/APP/0007/2026" });
    expect(h.created.map((c) => c.model)).toEqual(["portalApplication"]);
    expect(h.issued).toEqual(["portal_application"]);
    const app = row()!;
    expect(app).toMatchObject({ reference: "DEMO/APP/0007/2026", registeredName: "Sampel Works Sdn Bhd", registrationNoKey: "202001000123", contactName: "Aini", contactEmail: "aini@sampel.example" });
    expect(app.receivedOn).toEqual(new Date("2026-10-06T00:00:00.000Z"));
    expect(app.receivedAt).toEqual(new Date("2026-10-06T03:00:00.000Z"));
    // No supplier, no contact, no supplier reference, no audit row and no lock on anything.
    expect(h.touched).toEqual([]);
  });

  it("ignores a status, a recorder, a received day and a paper day posted by hand", async () => {
    await send({ status: "ACCEPTED", channel: "COUNTER", recordedByPersonId: "p1", receivedOn: "2020-01-01", declarationSignedOn: "2026-10-01", acceptedSupplierId: "s1" });
    const app = row()!;
    expect(app).not.toHaveProperty("status");
    expect(app).not.toHaveProperty("decidedByPersonId");
    expect(app).not.toHaveProperty("acceptedSupplierId");
    expect((app.receivedOn as Date).toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });

  it("takes no bank field and no file", async () => {
    await send({ bankAccount: "1234", bankName: "X" });
    expect(JSON.stringify(row())).not.toMatch(/1234|bank/i);
  });
});

describe("what a stranger can and cannot do", () => {
  it("drops a filled bait field without creating anything, and says only that it was received", async () => {
    const r = await send({ faxNumber: "http://spam.example" });
    expect(r).toEqual({ ok: true, reference: null });
    expect(h.transactions).toBe(0);
    expect(h.created).toEqual([]);
  });

  it("gives a number already on the register the same reply as any other: the register is never asked", async () => {
    // The register's table is a trap: any read of it is recorded, and there must be none.
    const r = await send({ registrationNo: "SUPPLIER-ALREADY-REGISTERED" });
    expect(r).toEqual({ ok: true, reference: "DEMO/APP/0007/2026" });
    expect(h.touched).toEqual([]);
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
});

describe("the form is closed until it is set up", () => {
  const closedBy: [string, () => void][] = [
    ["no time zone", () => { h.today = null; }],
    ["no countries", () => { h.lists.COUNTRY = []; }],
    ["no company types", () => { h.lists.ENTITY_TYPE = []; }],
    ["no numbering series", () => { h.numbering = "missing"; }],
    ["no English notice", () => { h.policy = { ...h.policy, personalDataNoticeEn: null }; }],
    ["a blank Malay notice", () => { h.policy = { ...h.policy, personalDataNoticeMs: "  " }; }],
    ["no daily limit", () => { h.policy = { ...h.policy, portalDailyLimit: null }; }],
    ["no limit per number", () => { h.policy = { ...h.policy, portalDailyLimitPerNumber: null }; }],
    ["no policy at all", () => { h.policy = null; }],
  ];
  it.each(closedBy)("with %s it takes nothing and says so without naming a setting", async (_name, set) => {
    set();
    const r = await send();
    expect(r.ok).toBe(false);
    expect(r.message).toBe("Online applications are not open yet, so nothing was sent.");
    expect(h.created).toEqual([]);
  });
});

describe("the limits", () => {
  it("counts the last 24 hours and the number's, and takes the application while under both", async () => {
    h.counts = [49, 2];
    expect((await send()).ok).toBe(true);
    const [all, number] = h.countWheres;
    expect(all).toMatchObject({ organisationId: "o1" });
    expect((all.receivedAt as { gte: Date }).gte).toEqual(new Date("2026-10-05T03:00:00.000Z"));
    expect(number).toMatchObject({ registrationNoKey: "202001000123" });
  });

  it("turns away at the daily limit, and at the limit for one number, with the same words, and writes nothing", async () => {
    h.counts = [50, 0];
    const day = await send();
    h.created = [];
    h.counts = [1, 3];
    const num = await send();
    expect(day).toEqual({ ok: false, message: expect.stringMatching(/receiving a lot of applications/) });
    expect(num).toEqual(day);
    expect(h.created).toEqual([]);
  });
});
