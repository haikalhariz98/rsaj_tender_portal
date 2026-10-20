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
  lists: { ENTITY_TYPE: ["sdn_bhd"], COUNTRY: ["my"], STATE: ["sbh"], BUMIPUTERA_STATUS: ["declared_yes"] } as Record<string, string[]>,
  /// The dial code a country carries (Phase 4a). Null: none set.
  callingCodes: { my: "+60" } as Record<string, string | null>,
  policy: { personalDataNoticeEn: "We use your details to review this application.", personalDataNoticeMs: "Kami menggunakan butiran anda untuk menyemak permohonan ini.", portalDailyLimit: 50, portalDailyLimitPerNumber: 3, contactNeedsEmailAndPhone: null } as Record<string, unknown> | null,
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
  loadSupplierConfig: async () => ({
    policy: h.policy,
    format: null,
    liveCodes: (kind: string) => h.lists[kind] ?? [],
    listName: (kind: string, code: string) => (kind === "STATE" && code === "sbh" ? "Sabah" : null),
    callingCodeOf: (country: string | null) => (country ? (h.callingCodes[country] ?? null) : null),
  }),
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

import { FORM_SECRET_MIN_LENGTH, FORM_TOKEN_FIELD, signFormToken } from "@/lib/auth/form-token";
import { HONEYPOT_FIELD } from "@/lib/portal/apply";

import { receiveApplication } from "./receive";

/// The deployment's form key, as the environment would hold it. Every form here carries a token signed with it unless a test says otherwise.
const KEY = "t".repeat(FORM_SECRET_MIN_LENGTH);
const FORM = {
  registeredName: "Sampel Works Sdn Bhd",
  registrationNo: "202001000123",
  entityTypeCode: "sdn_bhd",
  countryCode: "my",
  addressLine1: "1 Jalan Contoh",
  addressLine2: "",
  city: "Kota Kinabalu",
  postcode: "88000",
  stateCode: "sbh",
  bumiputeraClaimCode: "",
  incorporatedOn: "2015-03-02",
  companyEmail: "office@sampel.example",
  contactName: "Aini",
  contactDesignation: "",
  contactEmail: "aini@sampel.example",
  contactPhone: "",
};
const form = (o: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...FORM, [FORM_TOKEN_FIELD]: signFormToken(KEY, "register", new Date()), ...o })) f.set(k, v);
  return f;
};
const send = (o?: Record<string, string>) => receiveApplication(form(o));
const row = () => h.created.find((c) => c.model === "portalApplication")?.data;

const PRISTINE = { notice: "We use your details to review this application." };
beforeEach(() => {
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  h.created = [];
  h.transactions = 0;
  h.issued = [];
  h.numbering = "ok";
  h.today = "2026-10-06";
  h.counts = [0, 0];
  h.countWheres = [];
  h.lists = { ENTITY_TYPE: ["sdn_bhd"], COUNTRY: ["my"], STATE: ["sbh"], BUMIPUTERA_STATUS: ["declared_yes"] };
  h.callingCodes = { my: "+60" };
  h.policy = { personalDataNoticeEn: PRISTINE.notice, personalDataNoticeMs: "Kami menggunakan butiran anda untuk menyemak permohonan ini.", portalDailyLimit: 50, portalDailyLimitPerNumber: 3, contactNeedsEmailAndPhone: null };
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
    // Phase 4a: the address in parts, the single text composed from them (the state by its name), the claim blank and the day incorporated stored as a day.
    expect(app).toMatchObject({ addressLine1: "1 Jalan Contoh", addressLine2: "", city: "Kota Kinabalu", postcode: "88000", stateCode: "sbh", bumiputeraClaimCode: "", registeredAddress: "1 Jalan Contoh\n88000 Kota Kinabalu\nSabah" });
    expect(app.incorporatedOn).toEqual(new Date("2015-03-02T00:00:00.000Z"));
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

  it("joins the country's dial code to the mobile number, once, and keeps an international number as typed", async () => {
    await send({ contactPhone: "12-345 6789" });
    expect(row()!.contactPhone).toBe("+60 12-345 6789");
    h.created = [];
    await send({ contactPhone: "+65 8123 4567" });
    expect(row()!.contactPhone).toBe("+65 8123 4567");
    h.created = [];
    h.callingCodes = { my: null };
    await send({ contactPhone: "12-345 6789" });
    expect(row()!.contactPhone).toBe("12-345 6789");
  });

  it("stores a declared Bumiputera claim from the list, and refuses one that is not on it", async () => {
    await send({ bumiputeraClaimCode: "declared_yes" });
    expect(row()!.bumiputeraClaimCode).toBe("declared_yes");
    h.created = [];
    const r = await send({ bumiputeraClaimCode: "made_up" });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveProperty("bumiputeraClaimCode");
    expect(h.created).toEqual([]);
  });

  it("requires the date incorporated, a real day and not after the day it is sent", async () => {
    for (const bad of ["", "2026-10-07", "2026-02-31", "yesterday"]) {
      h.created = [];
      const r = await send({ incorporatedOn: bad });
      expect(r.ok, bad).toBe(false);
      expect(r.errors, bad).toHaveProperty("incorporatedOn");
      expect(h.created).toEqual([]);
    }
  });

  it("is closed while the list of states is empty, and the reply names nothing", async () => {
    h.lists = { ...h.lists, STATE: [] };
    const r = await send();
    expect(r).toEqual({ ok: false, message: "Online applications are not open yet, so nothing was sent." });
    expect(h.created).toEqual([]);
  });

  it("takes no bank field and no file", async () => {
    await send({ bankAccount: "1234", bankName: "X" });
    expect(JSON.stringify(row())).not.toMatch(/1234|bank/i);
  });
});

