import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An officer's two acts on an online application: set it aside, or record the supplier from it. Setting it aside
 * erases what the applicant typed; recording the supplier does NOT (Phase 4a, CPD's registration, ruling of 2026-10-07: "acceptance must stop erasing the
 * applicant's words"). Neither puts the applicant's details in the audit trail of the application. Recording may also open the contact's portal account
 * and issue its activation code, which is returned once and written nowhere. The database is a recording stand-in.
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
  /// Phase 4a: what the officer holds, the organisation's settings, and what the portal account's tables hold.
  validityMinutes: 60 as number | null,
  loginTaken: false,
  revalidated: [] as string[],
  accounts: [] as Row[],
  codes: [] as Row[],
  signInEvents: [] as Row[],
  attributed: [] as { entity: string; entityId: string; slot: string; subjectPersonId: string | null; mode: string }[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    h.revalidated.push(path);
  },
}));
// Phase 1b: every action asks who is signed in first; these tests are not about sign-in, so a signed-in officer stands in for the session.
vi.mock("@/app/_auth/actor", async () => (await import("@/lib/test-support/staff")).actorModule());
// Phase 2b: every act is attributed to the signed-in person (`beginAct`). The real reading of the form stands, with the organisation's switch, the password and the write faked.
vi.mock("@/app/_auth/act", async () => {
  const act = (await import("@/lib/test-support/staff")).actModule();
  h.attributed = act.written;
  return act.module;
});
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
        securityPolicy: { findUnique: async () => (h.validityMinutes == null ? { resetCodeValidityMinutes: null } : { resetCodeValidityMinutes: h.validityMinutes }) },
        supplierAccount: {
          findUnique: async () => (h.loginTaken ? { id: "other" } : null),
          create: async ({ data }: { data: Row }) => {
            h.accounts.push(data);
            return { id: "acc1" };
          },
        },
        oneTimeCode: {
          create: async ({ data }: { data: Row }) => {
            h.codes.push(data);
            return { id: "code1" };
          },
        },
        signInEvent: {
          create: async ({ data }: { data: Row }) => {
            h.signInEvents.push(data);
            return { id: "ev1" };
          },
        },
        portalApplication: {
          // Set aside now reads the application's routes too (ADR 0041: refused while one waits); a step-one application has none.
          findFirst: async () => (h.portal ? { routes: [], ...h.portal } : h.portal),
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
          findFirst: async () => ({ id: "c1", name: "Aini", retiredOn: null, account: null }),
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
  loadSupplierConfig: async () => ({
    format: null,
    policy: null,
    liveCodes: (kind: string) => ({ ENTITY_TYPE: ["sdn_bhd"], COUNTRY: ["my"], STATE: ["sbh"], BUMIPUTERA_STATUS: ["declared_yes"] })[kind] ?? [],
    listName: (kind: string, code: string) => (kind === "STATE" ? "Sabah" : code),
  }),
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
  // A refusal thrown from inside the transaction carries the words the act answers with (Phase 4a: a portal account refused rolls the supplier back).
  Refusal: class extends Error {
    constructor(readonly state: { ok: boolean }) {
      super("Refused");
    }
  },
  stampNow: () => new Date("2026-10-07T03:00:00.000Z"),
}));

