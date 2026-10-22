import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/documents/store";
import { postgresBlobStore } from "@/lib/documents/store/postgres";
import { todayIn } from "@/lib/dates";
import type { RegisterSettings } from "@/lib/portal/apply-repo";
import { frozenWording, personalDataNoticeOf } from "@/lib/portal/registration/declaration-text";
import { creditor } from "@/lib/portal/registration/fixture";
import { mobileWithDialCode } from "@/lib/suppliers/step-one";
import { randomId } from "@/lib/test-db/auth-fixtures";

import type { PublicApplicationBody } from "./contract";
import { body as fixtureBody, step1 } from "./fixture";
import { receivePublicApplication, type HeldFile, type ReceiveInput } from "./receive-store";
import { findSpent, tokenSha256 } from "./token-store";

/**
 * A stranger's whole registration against a real database (ADR 0041 D1 to D4 and D8, plan 8.3): everything written in one transaction, a refusal after the files were read leaving
 * nothing at all (not a row, not a byte), and one application per token however often or however concurrently it is sent. The triggers and CHECKs on the held rows are
 * `held-rows.db.test.ts`'s (plan 8.3.4). This file has an organisation of its own, so the shared test organisation's settings are never touched.
 */

const ORG_CODE = "REG_RECEIVE_TEST";
const NOTICE_EN = "{organisation} keeps these details to check the application.";
const TZ = "Asia/Kuala_Lumpur";

let org: { id: string; name: string };
let today: string;
let classCert: string;
let classStatement: string;
let typeReg: string;
let typeWorks: string;
let gradeId: string;
let categoryId: string;
const texts: Record<"GIRO_AUTHORISATION" | "FALSE_DECLARATION" | "TERMS_AND_CONDITIONS", { id: string; sha: string }> = {} as never;
let noticeSha: string;

beforeAll(async () => {
  const o = await db.organisation.upsert({ where: { code: ORG_CODE }, update: {}, create: { code: ORG_CODE, name: "Receive Test Authority", timeZone: TZ } });
  org = { id: o.id, name: o.name };
  today = todayIn(new Date(), TZ)!;
  const organisationId = org.id;
  const cls = (code: string, classification: "SULIT" | "INTERNAL") => db.documentClass.upsert({ where: { organisationId_code: { organisationId, code } }, update: { classification }, create: { organisationId, code, nameEn: `Class ${code}`, classification } });
  classCert = (await cls("rcv_cert", "INTERNAL")).id;
  classStatement = (await cls("rcv_statement", "SULIT")).id;
  const policy = { personalDataNoticeEn: NOTICE_EN, verificationNoticeEn: "An officer checks each document.", uploadMaxFilesPerApplication: 6, uploadMaxBytesPerApplication: 1_000_000n, supplierUploadClassId: classCert, supplierBankStatementClassId: classStatement, onlineDeclarationReplacesPaper: true, portalDailyLimit: 1000, portalDailyLimitPerNumber: 2 };
  await db.supplierPolicy.upsert({ where: { organisationId }, update: policy, create: { organisationId, ...policy } });
  const series = await db.numberingSeries.findFirst({ where: { organisationId, key: "portal_application" } });
  if (!series) await db.numberingSeries.create({ data: { organisationId, key: "portal_application", nameEn: "Online applications", pattern: "RCV/{SERIAL}", padding: 4, resetOn: "NEVER" } });
  const board = await db.registrationBody.upsert({ where: { organisationId_code: { organisationId, code: "rcv_board" } }, update: {}, create: { organisationId, code: "rcv_board", labelEn: "the Works board", provenance: "ASSUMED" } });
  const type = (code: string, nameEn: string, extra: Record<string, unknown> = {}) =>
    db.supplierDocumentType.upsert({ where: { organisationId_code: { organisationId, code } }, update: extra, create: { organisationId, code, nameEn, provenance: "ASSUMED", expires: true, mandatoryAtRegistration: true, notApplicableAllowed: false, ...extra } });
  typeReg = (await type("rcv_reg", "Companies registry certificate")).id;
  typeWorks = (await type("rcv_works", "Works board certificate", { bodyId: board.id, valueKinds: ["GRADE", "CATEGORY"] })).id;
  const value = (code: string, kind: "GRADE" | "CATEGORY", nameEn: string) => db.registrationValue.upsert({ where: { bodyId_kind_code: { bodyId: board.id, kind, code } }, update: {}, create: { organisationId, bodyId: board.id, kind, code, nameEn, provenance: "ASSUMED" } });
  gradeId = (await value("G1", "GRADE", "Grade one")).id;
  categoryId = (await value("B", "CATEGORY", "Buildings")).id;
  const list = (code: string, kind: "BANK" | "ACCOUNT_TYPE", nameEn: string) => db.supplierListValue.upsert({ where: { organisationId_list_code: { organisationId, list: kind, code } }, update: { retiredOn: null }, create: { organisationId, list: kind, code, nameEn, provenance: "ASSUMED" } });
  await list("bank-a", "BANK", "Demonstration Bank");
  await list("current", "ACCOUNT_TYPE", "Current account");
  const text = async (kind: keyof typeof texts, bodyEn: string) => {
    const t = (await db.declarationText.findFirst({ where: { organisationId, kind, retiredOn: null }, orderBy: { version: "desc" } })) ??
      (await db.declarationText.create({ data: { organisationId, kind, version: 1 + (await db.declarationText.count({ where: { organisationId, kind } })), bodyEn, provenance: "ASSUMED", issuedOn: new Date("2026-01-01T00:00:00Z") } }));
    texts[kind] = { id: t.id, sha: frozenWording({ bodyEn: t.bodyEn, bodyMs: null }, org.name).sha256 };
  };
  await text("GIRO_AUTHORISATION", "We authorise {organisation} to pay.");
  await text("FALSE_DECLARATION", "What we tell {organisation} is true.");
  await text("TERMS_AND_CONDITIONS", "These are the terms of registration with {organisation}.");
  noticeSha = personalDataNoticeOf(NOTICE_EN, org.name)!.sha256;
});