describe("what a stranger can and cannot do", () => {
  it("drops a filled bait field without creating anything, and says only that it was received", async () => {
    const r = await send({ [HONEYPOT_FIELD]: "http://spam.example" });
    expect(r).toEqual({ ok: true, reference: null });
    expect(h.transactions).toBe(0);
    expect(h.created).toEqual([]);
  });

  it("a field named faxNumber is no longer the bait: it is ignored like any other the form does not take (Phase 4a renamed the bait)", async () => {
    const r = await send({ faxNumber: "03-1234567" });
    expect(r).toEqual({ ok: true, reference: "DEMO/APP/0007/2026" });
    expect(JSON.stringify(row())).not.toContain("03-1234567");
  });

  it("is closed, saying nothing of why, while the deployment's form key is not set", async () => {
    vi.stubEnv("PORTAL_FORM_SECRET", "");
    const r = await send();
    expect(r).toEqual({ ok: false, message: "Online applications are not open yet, so nothing was sent." });
    expect(h.created).toEqual([]);
  });

  it("refuses a form with no token, a forged one, one for another form and an old one, and writes nothing", async () => {
    const noToken = form();
    noToken.delete(FORM_TOKEN_FIELD);
    const other = form({ [FORM_TOKEN_FIELD]: signFormToken(KEY, "sign-in", new Date()) });
    const forged = form({ [FORM_TOKEN_FIELD]: signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), "register", new Date()) });
    const old = form({ [FORM_TOKEN_FIELD]: signFormToken(KEY, "register", new Date(Date.now() - 25 * 60 * 60 * 1000)) });
    for (const f of [noToken, other, forged, old]) {
      const r = await receiveApplication(f);
      expect(r).toEqual({ ok: false, message: "This form is out of date. Nothing was sent. Reload and send again." }); // 0005, founder 2026-10-19: shortened
    }
    expect(h.created).toEqual([]);
    expect(h.transactions).toBe(0);
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

// Founder, 2026-10-20: the gate opens on the English notice alone. It was "a blank Malay notice" closing the form; a Malay notice is no longer asked for.
describe("the notice gate is English only", () => {
  it("takes an application with the Malay notice blank or missing", async () => {
    h.policy = { ...h.policy, personalDataNoticeMs: "  " };
    expect((await send()).ok).toBe(true);
    h.policy = { ...h.policy, personalDataNoticeMs: null };
    expect((await send()).ok).toBe(true);
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
    expect(day).toEqual({ ok: false, message: expect.stringMatching(/Too many applications/) }); // 0005, founder 2026-10-19: shortened
    expect(num).toEqual(day);
    expect(h.created).toEqual([]);
  });
});