vi.mock("@/app/_auth/cookies", () => ({ currentRequestFacts: async () => ({ sourceAddress: null, userAgent: "" }) }));
vi.mock("@/lib/auth/supplier-administration", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/supplier-administration")>()), unusableSupplierPasswordHash: async () => "$scrypt$stand-in" }));

import { STAFF_FIXTURE } from "@/lib/test-support/staff";

import { discardPortalApplication, recordApplication } from "./actions";

/// The officer holds the permission to manage supplier accounts (a role the organisation has chosen to grant it to).
const grant = () => (STAFF_FIXTURE.permissions as Set<string>).add("supplierAccounts.manage");

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
const PERSONAL = ["registeredName", "registrationNo", "registrationNoKey", "entityTypeCode", "countryCode", "registeredAddress", "addressLine1", "addressLine2", "city", "postcode", "stateCode", "bumiputeraClaimCode", "companyEmail", "contactName", "contactDesignation", "contactEmail", "contactPhone"];

beforeEach(() => {
  h.portal = { ...WAITING };
  h.person = { id: "p1", name: "Officer Aziz" };
  h.holder = null;
  h.updates = [];
  h.created = [];
  h.audits = [];
  h.locks = [];
  h.today = "2026-10-07";
  (STAFF_FIXTURE.permissions as Set<string>).clear();
  h.validityMinutes = 60;
  h.loginTaken = false;
  h.revalidated = [];
  h.accounts = [];
  h.codes = [];
  h.signInEvents = [];
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
    // The day incorporated is the applicant's word too (Phase 4a), and goes with the rest.
    expect(data.incorporatedOn).toBeNull();
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
  const FIELDS = {
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
    recordedByPersonId: "p1",
  };
  const record = (o: Record<string, string> = {}) => recordApplication({ ok: false }, form({ ...FIELDS, portalApplicationId: "pa1", ...o }));

  // CHANGED in Phase 4b, for a ruled decision (the CPD registration spec, B2.3: "From 4b on, no SupplierApplication is created at acceptance for PORTAL. It is created at Submit"). This test
  // asserted that accepting an online application recorded a PORTAL application with the officer as its recorder, the online application's day, and nothing taken from the form. Accepting
  // now records the supplier, its contact and the decision on the online application, and NO application: the supplier sends its own when it has completed its registration, so an
  // incomplete applicant is out of the office's queue and out of reach of a paper approval. Nothing the form says about a channel or a day is written anywhere.
  it("records no application when it accepts an online application, and takes nothing about the channel or the day from the form", async () => {
    await expect(record({ channel: "COUNTER", receivedOn: "2020-01-01", declarationSignedOn: "2026-10-01", epaymentFormReceivedOn: "2026-10-01" })).rejects.toThrow(/REDIRECT \/suppliers\/s1/);
    expect(h.created.find((c) => c.model === "supplierApplication")).toBeUndefined();
    expect(h.created.find((c) => c.model === "supplier")).toBeDefined();
    expect(h.created.find((c) => c.model === "supplierContact")).toBeDefined();
    expect(JSON.stringify(h.created)).not.toContain("2020-01-01");
    expect(JSON.stringify(h.audits.filter((a) => a.entity === "SupplierApplication"))).toBe("[]");
  });

  // CHANGED in Phase 4a (log: "Acceptance no longer erases the applicant's words"). This test asserted that recording the supplier ERASED every word the applicant typed; the
  // product owner ruled the opposite (CPD registration, ruling 6) so that the officer's page can show the applicant's words beside the register entry and list the differences.
  // It now asserts what the ruling asks: the application is marked recorded and linked, NO word of the applicant's is blanked, `erasedAt` stays null, and the audit row still
  // carries none of the applicant's details. Setting aside still erases (the tests above are unchanged).
  it("marks the online application recorded, links the supplier, and KEEPS the applicant's own words", async () => {
    await expect(record()).rejects.toThrow(/REDIRECT/);
    const u = h.updates.find((x) => x.model === "portalApplication")!;
    expect(u.data).toMatchObject({ status: "RECORDED", acceptedSupplierId: "s1", decidedByPersonId: "p1" });
    for (const f of PERSONAL) expect(u.data, f).not.toHaveProperty(f);
    expect(u.data).not.toHaveProperty("erasedAt");
    expect(u.data).not.toHaveProperty("incorporatedOn");
    const audit = h.audits.find((a) => a.entity === "PortalApplication")!;
    expect(JSON.stringify(audit)).not.toMatch(/Sampel|202001000123|Aini/);
    expect(audit.changes.find((c) => c.field === "supplier")?.after).toBe("DEMO/SUP/0009/2026");
    expect(audit.changes.map((c) => c.field)).not.toContain("personalDetails");
  });

  it("records the supplier with step one's parts, the address composed from them, and the declared claim and the day incorporated", async () => {
    await expect(record({ bumiputeraClaimCode: "declared_yes", addressLine2: "Taman Contoh" })).rejects.toThrow(/REDIRECT/);
    const s = h.created.find((c) => c.model === "supplier")!.data;
    expect(s).toMatchObject({ addressLine1: "1 Jalan Contoh", addressLine2: "Taman Contoh", city: "Kota Kinabalu", postcode: "88000", stateCode: "sbh", bumiputeraClaimCode: "declared_yes", registeredAddress: "1 Jalan Contoh\nTaman Contoh\n88000 Kota Kinabalu\nSabah" });
    expect(s.incorporatedOn).toEqual(new Date("2015-03-02T00:00:00.000Z"));
    const audit = h.audits.find((a) => a.entity === "Supplier")!;
    expect(audit.changes.find((c) => c.field === "state")?.after).toBe("Sabah");
    expect(audit.changes.find((c) => c.field === "dateIncorporated")?.after).toBe("2015-03-02");
  });

  it("refuses a missing or future date incorporated, a state not on the list and a claim not on the list, naming the field, and records nothing", async () => {
    for (const [field, value] of [["incorporatedOn", ""], ["incorporatedOn", "2026-10-08"], ["stateCode", "elsewhere"], ["stateCode", ""], ["bumiputeraClaimCode", "made_up"], ["addressLine1", ""], ["city", ""], ["postcode", ""]] as const) {
      const r = await record({ [field]: value });
      expect(r.ok, `${field}=${value}`).toBe(false);
      expect(r.errors, `${field}=${value}`).toHaveProperty(field);
    }
    expect(h.created).toEqual([]);
    expect(h.updates).toEqual([]);
  });

  // CHANGED in Phase 4b with the test above: the act fills ONE slot now, the online application's decider (there is no application whose recorder to attribute).
  it("attributes the acceptance to the signed-in officer as the online application's decider, and writes no application's recorder", async () => {
    h.attributed.length = 0;
    await expect(record()).rejects.toThrow(/REDIRECT/);
    expect(h.attributed.map((a) => `${a.entity}.${a.slot}`)).toEqual(["PortalApplication.decidedBy"]);
    expect(h.attributed.every((a) => a.subjectPersonId === "person_test" && a.mode === "SIGNED")).toBe(true);
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

describe("opening the contact's portal account when the supplier is recorded (Phase 4a)", () => {
  const FIELDS = {
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
    recordedByPersonId: "p1",
  };
  const ASK = { openAccount: "on", accountLoginName: "aini.sampel", identityCheck: "Seen at the counter with her identity card" };
  const record = (o: Record<string, string> = {}) => recordApplication({ ok: false }, form({ ...FIELDS, portalApplicationId: "pa1", ...o }));

  it("records the supplier and issues the activation code in one transaction, and returns the code once", async () => {
    grant();
    const r = await record(ASK);
    expect(r.ok).toBe(true);
    expect(r.issued).toMatchObject({ code: expect.stringMatching(/^[0-9A-Z]{4}(-[0-9A-Z]{2,4}){5,6}$/), supplierHref: "/suppliers/s1?tab=documents" });
    expect(h.accounts).toEqual([expect.objectContaining({ contactId: "c1", supplierId: "s1", loginName: "aini.sampel", loginKey: "aini.sampel", status: "PENDING_ACTIVATION", passwordHash: "$scrypt$stand-in" })]);
    expect(h.codes).toEqual([expect.objectContaining({ store: "SUPPLIER", purpose: "ACTIVATION", issuedByPersonId: "person_test", identityCheck: "Seen at the counter with her identity card" })]);
    expect(h.signInEvents.map((e) => e.kind)).toEqual(["ACCOUNT_CREATED", "CODE_ISSUED"]);
    expect(h.signInEvents.every((e) => e.store === "SUPPLIER" && e.supplierAccountId === "acc1")).toBe(true);
  });

  it("does not make Next render the form again while the code is on screen: a recorded online application would swap the form (and the code) for \"not waiting any more\" (found in the rehearsal)", async () => {
    grant();
    const r = await record(ASK);
    expect(r.ok).toBe(true);
    expect(r.issued).toBeTruthy();
    expect(h.revalidated).toEqual([]);
  });

  it("revalidates the register's list when it goes straight on to the supplier", async () => {
    grant();
    await expect(record()).rejects.toThrow(/REDIRECT/);
    expect(h.revalidated).toContain("/suppliers");
  });

  it("writes the code nowhere: the database holds its hash, and the trail the fact that one was issued and how identity was checked", async () => {
    grant();
    const r = await record(ASK);
    const plain = r.issued!.code.replace(/-/g, "");
    const everything = JSON.stringify({ accounts: h.accounts, codes: h.codes, audits: h.audits, events: h.signInEvents });
    expect(everything).not.toContain(plain);
    expect(everything).not.toContain(r.issued!.code);
    expect(h.codes[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
    const issuedRow = h.audits.find((a) => a.entity === "SupplierAccount" && a.changes.some((c) => c.field === "oneTimeCode"))!;
    expect(issuedRow.changes.find((c) => c.field === "identityChecked")?.after).toBe("Seen at the counter with her identity card");
  });

  it("is refused to an officer who does not hold the permission, saves nothing, and says why", async () => {
    const r = await record(ASK);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/permission to manage supplier accounts/);
    expect(h.created).toEqual([]);
    expect(h.accounts).toEqual([]);
  });

  it("records the supplier with no account when none is asked for, whatever the officer holds, and issues no code", async () => {
    grant();
    await expect(record()).rejects.toThrow(/REDIRECT \/suppliers\/s1/);
    expect(h.accounts).toEqual([]);
    expect(h.codes).toEqual([]);
  });

  it("is refused while the code's validity is not set, naming the setting, and saves nothing", async () => {
    grant();
    h.validityMinutes = null;
    const r = await record(ASK);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("How long a one-time code stays valid");
    expect(h.created).toEqual([]);
  });

  it("needs the identity check and a good, free sign-in name, and saves nothing without them", async () => {
    grant();
    const noCheck = await record({ ...ASK, identityCheck: " " });
    expect(noCheck.ok).toBe(false);
    expect(noCheck.errors).toHaveProperty("identityCheck");
    const bad = await record({ ...ASK, accountLoginName: "a b" });
    expect(bad.errors).toHaveProperty("accountLoginName");
    h.loginTaken = true;
    const taken = await record(ASK);
    expect(taken.errors?.accountLoginName).toMatch(/already used/);
    expect(h.accounts).toEqual([]);
    expect(h.codes).toEqual([]);
  });
});