/// The register as the route read it, open.
const register = (): RegisterSettings =>
  ({
    org: { id: org.id, code: ORG_CODE, timeZone: TZ, today, name: org.name },
    settings: null as never,
    step1: step1({ today }),
    stateName: () => "Demo State",
    callingCode: () => "+60",
    context: null as never,
    upload: {
      store: { allowedTypes: ["application/pdf"], capBytes: 100_000n },
      document: { classId: classCert, maxFiles: 6, maxBytes: 1_000_000n },
      statement: { classId: classStatement, classIsSulit: true, maxFiles: 6, maxBytes: 1_000_000n },
    },
    ceiling: 2_000_000n,
    limits: { daily: 1000, perNumber: 2 },
    addressLimit: { attempts: 1000, minutes: 60 },
    readiness: null as never,
    missing: [],
  }) as RegisterSettings;

/// A whole application for a registration number of its own, naming this organisation's wording as the page showed it.
function application(registrationNo = `RCV-${randomId()}`): PublicApplicationBody {
  const b = fixtureBody();
  return {
    ...b,
    company: { ...b.company, registrationNo },
    documents: [
      { ...b.documents[0]!, typeId: typeReg, valueIds: [] },
      { ...b.documents[1]!, typeId: typeWorks, valueIds: [gradeId, categoryId] },
    ],
    creditor: creditor({ beneficiaryIdentityNo: registrationNo }),
    agreements: (["GIRO_AUTHORISATION", "FALSE_DECLARATION", "TERMS_AND_CONDITIONS"] as const).map((kind) => ({ kind, textVersionId: texts[kind].id, textSha256: texts[kind].sha, confirmed: true })),
    noticeSha256: noticeSha,
  };
}

const held = (label: string): HeldFile => {
  const bytes = new TextEncoder().encode(`%PDF-1.4 ${label} ${randomBytes(12).toString("hex")}`);
  return { bytes, sha256: sha256Hex(bytes), mediaType: "application/pdf", originalFilename: `${label}.pdf` };
};

function input(o: Partial<ReceiveInput> = {}): ReceiveInput {
  const token = `${Date.now()}.${randomBytes(16).toString("base64url")}.${randomBytes(32).toString("base64url")}`;
  return {
    register: register(),
    token: { sha256: tokenSha256(token), issuedAt: new Date(Date.now() - 60_000) },
    body: application(),
    files: new Map([["new:reg", [held("registry")]], ["new:works", [held("works-a"), held("works-b")]]]),
    statement: [held("statement")],
    store: postgresBlobStore,
    sourceAddress: "203.0.113.7",
    now: new Date(),
    ...o,
  };
}

