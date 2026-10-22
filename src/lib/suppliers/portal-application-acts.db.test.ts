import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import type { FormState } from "@/components/record-editor";
import type { ActWriter } from "@/lib/auth/act-writer";
import type { AuditActor, StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/documents/store";
import { postgresBlobStore } from "@/lib/documents/store/postgres";
import { dayToDate, todayIn } from "@/lib/dates";
import type { RegisterSettings } from "@/lib/portal/apply-repo";
import type { PublicApplicationBody } from "@/lib/portal/register/contract";
import { body as fixtureBody, step1 } from "@/lib/portal/register/fixture";
import { receivePublicApplication, type HeldFile, type ReceiveInput } from "@/lib/portal/register/receive-store";
import { tokenSha256 } from "@/lib/portal/register/token-store";
import { frozenWording, personalDataNoticeOf } from "@/lib/portal/registration/declaration-text";
import { creditor } from "@/lib/portal/registration/fixture";
import { facts, makePerson, randomId } from "@/lib/test-db/auth-fixtures";
import { STAFF_FIXTURE } from "@/lib/test-support/staff";
import { APPLICANT_WORDS } from "@/lib/audit/actor";
import { creditorDecision, creditorNamedFacts, portalCreditorNamedFacts } from "@/lib/auth/creditor-access-store";
import { openSupplierAccount } from "@/lib/auth/supplier-administration";
import { documentBytesAccess } from "@/lib/documents/entitlement";
import { recorderWords } from "@/lib/documents/views";
import { ownDeclarationRows } from "@/lib/portal/data-export-store";
import { APPLY } from "@/lib/portal/labels";
import { reviewFacts } from "@/lib/portal/registration/review-facts";
import { registrationSummary } from "@/lib/portal/registration/summary";
import { loadDeclarationsSummary, loadSentDocumentsSummary } from "@/lib/portal/registration/summary-store";

import { recordOutcome, setAsideOnlineApplication } from "./application-acts";
import { decidePortalRegistrationStep, rejectPortalApplication, sendPortalApplicationForDecision, verifyPortalCreditor, verifyPortalDocument, type PortalActContext } from "./portal-application-acts";
import { loadSupplier, supplierHistory, supplierOrg } from "./repo";
import { Refusal, withLockedSupplier } from "./write";

/**
 * The officer's decision on a whole online application, against the scratch database (ADR 0041 D5 to D7, plan 8.4): a named officer verifies the certificates; the application is sent on
 * the `supplier_registration` route; a holder decides; the last approval creates the supplier, its application and decision, the certificates with their checks and files, and version 1
 * of the creditor's profile, in one transaction, refused whole if the number reached the register meanwhile. A rejection keeps the reasons as written and creates no supplier; set aside
 * erases the words and the bank details and keeps the files and agreements; neither while a route waits. This file has an organisation of its own.
 */

const run = randomId();
const ORG_CODE = `REG_DECIDE_${run}`;
const OFFICE = `RD_OFFICE_${run}`;
const TZ = "Asia/Kuala_Lumpur";
const NOTICE_EN = "{organisation} keeps these details to check the application.";

let org: { id: string; name: string };
let today: string;
let classCert = "";
let classStatement = "";
let typeReg = "";
let typeWorks = "";
let gradeId = "";
let categoryId = "";
const texts: Record<"GIRO_AUTHORISATION" | "FALSE_DECLARATION" | "TERMS_AND_CONDITIONS", { id: string; sha: string }> = {} as never;
let noticeSha = "";
const p = { sender: "", approver: "", checker: "", other: "" };

beforeAll(async () => {
  const o = await db.organisation.create({ data: { code: ORG_CODE, name: "Decide Test Authority", timeZone: TZ } });
  org = { id: o.id, name: o.name };
  today = todayIn(new Date(), TZ)!;
  const organisationId = org.id;
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Decide ${k} ${run}`)).id;
  const cls = (code: string, classification: "SULIT" | "INTERNAL") => db.documentClass.create({ data: { organisationId, code, nameEn: `Class ${code}`, classification } });
  classCert = (await cls("rd_cert", "INTERNAL")).id;
  classStatement = (await cls("rd_statement", "SULIT")).id;
  const policy = { personalDataNoticeEn: NOTICE_EN, verificationNoticeEn: "An officer checks each document.", uploadMaxFilesPerApplication: 6, uploadMaxBytesPerApplication: 1_000_000n, supplierUploadClassId: classCert, supplierBankStatementClassId: classStatement, onlineDeclarationReplacesPaper: true, portalDailyLimit: 1000, portalDailyLimitPerNumber: 5 };
  await db.supplierPolicy.create({ data: { organisationId, ...policy } });
  await db.numberingSeries.create({ data: { organisationId, key: "portal_application", nameEn: "Online applications", pattern: "RD/{SERIAL}", padding: 4, resetOn: "NEVER" } });
  await db.numberingSeries.create({ data: { organisationId, key: "supplier", nameEn: "Suppliers", pattern: "SUP/{SERIAL}", padding: 4, resetOn: "NEVER" } });
  const board = await db.registrationBody.create({ data: { organisationId, code: "rd_board", labelEn: "the Works board", provenance: "ASSUMED" } });
  const type = (code: string, nameEn: string, extra: Record<string, unknown> = {}) => db.supplierDocumentType.create({ data: { organisationId, code, nameEn, provenance: "ASSUMED", expires: true, mandatoryAtRegistration: true, notApplicableAllowed: false, ...extra } });
  typeReg = (await type("rd_reg", "Companies registry certificate")).id;
  typeWorks = (await type("rd_works", "Works board certificate", { bodyId: board.id, valueKinds: ["GRADE", "CATEGORY"] })).id;
  const value = (code: string, kind: "GRADE" | "CATEGORY", nameEn: string) => db.registrationValue.create({ data: { organisationId, bodyId: board.id, kind, code, nameEn, provenance: "ASSUMED" } });
  gradeId = (await value("G1", "GRADE", "Grade one")).id;
  categoryId = (await value("B", "CATEGORY", "Buildings")).id;
  const list = (code: string, kind: "BANK" | "ACCOUNT_TYPE", nameEn: string) => db.supplierListValue.create({ data: { organisationId, list: kind, code, nameEn, provenance: "ASSUMED" } });
  await list("bank-a", "BANK", "Demonstration Bank");
  await list("current", "ACCOUNT_TYPE", "Current account");
  const text = async (kind: keyof typeof texts, bodyEn: string) => {
    const t = await db.declarationText.create({ data: { organisationId, kind, version: 1, bodyEn, provenance: "ASSUMED", issuedOn: new Date("2026-01-01T00:00:00Z") } });
    texts[kind] = { id: t.id, sha: frozenWording({ bodyEn: t.bodyEn, bodyMs: null }, org.name).sha256 };
  };
  await text("GIRO_AUTHORISATION", "We authorise {organisation} to pay.");
  await text("FALSE_DECLARATION", "What we tell {organisation} is true.");
  await text("TERMS_AND_CONDITIONS", "These are the terms of registration with {organisation}.");
  noticeSha = personalDataNoticeOf(NOTICE_EN, org.name)!.sha256;
  // The office that approves a registration, held by the approver; a matrix in force with the registration rule (no value band).
  await db.authorityRole.create({ data: { organisationId, code: OFFICE, nameEn: `Registration office ${run}`, nameMs: `Pejabat ${run}` } });
  await db.roleAssignment.create({ data: { personId: p.approver, roleCode: OFFICE, effectiveFrom: dayToDate("2020-01-01") } });
  const m = await db.authorityMatrix.create({ data: { organisationId, label: "Decide test limits", effectiveFrom: new Date("2020-01-01T00:00:00Z"), issuedAt: new Date("2020-01-01T00:00:00Z"), boundaryValue: "1.00", quotationFloor: "1.00", tenderFloor: "1.00", requisitionBoundary: "1.00" } });
  await db.authorityRule.create({ data: { authorityMatrixId: m.id, ruleKey: `rd.supplier.registration.${run}`, domain: "supplier_registration", labelEn: "Supplier registration", approverCode: OFFICE, clause: "T 1", sortOrder: 1, generateCoreChain: false, coreChainReason: "One office approves (test)." } });
});

// ------------------------------------------------------------------ helpers

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
    limits: { daily: 1000, perNumber: 5 },
    addressLimit: { attempts: 1000, minutes: 60 },
    readiness: null as never,
    missing: [],
  }) as RegisterSettings;

function application(registrationNo: string): PublicApplicationBody {
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

/// A whole application received for this number, through the public form's own core. Its id.
async function received(registrationNo = `RD-${randomId()}`): Promise<string> {
  const token = `${Date.now()}.${randomBytes(16).toString("base64url")}.${randomBytes(32).toString("base64url")}`;
  const i: ReceiveInput = {
    register: register(),
    token: { sha256: tokenSha256(token), issuedAt: new Date(Date.now() - 60_000) },
    body: application(registrationNo),
    files: new Map([["new:reg", [held("registry")]], ["new:works", [held("works")]]]),
    statement: [held("statement")],
    store: postgresBlobStore,
    sourceAddress: "203.0.113.7",
    now: new Date(),
  };
  const out = await receivePublicApplication(i);
  if (!out.ok) throw new Error(`not received: ${JSON.stringify(out)}`);
  return (await db.portalApplication.findFirstOrThrow({ where: { organisationId: org.id, reference: out.reference } })).id;
}

const staff = (personId: string): AuditActor => ({ kind: "STAFF", personId, sessionId: null, offices: [], sourceAddress: "203.0.113.8" });

/// The attributions an act wrote, kept to be asserted on.
const written: { slot: string; entityId: string; document?: { entity: string; id: string } | null }[] = [];
const writer = (subjectPersonId: string): ActWriter => ({
  subjectPersonId,
  recorderId: null,
  intent: { mode: "SIGNED" },
  day: today,
  write: async (_tx, entityId, extra) => void written.push({ slot: "main", entityId, document: extra?.document ?? null }),
  writeAlso: async (_tx, slotKey, entityId, extra) => void written.push({ slot: slotKey, entityId, document: extra?.document ?? null }),
});

/// Run a core in its own transaction, as the action does; a Refusal thrown inside rolls it back and is returned.
async function as<T extends FormState>(personId: string, fn: (c: PortalActContext) => Promise<T>): Promise<FormState> {
  try {
    return await db.$transaction(async (tx) => {
      const o = (await supplierOrg(org.id, tx))!;
      return fn({ tx, actor: staff(personId), org: o, now: new Date(), act: writer(personId) });
    }, { timeout: 30_000, maxWait: 10_000 });
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    throw e;
  }
}

const docsOf = (id: string) => db.portalApplicationDocument.findMany({ where: { portalApplicationId: id }, orderBy: { clientKey: "asc" } });
async function verifyAll(id: string, by = p.checker) {
  for (const d of await docsOf(id)) expect(await as(by, (c) => verifyPortalDocument(c, { documentId: d.id, state: "VERIFIED", verifiedOn: today, note: "", personId: by }))).toMatchObject({ ok: true });
}
const send = (id: string, by = p.sender) => as(by, (c) => sendPortalApplicationForDecision(c, { portalApplicationId: id, personId: by }));
async function pendingStep(id: string) {
  const r = await db.approvalInstance.findFirstOrThrow({ where: { portalApplicationId: id, status: "PENDING" }, include: { steps: { orderBy: { sequence: "asc" } } } });
  return r.steps.find((s) => s.decision === "PENDING")!;
}
const decide = async (id: string, by = p.approver, decision: "DONE" | "REJECTED" = "DONE", reason = "") => {
  const step = await pendingStep(id);
  return as(by, (c) => decidePortalRegistrationStep(c, { stepId: step.id, decision, reason, personId: by, decidedOn: dayToDate(today), onBehalf: false }));
};
const stored = (id: string) => db.portalApplication.findUniqueOrThrow({ where: { id }, include: { creditor: true, documents: { include: { attachments: true } }, declarations: true, routes: true } });

// ------------------------------------------------------------------ the tests

describe("verifying and sending (FR-VND-004, ADR 0041 D5)", () => {
  it("is refused while a mandatory certificate is unchecked, and while the number is on the register", async () => {
    const id = await received();
    const before = await send(id);
    expect(before.ok).toBe(false);
    expect(before.message).toMatch(/^Not sent:/);
    expect(await db.approvalInstance.count({ where: { portalApplicationId: id } })).toBe(0);

    const number = `RD-${randomId()}`;
    const clash = await received(number);
    await verifyAll(clash);
    await db.supplier.create({ data: { organisationId: org.id, reference: `X/${randomId()}`, registeredName: "Holder", registrationNo: number, registrationNoKey: number.toUpperCase(), entityTypeCode: "x", countryCode: "x", registeredAddress: "x", companyEmail: "h@x.invalid" } });
    const onRegister = await send(clash);
    expect(onRegister).toMatchObject({ ok: false, message: expect.stringContaining("already on the register") });
    expect(await db.approvalInstance.count({ where: { portalApplicationId: clash } })).toBe(0);
  });

  it("a named officer checks each certificate once, on the held row; the route resolves with the sender as requester", async () => {
    const id = await received();
    written.length = 0;
    await verifyAll(id);
    const docs = await docsOf(id);
    expect(docs.every((d) => d.verification === "VERIFIED" && d.verifiedByPersonId === p.checker && d.verifiedOn != null)).toBe(true);
    expect(written.filter((w) => docs.some((d) => d.id === w.entityId)).map((w) => w.document)).toEqual(docs.map(() => ({ entity: "PortalApplication", id })));
    // Checked once.
    const again = await as(p.checker, (c) => verifyPortalDocument(c, { documentId: docs[0]!.id, state: "NOT_IN_ORDER", verifiedOn: today, note: "x", personId: p.checker }));
    expect(again.ok).toBe(false);

    expect(await send(id)).toMatchObject({ ok: true });
    const pa = await stored(id);
    expect(pa.sentByPersonId).toBe(p.sender);
    expect(pa.status).toBe("RECEIVED");
    const route = await db.approvalInstance.findFirstOrThrow({ where: { portalApplicationId: id }, include: { steps: true } });
    expect(route).toMatchObject({ matterKind: "SUPPLIER", supplierApplicationId: null, domain: "supplier_registration", cond: "NEW", value: null, status: "PENDING" });
    expect(route.steps.map((s) => s.roleCode)).toEqual([OFFICE]);
    // Not sent twice while it waits.
    expect((await send(id)).ok).toBe(false);
    // The sender cannot decide a step of the route it sent (self-approval), and nobody who does not hold the office can.
    expect((await decide(id, p.sender)).ok).toBe(false);
    expect((await decide(id, p.other)).ok).toBe(false);
    expect((await pendingStep(id)).decision).toBe("PENDING");
  });

  it("checks the bank details once, as signed, against the statement", async () => {
    const id = await received();
    written.length = 0;
    const res = await as(p.checker, (c) => verifyPortalCreditor(c, { portalApplicationId: id, state: "VERIFIED", verifiedOn: today, note: "", personId: p.checker }));
    expect(res).toMatchObject({ ok: true });
    const cr = (await stored(id)).creditor!;
    expect(cr).toMatchObject({ verification: "VERIFIED", verifiedByPersonId: p.checker });
    expect(written.map((w) => w.entityId)).toEqual([cr.id]);
    expect((await as(p.checker, (c) => verifyPortalCreditor(c, { portalApplicationId: id, state: "VERIFIED", verifiedOn: today, note: "", personId: p.checker }))).ok).toBe(false);
  });
});

describe("the last approval (ADR 0041 D6)", () => {
  it("creates the supplier with its contact, application, decision, certificates (checks and files carried, the applicant their recorder) and profile version 1", async () => {
    const number = `RD-${randomId()}`;
    const id = await received(number);
    await verifyAll(id);
    await as(p.checker, (c) => verifyPortalCreditor(c, { portalApplicationId: id, state: "VERIFIED", verifiedOn: today, note: "", personId: p.checker }));
    expect(await send(id)).toMatchObject({ ok: true });
    // Nothing exists on the register before the decision: no supplier, no application to request a resubmission on (REG-3).
    expect(await db.supplier.count({ where: { organisationId: org.id, registrationNoKey: number.toUpperCase() } })).toBe(0);
    expect(await db.supplierApplication.count({ where: { portalApplicationId: id } })).toBe(0);
    written.length = 0;
    const res = await decide(id);
    expect(res).toMatchObject({ ok: true, message: expect.stringContaining("is registered as") });

    const pa = await stored(id);
    expect(pa.status).toBe("APPROVED");
    expect(pa.decidedByPersonId).toBe(p.approver);
    expect(pa.routes[0]!.status).toBe("APPROVED");
    const s = await db.supplier.findUniqueOrThrow({ where: { id: pa.acceptedSupplierId! }, include: { contacts: true, applications: { include: { decisions: true } }, documents: { include: { values: true, attachments: { include: { version: true } } } }, creditorProfiles: { include: { attachments: true } } } });
    expect(s).toMatchObject({ status: "REGISTERED", registrationNo: number, registrationNoKey: number.toUpperCase(), registeredName: pa.registeredName, companyEmail: pa.companyEmail });
    expect(s.registeredOn).toEqual(dayToDate(today));
    expect(s.reference).toMatch(/^SUP\/\d{4}$/);
    expect(s.contacts).toHaveLength(1);
    expect(s.contacts[0]).toMatchObject({ name: pa.contactName, isPrimary: true });
    const [app] = s.applications;
    expect(app).toMatchObject({ kind: "NEW", channel: "PORTAL", status: "APPROVED", portalApplicationId: id, recordedByPersonId: null, submittedAt: null, submittedByPersonId: p.sender });
    expect(app!.decisions).toHaveLength(1);
    expect(app!.decisions[0]).toMatchObject({ outcome: "APPROVE", decidedByPersonId: p.approver });
    expect((app!.decisions[0]!.policySnapshot as { mandatory: unknown[] }).mandatory).toHaveLength(2);
    expect(written.map((w) => w.slot)).toContain("ApplicationDecision.decidedBy");

    expect(s.documents).toHaveLength(2);
    for (const d of s.documents) {
      expect(d).toMatchObject({ applicationId: app!.id, verification: "VERIFIED", verifiedByPersonId: p.checker, recordedByPortalApplicationId: id, recordedByPersonId: null, recordedBySupplierAccountId: null });
      expect(d.attachments).toHaveLength(1);
      expect(d.attachments[0]!.purpose).toBe("SUPPLIER_DOCUMENT");
      expect(d.attachments[0]!.version.recordedByPortalApplicationId).toBe(id);
    }
    expect(s.documents.flatMap((d) => d.values.map((v) => v.codeSnapshot)).sort()).toEqual(["B", "G1"]);
    // The held rows' files are moved, with the reason, not copied.
    for (const d of pa.documents) for (const a of d.attachments) expect(a.detachReason).toContain(s.reference);

    expect(s.creditorProfiles).toHaveLength(1);
    const prof = s.creditorProfiles[0]!;
    expect(prof).toMatchObject({ version: 1, enteredByPortalApplicationId: id, enteredBySupplierAccountId: null, verification: "VERIFIED", verifiedByPersonId: p.checker, bankAccountNo: pa.creditor!.bankAccountNo });
    expect(prof.submittedAt).toEqual(pa.receivedAt);
    expect(prof.attachments.map((a) => a.purpose)).toEqual(["SUPPLIER_BANK_STATEMENT"]);
    // The person columns the promotion writes read as attributed, never as missing: each check carried for its officer, and the sender for the new application.
    const carried = async (entity: string, entityId: string, slot: string) => db.actAttribution.findMany({ where: { organisationId: org.id, entity, entityId, slot } });
    for (const d of s.documents) expect((await carried("SupplierDocument", d.id, "verifiedBy")).map((a) => a.subjectPersonId)).toEqual([p.checker]);
    expect((await carried("CreditorProfile", prof.id, "verifiedBy")).map((a) => a.subjectPersonId)).toEqual([p.checker]);
    expect((await carried("SupplierApplication", app!.id, "submittedBy")).map((a) => a.subjectPersonId)).toEqual([p.sender]);
    expect((await carried("PortalApplication", id, "decidedBy")).map((a) => a.subjectPersonId)).toEqual([p.approver]);
    // The agreements stay on the application, never copied.
    expect(pa.declarations).toHaveLength(3);
    expect(await db.registrationDeclaration.count({ where: { applicationId: app!.id } })).toBe(0);
    // Every row is in the trail.
    for (const [entity, entityId] of [["Supplier", s.id], ["SupplierContact", s.contacts[0]!.id], ["SupplierApplication", app!.id], ["ApplicationDecision", app!.decisions[0]!.id], ["CreditorProfile", prof.id], ["PortalApplication", id], ...s.documents.map((d) => ["SupplierDocument", d.id])] as const)
      expect(await db.auditEntry.count({ where: { organisationId: org.id, entity, entityId } }), entity).toBeGreaterThan(0);

    // REG-3: a resubmission cannot be asked on what was approved.
    const resub = await db.$transaction((tx) => withLockedSupplier(tx, org.id, s.id, (t, l) => recordOutcome(t, staff(p.checker), l, { applicationId: app!.id, outcome: "RESUBMIT", remarks: "x", resubmitBy: "2099-01-01", personId: p.checker, items: [{ documentId: null, typeId: typeReg, remarks: "x" }], now: new Date() })));
    expect(resub.ok).toBe(false);
  });

  it("is refused whole, the step not recorded, when the number reached the register after it was sent", async () => {
    const number = `RD-${randomId()}`;
    const id = await received(number);
    await verifyAll(id);
    expect(await send(id)).toMatchObject({ ok: true });
    await db.supplier.create({ data: { organisationId: org.id, reference: `X/${randomId()}`, registeredName: "Meanwhile", registrationNo: number, registrationNoKey: number.toUpperCase(), entityTypeCode: "x", countryCode: "x", registeredAddress: "x", companyEmail: "m@x.invalid" } });
    const suppliers = await db.supplier.count({ where: { organisationId: org.id } });
    const res = await decide(id);
    expect(res).toMatchObject({ ok: false, message: expect.stringContaining("already on the register") });
    expect((await pendingStep(id)).decision).toBe("PENDING");
    expect((await stored(id)).status).toBe("RECEIVED");
    expect(await db.supplier.count({ where: { organisationId: org.id } })).toBe(suppliers);
  });

  it("a refusal on the route returns the application to the officer, waiting", async () => {
    const id = await received();
    await verifyAll(id);
    await send(id);
    expect(await decide(id, p.approver, "REJECTED", "The certificate is a copy.")).toMatchObject({ ok: true });
    const pa = await stored(id);
    expect(pa.status).toBe("RECEIVED");
    expect(pa.routes[0]!.status).toBe("REJECTED");
    expect(pa.acceptedSupplierId).toBeNull();
  });
});

describe("rejecting and setting aside (ADR 0041 D7)", () => {
  it("rejects with the reasons as written, creates no supplier, and a fresh application with the same number is then taken", async () => {
    const number = `RD-${randomId()}`;
    const id = await received(number);
    const reasons = "The registry certificate is not the company's.\nSend the right one with a new application.";
    expect(await as(p.checker, (c) => rejectPortalApplication(c, { portalApplicationId: id, reasons, personId: p.checker }))).toMatchObject({ ok: true });
    const pa = await stored(id);
    expect(pa).toMatchObject({ status: "REJECTED", decisionRemarks: reasons, decidedByPersonId: p.checker, acceptedSupplierId: null });
    expect(await db.supplier.count({ where: { organisationId: org.id, registrationNoKey: number.toUpperCase() } })).toBe(0);
    const trail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: org.id, entity: "PortalApplication", entityId: id, action: "UPDATE" } });
    expect(trail.reason).toBe(reasons);
    // Decided: not again.
    expect((await as(p.checker, (c) => rejectPortalApplication(c, { portalApplicationId: id, reasons: "again", personId: p.checker }))).ok).toBe(false);
    const fresh = await received(number);
    expect((await stored(fresh)).status).toBe("RECEIVED");
  });

  it("neither rejects nor sets aside while a route waits", async () => {
    const id = await received();
    await verifyAll(id);
    await send(id);
    const rejected = await as(p.checker, (c) => rejectPortalApplication(c, { portalApplicationId: id, reasons: "No.", personId: p.checker }));
    expect(rejected).toMatchObject({ ok: false, message: expect.stringContaining("A route is waiting") });
    const setAside = await db.$transaction((tx) => setAsideOnlineApplication(tx, staff(p.checker), org.id, { id, reason: "Junk.", personId: p.checker, now: new Date() }));
    expect(setAside).toMatchObject({ ok: false, message: expect.stringContaining("A route is waiting") });
    expect((await stored(id)).status).toBe("RECEIVED");
  });

  it("set aside erases the typed words and the bank details, and keeps the files and the agreements", async () => {
    const id = await received();
    const before = await stored(id);
    const res = await db.$transaction((tx) => setAsideOnlineApplication(tx, staff(p.checker), org.id, { id, reason: "Not a company.", personId: p.checker, now: new Date() }));
    expect(res).toMatchObject({ ok: true });
    const pa = await stored(id);
    expect(pa).toMatchObject({ status: "DISCARDED", registeredName: "", contactName: "", registrationNoKey: "" });
    expect(pa.erasedAt).not.toBeNull();
    expect(pa.creditor!.erasedAt).not.toBeNull();
    expect(pa.creditor!.bankAccountNo).toBe("");
    expect(pa.creditor!.beneficiaryName).toBe("");
    expect(pa.documents.flatMap((d) => d.attachments).filter((a) => a.detachedAt == null)).toHaveLength(before.documents.flatMap((d) => d.attachments).length);
    expect(pa.declarations).toHaveLength(3);
    const trail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: org.id, entity: "PortalApplication", entityId: id, action: "UPDATE" } });
    expect(JSON.stringify(trail.changes)).toContain("Files and agreements kept");
  });
});

// ------------------------------------------------------------------ who may read the bank details, the account after approval, and the readers of an applicant's rows

/// A whole application taken through to approval: the certificates and the bank details checked, sent, approved. Its id, the supplier's and the new application's.
async function approved(number = `RD-${randomId()}`) {
  const id = await received(number);
  await verifyAll(id);
  await as(p.checker, (c) => verifyPortalCreditor(c, { portalApplicationId: id, state: "VERIFIED", verifiedOn: today, note: "", personId: p.checker }));
  expect(await send(id)).toMatchObject({ ok: true });
  expect(await decide(id)).toMatchObject({ ok: true });
  const pa = await db.portalApplication.findUniqueOrThrow({ where: { id }, select: { acceptedSupplierId: true, supplierApplication: { select: { id: true } } } });
  return { id, supplierId: pa.acceptedSupplierId!, applicationId: pa.supplierApplication!.id };
}

const reader = (personId: string, permissions: string[] = []) => ({ kind: "STAFF", personId, organisationId: org.id, isAdministrator: false, permissions: new Set(permissions), organisationTimeZone: TZ, sessionId: null, sourceAddress: "203.0.113.9" }) as never;

describe("SULIT: the bank details and statement held on an online application (plan 8.4.6, REG-1)", () => {
  it("are refused to a reader the route does not name, and granted to a step holder, the verifier and a holder of the grant; each bytes read is logged", async () => {
    const id = await received();
    await verifyAll(id);
    // Before a route: nobody is named but the grant's holders.
    const before = (await portalCreditorNamedFacts(db, org.id, [id])).get(id)!;
    expect(before).toMatchObject({ stepHolderIds: [], routeStarted: false, verifierId: null });
    expect(await send(id)).toMatchObject({ ok: true });
    const facts = (await portalCreditorNamedFacts(db, org.id, [id])).get(id)!;
    expect(facts.stepHolderIds).toContain(p.approver);
    const undecided = { state: "UNDECIDED" } as const;
    expect(creditorDecision(reader(p.other), facts, undecided).state).toBe("WITHHELD");
    expect(creditorDecision(reader(p.approver), facts, undecided).state).toBe("GRANTED");
    expect(creditorDecision(reader(p.other, ["sulit.read.creditorProfile"]), facts, { state: "ROLE", roleCodes: [] }).state).toBe("GRANTED");

    // The statement's bytes are judged by the same names, and every read is logged, allowed or refused.
    const held = await db.portalApplicationCreditor.findUniqueOrThrow({ where: { portalApplicationId: id }, include: { attachments: { include: { version: true } } } });
    const documentId = held.attachments[0]!.version.documentId;
    const events = () => db.sulitAccessEvent.count({ where: { organisationId: org.id, entityId: held.id } });
    const n0 = await events();
    expect((await db.$transaction((tx) => documentBytesAccess(tx, reader(p.other), documentId))).entitled).toBe(false);
    expect((await db.$transaction((tx) => documentBytesAccess(tx, reader(p.approver), documentId))).entitled).toBe(true);
    expect(await events()).toBe(n0 + 2);

    // The officer who checks them is named on them from then on.
    expect(await as(p.checker, (c) => verifyPortalCreditor(c, { portalApplicationId: id, state: "VERIFIED", verifiedOn: today, note: "", personId: p.checker }))).toMatchObject({ ok: true });
    const after = (await portalCreditorNamedFacts(db, org.id, [id])).get(id)!;
    expect(after.verifierId).toBe(p.checker);
    expect(creditorDecision(reader(p.checker), after, undecided).state).toBe("GRANTED");
  });

  it("after approval the creditor profile (version 1) is named by the online application's route, and its statement opens to its holders only", async () => {
    const { supplierId } = await approved();
    const profile = await db.creditorProfile.findFirstOrThrow({ where: { supplierId }, include: { attachments: { include: { version: true } } } });
    const named = (await creditorNamedFacts(db, org.id, [{ id: profile.id, supplierId, verifiedByPersonId: profile.verifiedByPersonId }])).get(profile.id)!;
    expect(named.routeStarted).toBe(true);
    expect([...named.stepHolderIds, ...named.stepDeciderIds]).toContain(p.approver);
    expect(named.verifierId).toBe(p.checker);
    const documentId = profile.attachments[0]!.version.documentId;
    expect((await db.$transaction((tx) => documentBytesAccess(tx, reader(p.other), documentId))).entitled).toBe(false);
    expect((await db.$transaction((tx) => documentBytesAccess(tx, reader(p.approver), documentId))).entitled).toBe(true);
  });
});

describe("after approval (plan 8.4.7, 8.4.8, 6.3)", () => {
  it("the portal account is opened later by an officer who holds the permission, with the one-time code, as today", async () => {
    const { supplierId } = await approved();
    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, include: { contacts: true } });
    const officer = { ...STAFF_FIXTURE, personId: p.checker, organisationId: org.id, organisationCode: ORG_CODE, organisationTimeZone: TZ, permissions: new Set(["supplierAccounts.manage"]) } as unknown as StaffActor;
    const out = await db.$transaction((tx) => openSupplierAccount(tx, { actor: officer, supplier: { id: supplier.id, reference: supplier.reference }, contactId: supplier.contacts[0]!.id, loginName: `rd.${randomId()}`, identityCheck: "Seen at the counter with the director's identity card", reason: "Opened after the online registration was approved", validityMinutes: 60, passwordHash: "$scrypt$unusable", request: facts(), now: new Date() }));
    expect(out.ok).toBe(true);
    const account = await db.supplierAccount.findFirstOrThrow({ where: { supplierId } });
    expect(account.status).toBe("PENDING_ACTIVATION");
  });

  it("an applicant's rows never read as the supplier's own portal account, and its agreements read as agreed, not signed (plan 6.3.1, 6.3.2)", async () => {
    const { id, supplierId, applicationId } = await approved();
    const scope = { organisationId: org.id, supplierId };
    const documents = await loadSentDocumentsSummary(db, scope, { applicationId });
    expect(documents).toHaveLength(2);
    for (const d of documents) expect(d).toMatchObject({ lodgedBy: APPLICANT_WORDS.toLowerCase(), lodgedByOfficer: false });
    const declarations = await loadDeclarationsSummary(db, scope, TZ, { applicationId });
    expect(declarations).toHaveLength(3);
    for (const d of declarations) expect(d.agreedNotSignedIn).toBe(true);
    const sections = registrationSummary(
      { company: { registeredName: "x", registrationNo: "x", formatChecked: null, entityTypeName: null, countryName: null, addressLines: [], incorporatedOn: null, companyEmail: "x", bumiputera: { kind: "NO_CLAIM", claim: null, reference: null, verification: null } }, contacts: { state: "GRANTED", value: [], basis: "NAMED_ON_RECORD" }, documents, creditor: { state: "GRANTED", value: null, basis: "NAMED_ON_RECORD" }, declarations, agreedOnline: true },
      { day: (d) => d },
    );
    const words = JSON.stringify(sections);
    expect(words).not.toMatch(/portal account/i);
    expect(words).not.toMatch(/Signed /);
    expect(words).toContain("Agreed ");
    expect(words).toContain(APPLY.unverified.en);

    // The supplier's History: the rows the approval wrote name the applicant, never the supplier's account.
    const l = await loadSupplier(org.id, supplierId, []);
    const history = JSON.stringify((await supplierHistory(l!)).entries);
    expect(history).not.toMatch(/portal account/i);
    expect(history).toContain(APPLICANT_WORDS);
    // The document register: each version the applicant sent says so.
    const versions = await db.documentVersion.findMany({ where: { recordedByPortalApplicationId: id } });
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) expect(recorderWords(v)).toBe(APPLICANT_WORDS);
    // The supplier's own export reads the three agreements, each worded as agreed (data-export.test.ts holds the words).
    const own = await ownDeclarationRows(db, org.id, supplierId);
    expect(own).toHaveLength(3);
    for (const d of own) expect(d).toMatchObject({ portalApplicationId: id, signedBySupplierAccountId: null });
    // The approval's own reader sees the online false declaration and the checked bank details.
    const review = await reviewFacts(db, org.id, supplierId, { id: applicationId, channel: "PORTAL", portalApplicationId: id });
    expect(review.onlineDeclaration).not.toBeNull();
    expect(review.creditorProfile).toBe("VERIFIED");
  });
});

describe("the organisation lock (review MUST 1)", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /**
   * A check of the bank details runs while a step is being decided, interleaved as two officers would: the check holds the application (as every act on it does) and has not yet
   * written its audit row; the decision takes the organisation and waits on the application; then the check writes. An audit row names its organisation by a foreign key, so it asks
   * for KEY SHARE on the organisation's row: taken FOR UPDATE by the decision, that closes a cycle (40P01). Taken FOR NO KEY UPDATE (`lockOrganisation`), both acts finish.
   */
  it("a check of the bank details made while a step is decided does not deadlock it; both are recorded", async () => {
    const id = await received();
    await verifyAll(id);
    expect(await send(id)).toMatchObject({ ok: true });
    const step = await pendingStep(id);

    let aHasLock!: () => void;
    const aLocked = new Promise<void>((r) => (aHasLock = r));
    let goA!: () => void;
    const aMayGo = new Promise<void>((r) => (goA = r));
    let bPid = 0;
    let bStarted!: () => void;
    const bIn = new Promise<void>((r) => (bStarted = r));

    const a = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PortalApplication" WHERE id = ${id} FOR UPDATE`;
      aHasLock();
      await aMayGo;
      const o = (await supplierOrg(org.id, tx))!;
      return verifyPortalCreditor({ tx, actor: staff(p.checker), org: o, now: new Date(), act: writer(p.checker) }, { portalApplicationId: id, state: "VERIFIED", verifiedOn: today, note: "", personId: p.checker });
    }, { timeout: 30_000, maxWait: 10_000 });
    await aLocked;
    const b = db.$transaction(async (tx) => {
      const [me] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      bPid = Number(me!.pid);
      bStarted();
      const o = (await supplierOrg(org.id, tx))!;
      return decidePortalRegistrationStep({ tx, actor: staff(p.approver), org: o, now: new Date(), act: writer(p.approver) }, { stepId: step.id, decision: "DONE", reason: "", personId: p.approver, decidedOn: dayToDate(today), onBehalf: false });
    }, { timeout: 30_000, maxWait: 10_000 });
    await bIn;
    // The decision is waiting on the application before the check goes on.
    let waiting = false;
    for (let n = 0; n < 400 && !waiting; n++) {
      const [row] = await db.$queryRaw<{ wait: string | null }[]>`SELECT wait_event_type AS wait FROM pg_stat_activity WHERE pid = ${bPid}::int`;
      waiting = row?.wait === "Lock";
      if (!waiting) await sleep(25);
    }
    expect(waiting).toBe(true);
    goA();
    const [ra, rb] = await Promise.allSettled([a, b]);
    if (ra.status === "rejected") console.error("check failed", ra.reason);
    if (rb.status === "rejected") console.error("decision failed", rb.reason);
    expect(ra).toMatchObject({ status: "fulfilled", value: { ok: true } });
    expect(rb).toMatchObject({ status: "fulfilled", value: { ok: true } });
    const pa = await stored(id);
    expect(pa.status).toBe("APPROVED");
    expect(pa.creditor!.verification).toBe("VERIFIED");
  });
});

describe("whoever checked what an online application holds decides no step of its route (RSEC-3(b))", () => {
  it("the officer who checked a certificate or the bank details is refused by name and reason, deciding or recording for someone; another holder decides", async () => {
    // A second holder of the office, so each refusal below is the check's bar alone.
    const checkerHolder = (await makePerson(org.id, `Decide checker-holder ${run}`)).id;
    await db.roleAssignment.create({ data: { personId: checkerHolder, roleCode: OFFICE, effectiveFrom: dayToDate("2020-01-01") } });
    const id = await received();
    await verifyAll(id, checkerHolder);
    expect(await send(id)).toMatchObject({ ok: true });
    const refused = await decide(id, checkerHolder);
    expect(refused.ok).toBe(false);
    expect(refused.errors?.personId).toContain(`Decide checker-holder ${run}`);
    expect(refused.errors?.personId).toMatch(/checked a certificate or the bank details of this application/);
    expect((await pendingStep(id)).decision).toBe("PENDING");

    // The bank details' checker, recording the approver's decision from paper: refused on the recorder's own account.
    const second = await received();
    await verifyAll(second);
    expect(await as(checkerHolder, (c) => verifyPortalCreditor(c, { portalApplicationId: second, state: "VERIFIED", verifiedOn: today, note: "", personId: checkerHolder }))).toMatchObject({ ok: true });
    expect(await send(second)).toMatchObject({ ok: true });
    const step = await pendingStep(second);
    const recorded = await db.$transaction(async (tx) => {
      const o = (await supplierOrg(org.id, tx))!;
      return decidePortalRegistrationStep({ tx, actor: staff(checkerHolder), org: o, now: new Date(), act: { ...writer(p.approver), recorderId: checkerHolder, intent: { mode: "RECORDED_ON_BEHALF" } as never } }, { stepId: step.id, decision: "DONE", reason: "", personId: p.approver, decidedOn: dayToDate(today), onBehalf: true });
    });
    expect(JSON.stringify(recorded)).toMatch(/You checked a certificate or the bank details of this application/);
    expect((await pendingStep(second)).decision).toBe("PENDING");
    // The approver, who checked nothing, decides it.
    expect(await decide(second)).toMatchObject({ ok: true });
  });
});