/// Every table a submission writes, counted for this organisation: a refusal must leave each exactly as it was.
async function counts() {
  const where = { organisationId: org.id };
  const [blobs] = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "BlobContent" WHERE "organisationId" = ${org.id}`;
  return {
    applications: await db.portalApplication.count({ where }),
    documents: await db.portalApplicationDocument.count({ where }),
    values: await db.portalApplicationValue.count({ where }),
    creditors: await db.portalApplicationCreditor.count({ where }),
    tokens: await db.portalFormToken.count({ where }),
    agreements: await db.registrationDeclaration.count({ where }),
    storedDocuments: await db.document.count({ where }),
    versions: await db.documentVersion.count({ where }),
    attachments: await db.documentAttachment.count({ where }),
    audit: await db.auditEntry.count({ where }),
    blobs: Number(blobs!.n),
  };
}

describe("a whole application, received (plan 8.3.1)", () => {
  it("writes everything in one transaction: the application, the held certificates and codes, the files recorded by the application, the SULIT bank details, three agreements, the spent token and one audit row with no personal data", async () => {
    const i = input();
    const before = await counts();
    const out = await receivePublicApplication(i);
    expect(out).toMatchObject({ ok: true, reference: expect.stringMatching(/^RCV\/\d{4}$/) });
    if (!out.ok) return;
    const after = await counts();
    expect({ ...after, blobs: undefined, audit: undefined }).toEqual({ ...before, blobs: undefined, audit: undefined, applications: before.applications + 1, documents: before.documents + 2, values: before.values + 2, creditors: before.creditors + 1, tokens: before.tokens + 1, agreements: before.agreements + 3, storedDocuments: before.storedDocuments + 4, versions: before.versions + 4, attachments: before.attachments + 4 });
    expect(after.blobs).toBe(before.blobs + 4);

    const app = await db.portalApplication.findFirstOrThrow({ where: { organisationId: org.id, reference: out.reference }, include: { documents: { include: { values: true, attachments: { include: { version: true } } }, orderBy: { clientKey: "asc" } }, creditor: { include: { attachments: { include: { version: { include: { document: true } } } } } }, declarations: true, formToken: true } });
    expect(app.form).toBe("WHOLE");
    expect(app.status).toBe("RECEIVED");
    expect(app.registrationNo).toBe(i.body.company.registrationNo);
    // Step 1 as the step-one form stored it: the mobile number joined to its country's dial code, the address composed with the state's name.
    expect(app.contactPhone).toBe(mobileWithDialCode(i.body.company.contact.phone, "+60"));
    expect(app.registeredAddress).toContain("Demo State");
    // No supplier: the register is never asked, and nothing holds the number's place (REG-1).
    expect(app.acceptedSupplierId).toBeNull();

    const [reg, works] = app.documents;
    expect([reg!.clientKey, works!.clientKey]).toEqual(["new:reg", "new:works"]);
    expect(works!.typeLabelSnapshot).toBe("Works board certificate");
    expect(works!.values.map((v) => [v.codeSnapshot, v.labelSnapshot]).sort()).toEqual([["B", "Buildings"], ["G1", "Grade one"]]);
    expect(works!.attachments).toHaveLength(2);
    for (const a of [...reg!.attachments, ...works!.attachments]) {
      expect(a.purpose).toBe("PORTAL_APPLICATION_DOCUMENT");
      expect(a.version.recordedByPortalApplicationId).toBe(app.id);
      expect(a.version.recordedByPersonId).toBeNull();
      expect(a.version.recordedBySupplierAccountId).toBeNull();
    }
    const sent = i.files.get("new:works")!.map((f) => f.sha256).sort();
    expect(works!.attachments.map((a) => a.version.sha256).sort()).toEqual(sent);

    expect(app.creditor!.bankAccountNo).toBe(i.body.creditor.bankAccountNo);
    expect(app.creditor!.attachments).toHaveLength(1);
    expect(app.creditor!.attachments[0]!.purpose).toBe("PORTAL_APPLICATION_BANK_STATEMENT");
    expect(app.creditor!.attachments[0]!.version.document.classificationSnapshot).toBe("SULIT");
    expect(app.creditor!.attachments[0]!.version.sha256).toBe(i.statement[0]!.sha256);

    expect(app.declarations.map((d) => d.kind).sort()).toEqual(["FALSE_DECLARATION", "GIRO_AUTHORISATION", "TERMS_AND_CONDITIONS"]);
    for (const d of app.declarations) {
      expect(d.textSha256).toBe(texts[d.kind as keyof typeof texts].sha);
      expect(d.frozenTextEn).toContain("Receive Test Authority");
      expect(d.signatoryName).toBe("Aminah Binti Ali");
      expect(d.signedBySupplierAccountId).toBeNull();
      expect(d.applicationId).toBeNull();
      expect(d.noticeSha256 != null).toBe(d.kind === "TERMS_AND_CONDITIONS");
    }
    const terms = app.declarations.find((d) => d.kind === "TERMS_AND_CONDITIONS")!;
    expect(terms.noticeSha256).toBe(noticeSha);
    expect(terms.noticeFrozenEn).toContain("Receive Test Authority keeps these details");

    expect(app.formToken).toMatchObject({ tokenSha256: i.token.sha256, portalApplicationId: app.id });

    const trail = await db.auditEntry.findMany({ where: { organisationId: org.id, entity: "PortalApplication", entityId: app.id } });
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ actorKind: "APPLICANT", actorPortalApplicationId: app.id, action: "CREATE" });
    const said = JSON.stringify(trail[0]!.changes) + trail[0]!.entityLabel;
    expect(said).toContain(out.reference);
    expect(said).toMatch(/entered/);
    for (const personal of [i.body.company.registeredName, i.body.company.registrationNo, i.body.company.contact.name, i.body.company.contact.email, i.body.company.companyEmail, i.body.creditor.bankAccountNo, i.body.company.address.addressLine1]) expect(said).not.toContain(personal);
    // The files' own rows in the trail are the store's, each by the applicant and never by a person's name.
    const fileTrail = await db.auditEntry.findMany({ where: { organisationId: org.id, actorPortalApplicationId: app.id, entity: "DocumentVersion" } });
    expect(fileTrail).toHaveLength(4);
    for (const r of fileTrail) {
      expect(r.actorKind).toBe("APPLICANT");
      expect(JSON.stringify(r.changes)).toContain("Applicant, not signed in");
    }
  });

  it("takes a token made a moment ahead of this server's clock: it is spent no earlier than it was made", async () => {
    const i = input();
    const out = await receivePublicApplication({ ...i, token: { ...i.token, issuedAt: new Date(i.now.getTime() + 30_000) } });
    expect(out.ok).toBe(true);
    const row = await db.portalFormToken.findFirstOrThrow({ where: { organisationId: org.id, tokenSha256: i.token.sha256 } });
    expect(row.consumedAt.getTime()).toBeGreaterThanOrEqual(row.issuedAt.getTime());
  });
});

describe("one application per token (plan 8.3.3, ADR 0041 D8)", () => {
  it("the same token twice in a row: one application, the same reference", async () => {
    const i = input();
    const first = await receivePublicApplication(i);
    const again = await receivePublicApplication({ ...i, files: new Map([["new:reg", [held("other")]], ["new:works", [held("other-a")]]]), statement: [held("other-s")] });
    expect(first.ok && again.ok).toBe(true);
    expect(again).toEqual(first);
    expect(await db.portalFormToken.count({ where: { organisationId: org.id, tokenSha256: i.token.sha256 } })).toBe(1);
    expect(await findSpent(db, org.id, i.token.sha256)).toEqual({ reference: (first as { reference: string }).reference });
  });

  it("the same token twice at once: one application, and both replies carry its reference", async () => {
    const i = input();
    const before = (await counts()).applications;
    const [a, b] = await Promise.all([receivePublicApplication(i), receivePublicApplication({ ...i, statement: [held("racing")] })]);
    expect(a.ok && b.ok).toBe(true);
    expect(a).toEqual(b);
    expect((await counts()).applications).toBe(before + 1);
  });

  it("a spent token is found only in its own organisation", async () => {
    const i = input();
    await receivePublicApplication(i);
    expect(await findSpent(db, "another-organisation", i.token.sha256)).toBeNull();
  });
});

describe("a refusal after the files were read leaves nothing, not a row and not a byte (plan 8.3.2)", () => {
  it("the per-number limit, counted under the series lock: busy, and every table as it was", async () => {
    const number = `RCV-${randomId()}`;
    for (let n = 0; n < 2; n++) expect((await receivePublicApplication(input({ body: application(number) }))).ok).toBe(true);
    const before = await counts();
    const out = await receivePublicApplication(input({ body: application(number) }));
    expect(out).toEqual({ ok: false, kind: "BUSY" });
    expect(await counts()).toEqual(before);
  });

  it("an application of the number set aside or rejected no longer holds its place (RSEC-1(b)); the day's total still counts it", async () => {
    const number = `RCV-${randomId()}`;
    for (let n = 0; n < 2; n++) expect((await receivePublicApplication(input({ body: application(number) }))).ok).toBe(true);
    expect(await receivePublicApplication(input({ body: application(number) }))).toEqual({ ok: false, kind: "BUSY" });
    const sent = await db.portalApplication.findMany({ where: { organisationId: org.id, registrationNoKey: number.toUpperCase() }, orderBy: { receivedAt: "asc" } });
    await db.portalApplication.update({ where: { id: sent[0]!.id }, data: { status: "DISCARDED", decidedAt: new Date() } });
    expect((await receivePublicApplication(input({ body: application(number) }))).ok).toBe(true);
    const third = await db.portalApplication.findFirstOrThrow({ where: { organisationId: org.id, registrationNoKey: number.toUpperCase(), status: "RECEIVED" }, orderBy: { receivedAt: "desc" } });
    await db.portalApplication.update({ where: { id: third.id }, data: { status: "REJECTED", decidedAt: new Date() } });
    expect((await receivePublicApplication(input({ body: application(number) }))).ok).toBe(true);
    // The day's total counts every row: with the limit at what has arrived, nothing more is taken, whatever became of them.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastDay = await db.portalApplication.count({ where: { organisationId: org.id, receivedAt: { gte: since } } });
    expect(await receivePublicApplication(input({ register: { ...register(), limits: { daily: lastDay, perNumber: 5 } } as RegisterSettings }))).toEqual({ ok: false, kind: "BUSY" });
  });

  it("no lock on the agreed texts is held while the bytes are written (security audit M3): a text retired meanwhile is not kept waiting, and still refuses the whole", async () => {
    const before = await counts();
    const terms = texts.TERMS_AND_CONDITIONS;
    let retired = false;
    // The first byte written stands for the slow part of a large application: while it is being written, an officer retires the terms from another connection.
    const store = {
      ...postgresBlobStore,
      put: async (tx: Parameters<typeof postgresBlobStore.put>[0], o: string, sha: string, bytes: Uint8Array) => {
        if (!retired) {
          retired = true;
          await db.declarationText.update({ where: { id: terms.id }, data: { retiredOn: new Date(`${today}T00:00:00Z`) } });
        }
        return postgresBlobStore.put(tx, o, sha, bytes);
      },
    };
    try {
      const out = await receivePublicApplication(input({ store }));
      expect(retired).toBe(true);
      if (out.ok || out.kind !== "VALIDATION") throw new Error(`expected a refusal by the rules, got ${JSON.stringify(out)}`);
      expect(out.faults.some((f) => f.step === "review" && f.level === "block")).toBe(true);
      expect(await counts()).toEqual(before);
    } finally {
      const old = await db.declarationText.findUniqueOrThrow({ where: { id: terms.id } });
      const next = await db.declarationText.create({ data: { organisationId: org.id, kind: "TERMS_AND_CONDITIONS", version: old.version + 1, bodyEn: old.bodyEn, provenance: "ASSUMED", issuedOn: new Date("2026-01-01T00:00:00Z") } });
      texts.TERMS_AND_CONDITIONS = { id: next.id, sha: frozenWording({ bodyEn: next.bodyEn, bodyMs: null }, org.name).sha256 };
    }
  }, 30_000);

  it("the terms retired between the page and Submit: refused at the review step, and every table as it was", async () => {
    const before = await counts();
    const terms = texts.TERMS_AND_CONDITIONS;
    await db.declarationText.update({ where: { id: terms.id }, data: { retiredOn: new Date(`${today}T00:00:00Z`) } });
    try {
      const out = await receivePublicApplication(input());
      expect(out.ok).toBe(false);
      if (out.ok || out.kind !== "VALIDATION") throw new Error(`expected a refusal by the rules, got ${JSON.stringify(out)}`);
      expect(out.faults.some((f) => f.step === "review" && f.level === "block")).toBe(true);
      expect(await counts()).toEqual(before);
    } finally {
      // A new wording takes its place, so the organisation's register is open again for whatever runs after.
      const old = await db.declarationText.findUniqueOrThrow({ where: { id: terms.id } });
      const next = await db.declarationText.create({ data: { organisationId: org.id, kind: "TERMS_AND_CONDITIONS", version: old.version + 1, bodyEn: old.bodyEn, provenance: "ASSUMED", issuedOn: new Date("2026-01-01T00:00:00Z") } });
      texts.TERMS_AND_CONDITIONS = { id: next.id, sha: frozenWording({ bodyEn: next.bodyEn, bodyMs: null }, org.name).sha256 };
    }
  });

  it("the statement's class no longer SULIT: closed, and every table as it was", async () => {
    const before = await counts();
    await db.documentClass.update({ where: { id: classStatement }, data: { classification: "INTERNAL" } });
    try {
      expect(await receivePublicApplication(input())).toEqual({ ok: false, kind: "CLOSED" });
      expect(await counts()).toEqual(before);
    } finally {
      await db.documentClass.update({ where: { id: classStatement }, data: { classification: "SULIT" } });
    }
  });
});
