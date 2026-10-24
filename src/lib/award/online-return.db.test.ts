import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { authenticateSupplier, confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { readSupplierSession } from "@/lib/auth/supplier-session-store";
import { hiddenExerciseIds } from "@/lib/auth/sulit-store";
import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { caseVisibility } from "@/lib/contract/case-visibility";
import { dayPlus, dayToDate, storedDay, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { documentOrg } from "@/lib/documents/service";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import { loadInboxPage } from "@/lib/inbox/store";
import { ProjectRefused } from "@/lib/portal/projects/types";
import { facts, makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";
import type { WrittenAttribution } from "@/lib/test-support/staff";

/**
 * The online award return and the contractor's questions against a real database (ADR 0045 D1, D3, D4; wave V plan V2). The contractor's acts run through the library as the
 * portal routes (V3) will call them, signed in and with the password asked again; the officer's through the server actions. Each act is one transaction: what a refusal leaves
 * behind is read back. A verify is held to: the received days are the day lodged, the award is accepted once, the same stored version is held by the return and the award,
 * and anything short of acceptance rolls it all back. WV-4 (paper and online apart, cancel refused while one waits), WV-7 (answer in any status) and WV-8 (who is told) are
 * proved here, with the triggers that back them (PA048, PA049, PA051).
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null, supplier: null as SupplierActor | null, written: [] as WrittenAttribution[] }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return { ...base, staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  const act = actModule();
  h.written = act.written;
  return act.module;
});
// The portal's guards (copy, Origin, token, session) are held by their own tests (handlers.test.ts); here the session's actor is stood in and everything behind the route is real, the password step-up included.
vi.mock("@/app/_auth/supplier", async () => {
  const { facts } = await import("@/lib/test-db/auth-fixtures");
  return {
    supplierPost: async (request: Request) => ({ ok: true as const, actor: h.supplier!, post: { fields: await request.json(), facts: facts(), token: null } }),
    supplierUploadPost: async () => ({ ok: true as const, actor: h.supplier!, facts: facts() }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { answerAwardQuery, cancelAward, recordReturn, refuseOnlineReturn, verifyOnlineReturn } from "@/app/awards/actions";
import { attachDocument } from "@/app/documents/actions";
import { POST as queryRoute } from "@/app/supplier/projects/award-query/route";
import { POST as submitRoute } from "@/app/supplier/projects/award-return/submit/route";
import { POST as uploadRoute } from "@/app/supplier/projects/award-return/upload/route";

import { askAwardQuery, AWARD_RETURN_EVENT_KEY, lodgeOnlineReturn } from "./online-return-store";
import { AwardReturnRefused } from "./online-return-words";
import { preflightReturnUpload, storeReturnFile } from "./return-upload";
import { indentExpiryRaised, indentState } from "./indent";
import { instrumentReturned } from "./stage-two";

const run = randomId();
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: string) => dayToDate(d);
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

let organisationId = "";
let orgCode = "";
let today = "";
let returnClassId = "";
let internalClassId = "";
const unitCode = `WV2_U_${run}`;
const OFFICE = `WV2_OFF_${run}`;
/// `officer` is named on every exercise (so the identity card number is open to it); `outsider` on none; `holder` holds the office the rules name; `pic` is the person in charge.
const p = { officer: "", outsider: "", holder: "", pic: "" };
let before: { awardReturnClassId: string | null; allowedMediaTypes: string[]; maxBytes: bigint | null } | null = null;
let signingBefore: boolean | null | undefined;

const staff = (personId: string): StaffActor =>
  ({ kind: "STAFF", accountId: `acc_${personId}`, sessionId: `ses_${personId}`, personId, personName: "Officer", jobTitle: null, isAdministrator: false, organisationId, organisationCode: orgCode, organisationTimeZone: "Asia/Kuala_Lumpur", offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: "203.0.113.8", mustChangePassword: false }) as unknown as StaffActor;
async function as<T>(personId: string, fn: () => Promise<T>): Promise<T> {
  h.who = staff(personId);
  return fn();
}

interface Holder {
  actor: SupplierActor;
  supplierId: string;
  accountId: string;
  password: string;
}
/// A supplier's signed-in account, its contact marked as one who signs for the company.
async function contractor(o: { supplierId?: string; signs?: boolean } = {}): Promise<Holder> {
  const s = await makeSupplierAccount(organisationId, o.supplierId ? { supplierId: o.supplierId } : {});
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D("2025-01-01") } });
  await db.supplierContact.update({ where: { id: s.contact.id }, data: { authorisedToSignForContractor: o.signs ?? true } });
  const signedIn = await authenticateSupplier({ loginName: s.loginName, password: s.password }, facts(), null);
  if (!signedIn.ok) throw new Error("sign-in failed");
  const read = await readSupplierSession(signedIn.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session failed");
  return { actor: read.actor, supplierId: s.supplier.id, accountId: s.account!.id, password: s.password };
}
const stepUp = async (c: Holder) => {
  const asked = await confirmSupplierPassword(c.actor, c.password, facts());
  if (!asked.ok) throw new Error(`step-up failed: ${asked.kind}`);
  return asked.at;
};

interface Case {
  awardId: string;
  contractId: string;
  exerciseId: string;
  returnId: string;
}
/// An issued award to the supplier, ten days ago, with its (empty) return and its contract, on an exercise the officer is named on.
async function issued(vendorId: string, o: { kind?: "LETTER_OF_ACCEPTANCE" | "WORK_INDENT"; restricted?: boolean; pic?: string | null } = {}): Promise<Case> {
  const r = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `WV2/RQ/${r}`, requestingUnitCode: unitCode, requestingPersonId: p.officer, title: "Online return requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "WV2_CC", accountCode: "WV2_AC", placeOfDelivery: "Nowhere", dateRequired: at(100), estimatedValue: "100000.00", raisedOn: at(-30) },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `WV2/EX/${r}`, requisitionId: requisition.id, title: `Road works ${r}`, estimatedValue: "100000.00", sourcingMethodCode: "WV2_METHOD", status: "EVALUATED", restricted: o.restricted ?? false, personInChargeId: o.pic === undefined ? p.pic : o.pic } });
  await db.exerciseParticipant.create({ data: { exerciseId: exercise.id, personId: p.officer } });
  const award = await db.award.create({ data: { organisationId, reference: `WV2/AW/${r}`, exerciseId: exercise.id, instrumentKind: o.kind ?? "LETTER_OF_ACCEPTANCE", awardeeName: "Syarikat Maju", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", issuedAt: D(dayPlus(today, -10)), vendorId } });
  const ret = await db.awardReturn.create({ data: { awardId: award.id } });
  const c = await db.contract.create({ data: { organisationId, number: `WV2/CON/${r}`, numberSource: "SERIES", numberedOn: D(dayPlus(today, -10)), awardId: award.id, contractSum: "100000.00", status: "NUMBER_ALLOCATED" } });
  return { awardId: award.id, contractId: c.id, exerciseId: exercise.id, returnId: ret.id };
}

let counter = 0;
/// One scan staged for an award return by the contractor's account, through the store, as the upload route will stage it.
async function stage(c: Holder): Promise<string> {
  const s = blobStore();
  if ("fault" in s) throw new Error("no store");
  const bytes = new TextEncoder().encode(`%PDF-1.4 return ${run} ${++counter}`);
  const out = await storeReturnFile(c.actor, { org: (await documentOrg(organisationId))!, store: s.store, classId: returnClassId, bytes, sha256: sha256Hex(bytes), mediaType: "application/pdf", originalFilename: `scan-${counter}.pdf` });
  return out.versionId;
}
const PAGE = { signatoryName: "Ahmad bin Ali", icNumber: "800101-01-1234", occupation: "Director", address: "1 Jalan Satu", capacity: "Director", witnessName: "Siti binti Omar", contractorSigned: true, stampAffixed: true, witnessSigned: true };

/// The contractor lodges the instrument's scans (and an indent's page), with the password asked again.
async function lodge(c: Holder, k: Case, o: { kind?: "LETTER_OF_ACCEPTANCE" | "WORK_INDENT"; now?: Date; files?: Record<string, string> } = {}) {
  const files = o.files ?? (o.kind === "WORK_INDENT" ? { ACCEPTANCE_PAGE: await stage(c) } : { SIGNED_LETTER: await stage(c), DECLARATION: await stage(c), AUTHORISATION: await stage(c) });
  return lodgeOnlineReturn(c.actor, { contractId: k.contractId, files, page: o.kind === "WORK_INDENT" ? PAGE : null, stepUpAt: await stepUp(c) }, o.now);
}

/// The SQLSTATE a write is refused with, or null where it goes through (as `online-return-schema.db.test.ts` reads it): PA048 to PA051 are the wave's own triggers.
async function sqlState(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } } }).meta?.driverAdapterError?.cause;
    return cause?.originalCode ?? cause?.code ?? `not a database refusal: ${String(error).slice(0, 200)}`;
  }
}

const refusedWith = async (work: Promise<unknown>, code: string, status?: number) => {
  const e = await work.then(() => null, (x) => x);
  expect(e, `expected a refusal with ${code}`).toBeInstanceOf(AwardReturnRefused);
  expect((e as AwardReturnRefused).faults.map((f) => f.code), code).toContain(code);
  if (status) expect((e as AwardReturnRefused).status).toBe(status);
};

const rule = (eventKey: string, offices: string[] = [OFFICE]) =>
  db.notificationRule.upsert({ where: { organisationId_eventKey: { organisationId, eventKey } }, update: { isActive: true, recipientRoleCodes: offices }, create: { organisationId, eventKey, nameEn: `Rule ${eventKey}`, recipientRoleCodes: offices, reminderOffsetDays: [], isActive: true } });
const noRule = (eventKey: string) => db.notificationRule.deleteMany({ where: { organisationId, eventKey } });
const told = (subjectId: string) => db.staffNotice.findMany({ where: { organisationId, subjectId }, select: { recipientPersonId: true, kind: true, exerciseId: true, href: true } }).then((r) => r.sort((a, b) => a.recipientPersonId.localeCompare(b.recipientPersonId)));

beforeAll(async () => {
  vi.stubEnv("DOCUMENT_STORE_DRIVER", "postgres");
  vi.stubEnv("DOCUMENT_MAX_BYTES", "52428800");
  const org = await testOrganisation();
  organisationId = org.id;
  orgCode = org.code;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  await db.organisation.update({ where: { id: organisationId }, data: { timeZone: "Asia/Kuala_Lumpur" } });
  today = todayIn(new Date(), "Asia/Kuala_Lumpur")!;
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `WV2 ${k} ${run}`)).id;
  await db.orgUnit.create({ data: { organisationId, code: unitCode, nameEn: "Requesting unit", kind: "DEPARTMENT", effectiveFrom: D("2020-01-01") } });
  await db.authorityRole.create({ data: { organisationId, code: OFFICE, nameEn: `Contracts office ${run}`, nameMs: `Pejabat ${run}` } });
  await db.roleAssignment.create({ data: { personId: p.holder, roleCode: OFFICE, scope: unitCode, effectiveFrom: D("2020-01-01") } });
  signingBefore = (await db.postAwardPolicy.findUnique({ where: { organisationId }, select: { contractorPortalSigning: true } }))?.contractorPortalSigning;
  await db.postAwardPolicy.upsert({ where: { organisationId }, update: { contractorPortalSigning: true, contractorPortalSigningProvenance: "ASSUMED" }, create: { organisationId, contractorPortalSigning: true, contractorPortalSigningProvenance: "ASSUMED" } });
  returnClassId = (await db.documentClass.create({ data: { organisationId, code: `wv2_return_${run}`, nameEn: "Returned award documents", classification: "SULIT" } })).id;
  internalClassId = (await db.documentClass.create({ data: { organisationId, code: `wv2_internal_${run}`, nameEn: "Internal", classification: "INTERNAL" } })).id;
  before = await db.documentStorePolicy.findUnique({ where: { organisationId }, select: { awardReturnClassId: true, allowedMediaTypes: true, maxBytes: true } });
  await db.documentStorePolicy.upsert({ where: { organisationId }, update: { awardReturnClassId: returnClassId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000) }, create: { organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), awardReturnClassId: returnClassId } });
});

afterAll(async () => {
  await db.documentStorePolicy.update({ where: { organisationId }, data: before ? { awardReturnClassId: before.awardReturnClassId, allowedMediaTypes: before.allowedMediaTypes, maxBytes: before.maxBytes } : { awardReturnClassId: null } });
  await db.postAwardPolicy.update({ where: { organisationId }, data: { contractorPortalSigning: signingBefore ?? null, contractorPortalSigningProvenance: signingBefore == null ? null : "ASSUMED" } });
  for (const k of Object.values(AWARD_RETURN_EVENT_KEY)) await noRule(k);
});

describe("lodging a return online (ADR 0045 D1)", () => {
  it("pins the scans to the return, leaves the award issued and not returned, signs it, and tells the rule's offices and the person in charge", async () => {
    await rule(AWARD_RETURN_EVENT_KEY.AWARD_RETURN_LODGED);
    const c = await contractor();
    const k = await issued(c.supplierId);
    const { onlineReturnId } = await lodge(c, k);
    const award = await db.award.findUniqueOrThrow({ where: { id: k.awardId }, include: { awardReturn: true } });
    expect(award.status).toBe("ISSUED");
    expect(instrumentReturned("LETTER_OF_ACCEPTANCE", award.awardReturn)).toBe(false);
    const row = await db.awardOnlineReturn.findUniqueOrThrow({ where: { id: onlineReturnId }, include: { files: { include: { version: { include: { document: true } } } } } });
    expect(storedDay(row.submittedOn)).toBe(today);
    expect(row.files.map((f) => f.purpose).sort()).toEqual(["AUTHORISATION", "DECLARATION", "SIGNED_LETTER"]);
    expect(row.files.every((f) => f.version.document.status === "FILED" && f.version.document.classificationSnapshot === "SULIT")).toBe(true);
    expect(await db.documentAttachment.count({ where: { awardId: k.awardId } })).toBe(0);
    // A signed act: the attribution names the return, with the moment the password was asked again.
    const signed = await db.actAttribution.findFirstOrThrow({ where: { entity: "AwardOnlineReturn", entityId: onlineReturnId } });
    expect(signed).toMatchObject({ slot: "submittedBySupplierAccount", mode: "SIGNED", subjectSupplierAccountId: c.accountId });
    expect(signed.stepUpAt).toEqual(row.stepUpAt);
    expect(await told(onlineReturnId)).toEqual(
      [p.holder, p.pic].sort().map((recipientPersonId) => ({ recipientPersonId, kind: "AWARD_RETURN_LODGED", exerciseId: k.exerciseId, href: `/projects/${k.contractId}?stage=award&tab=return` })),
    );
  });

  it("enters an indent's identity card number in the trail masked", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId, { kind: "WORK_INDENT" });
    const { onlineReturnId } = await lodge(c, k, { kind: "WORK_INDENT" });
    const audit = await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "AwardOnlineReturn", entityId: onlineReturnId, action: "CREATE" } });
    expect(JSON.stringify(audit)).not.toContain("800101-01-1234");
    expect(JSON.stringify(audit)).toContain("1234");
  });

  it("refuses a second lodge while one waits (409), and a lodge once paper has started", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    await lodge(c, k);
    await refusedWith(lodge(c, k), "ALREADY_WAITING", 409);
    const paper = await issued(c.supplierId);
    await db.awardReturn.update({ where: { id: paper.returnId }, data: { declarationReceivedOn: D(today) } });
    await refusedWith(lodge(c, paper), "PAPER_STARTED", 422);
    expect(await db.awardOnlineReturn.count({ where: { awardId: paper.awardId } })).toBe(0);
  });

  it("is refused to an account that may not sign for the company (403), and to another contractor as not found (404)", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const colleague = await contractor({ supplierId: c.supplierId, signs: false });
    await refusedWith(lodge(colleague, k), "NOT_SIGNING_AUTHORITY", 403);
    const other = await contractor();
    const e = await lodge(other, k).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(ProjectRefused);
    expect((e as ProjectRefused).status).toBe(404);
    expect(await db.awardOnlineReturn.count({ where: { awardId: k.awardId } })).toBe(0);
  });

  it("refuses a file staged by another account, staged for something else, or of another class, naming the scan", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const colleague = await contractor({ supplierId: c.supplierId });
    const theirs = await stage(colleague);
    await refusedWith(lodge(c, k, { files: { SIGNED_LETTER: theirs, DECLARATION: await stage(c), AUTHORISATION: await stage(c) } }), "NOT_YOURS");
    const mine = await stage(c);
    await db.document.update({ where: { id: (await db.documentVersion.findUniqueOrThrow({ where: { id: mine } })).documentId }, data: { stagedFor: "project-document" } });
    await refusedWith(lodge(c, k, { files: { SIGNED_LETTER: mine, DECLARATION: await stage(c), AUTHORISATION: await stage(c) } }), "NOT_STAGED_FOR_RETURN");
    const inner = await stage(c);
    await db.document.update({ where: { id: (await db.documentVersion.findUniqueOrThrow({ where: { id: inner } })).documentId }, data: { documentClassId: internalClassId } });
    await refusedWith(lodge(c, k, { files: { SIGNED_LETTER: inner, DECLARATION: await stage(c), AUTHORISATION: await stage(c) } }), "WRONG_CLASS");
    expect(await db.awardOnlineReturn.count({ where: { awardId: k.awardId } })).toBe(0);
  });

  it("the upload's preflight refuses before a byte is read: another's contract, a scan the instrument does not take, a return already waiting", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const ok = await preflightReturnUpload(c.actor, k.contractId, "SIGNED_LETTER", { declaredBytes: 10n });
    expect(ok.ok).toBe(true);
    const status = async (actor: SupplierActor, scan: string) => {
      const r = await preflightReturnUpload(actor, k.contractId, scan, { declaredBytes: 10n });
      return r.ok ? 200 : r.outcome.status;
    };
    expect(await status(c.actor, "ACCEPTANCE_PAGE")).toBe(400);
    expect(await status((await contractor()).actor, "SIGNED_LETTER")).toBe(404);
    expect(await status((await contractor({ supplierId: c.supplierId, signs: false })).actor, "SIGNED_LETTER")).toBe(403);
    await lodge(c, k);
    expect(await status(c.actor, "SIGNED_LETTER")).toBe(409);
  });
});

describe("verifying a lodged return (ADR 0045 D1)", () => {
  it("Worked example: lodged two days ago, verified today, the award is accepted with every item received on the day it was lodged", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const { onlineReturnId } = await lodge(c, k, { now: at(-2) });
    const lodgedOn = storedDay((await db.awardOnlineReturn.findUniqueOrThrow({ where: { id: onlineReturnId } })).submittedOn);
    expect(lodgedOn).toBe(dayPlus(today, -2));
    h.written.length = 0;
    const r = await as(p.officer, () => verifyOnlineReturn({ ok: false }, form({ id: onlineReturnId })));
    expect(r).toMatchObject({ ok: true });
    const award = await db.award.findUniqueOrThrow({ where: { id: k.awardId }, include: { awardReturn: true } });
    expect(award.status).toBe("ACCEPTED");
    const ret = award.awardReturn!;
    expect([ret.signedLetterReceivedOn, ret.declarationReceivedOn, ret.authorisationReceivedOn].map((d) => storedDay(d!))).toEqual([lodgedOn, lodgedOn, lodgedOn]);
    expect(ret.whereHeld).toBe("Lodged online");
    expect(ret.receivedByPersonId).toBe(p.officer);
    const row = await db.awardOnlineReturn.findUniqueOrThrow({ where: { id: onlineReturnId }, include: { files: true } });
    expect(row.verifiedByPersonId).toBe(p.officer);
    // The scan snapshot holds the pins the award was accepted on: the very versions the contractor sent, now held by both the return and the award.
    const pins = (award.returnScanSnapshot as { pins: { versionId: string }[] }).pins.map((x) => x.versionId).sort();
    expect(pins).toEqual(row.files.map((f) => f.versionId).sort());
    for (const f of row.files) expect(await db.documentAttachment.count({ where: { versionId: f.versionId, detachedAt: null } })).toBe(2);
    // One attribution, two slots: the row's verifier and the return's receiver, the same person.
    expect(h.written.map((w) => `${w.entity}.${w.slot}:${w.subjectPersonId}`).sort()).toEqual([`AwardOnlineReturn.verifiedBy:${p.officer}`, `AwardReturn.receivedBy:${p.officer}`]);
    // Accepted once.
    const accepted = (await db.auditEntry.findMany({ where: { organisationId, entity: "Award", entityId: k.awardId } })).filter((e) => JSON.stringify(e.changes).includes("ACCEPTED"));
    expect(accepted).toHaveLength(1);
    // A decided return is decided once (PA048), and its files are frozen (PA051).
    expect(await sqlState(db.awardOnlineReturn.update({ where: { id: onlineReturnId }, data: { verifiedByPersonId: p.outsider, verifiedAt: new Date() } }))).toBe("PA048");
    expect(await sqlState(db.documentAttachment.updateMany({ where: { awardOnlineReturnId: onlineReturnId }, data: { detachedAt: new Date(), detachReason: "x" } }))).toBe("PA051");
  });

  it("verifies an indent: the page's fields are written as lodged, and the award is accepted", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId, { kind: "WORK_INDENT" });
    const { onlineReturnId } = await lodge(c, k, { kind: "WORK_INDENT" });
    expect(await as(p.officer, () => verifyOnlineReturn({ ok: false }, form({ id: onlineReturnId })))).toMatchObject({ ok: true });
    const award = await db.award.findUniqueOrThrow({ where: { id: k.awardId }, include: { awardReturn: true } });
    expect(award.status).toBe("ACCEPTED");
    expect(award.awardReturn).toMatchObject({ signatoryName: PAGE.signatoryName, icNumber: PAGE.icNumber, capacity: PAGE.capacity, contractorSigned: true, stampAffixed: true, witnessSigned: true });
    expect(storedDay(award.awardReturn!.signedLetterReceivedOn!)).toBe(today);
  });

  it("rolls everything back where a pinned scan was withdrawn meanwhile: the return still waits, nothing is on the award", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const { onlineReturnId } = await lodge(c, k);
    const pin = await db.documentAttachment.findFirstOrThrow({ where: { awardOnlineReturnId: onlineReturnId, purpose: "DECLARATION" } });
    await db.documentVersion.update({ where: { id: pin.versionId }, data: { withdrawnAt: new Date(), withdrawnReason: "Uploaded to the wrong record" } });
    const r = await as(p.officer, () => verifyOnlineReturn({ ok: false }, form({ id: onlineReturnId })));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Not verified/);
    const row = await db.awardOnlineReturn.findUniqueOrThrow({ where: { id: onlineReturnId } });
    expect(row.verifiedAt).toBeNull();
    const award = await db.award.findUniqueOrThrow({ where: { id: k.awardId }, include: { awardReturn: true } });
    expect(award.status).toBe("ISSUED");
    expect(award.awardReturn!.signedLetterReceivedOn).toBeNull();
    expect(await db.documentAttachment.count({ where: { awardId: k.awardId } })).toBe(0);
  });

  it("is refused to an officer the identity card number is closed to, and the refusal is logged", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId, { restricted: true });
    const { onlineReturnId } = await lodge(c, k);
    // Not named on a restricted exercise: the award reads as gone, and the attempt is logged.
    const r = await as(p.outsider, () => verifyOnlineReturn({ ok: false }, form({ id: onlineReturnId })));
    expect(r.ok).toBe(false);
    expect(await db.sulitAccessEvent.count({ where: { organisationId, actorPersonId: p.outsider, entityId: k.exerciseId } })).toBeGreaterThan(0);
    const open = await issued(c.supplierId);
    const lodged = await lodge(c, open);
    const r2 = await as(p.outsider, () => verifyOnlineReturn({ ok: false }, form({ id: lodged.onlineReturnId })));
    expect(r2.ok).toBe(false);
    expect(r2.message).toMatch(/SULIT/);
    expect(await db.sulitAccessEvent.count({ where: { organisationId, actorPersonId: p.outsider, entityId: open.exerciseId, outcome: "WITHHELD" } })).toBe(1);
    expect((await db.awardOnlineReturn.findUniqueOrThrow({ where: { id: lodged.onlineReturnId } })).verifiedAt).toBeNull();
    expect((await db.award.findUniqueOrThrow({ where: { id: open.awardId } })).status).toBe("ISSUED");
  });

  it("another organisation's officer reads it as not on record", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const { onlineReturnId } = await lodge(c, k);
    const elsewhere = (await db.organisation.create({ data: { code: `WV2_OTHER_${randomId()}`, name: "Another organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
    const foreign = (await makePerson(elsewhere)).id;
    h.who = { ...staff(foreign), organisationId: elsewhere } as StaffActor;
    expect(await verifyOnlineReturn({ ok: false }, form({ id: onlineReturnId }))).toEqual({ ok: false, message: "That return is not on record." });
    expect(await refuseOnlineReturn({ ok: false }, form({ id: onlineReturnId, reason: "No" }))).toEqual({ ok: false, message: "That return is not on record." });
    const { queryId } = await askAwardQuery(c.actor, { contractId: k.contractId, body: "Is the bond due on signing?" });
    expect(await answerAwardQuery({ ok: false }, form({ id: queryId, answer: "Yes." }))).toEqual({ ok: false, message: "That question is not on record." });
    expect(await db.awardOnlineReturn.findUniqueOrThrow({ where: { id: onlineReturnId } })).toMatchObject({ verifiedAt: null, refusedAt: null });
    expect((await db.awardQuery.findUniqueOrThrow({ where: { id: queryId } })).answeredAt).toBeNull();
  });
});

describe("refusing a lodged return", () => {
  it("leaves the award issued with nothing attached, keeps the row's files, and lets the contractor send again", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const { onlineReturnId } = await lodge(c, k);
    expect(await as(p.officer, () => refuseOnlineReturn({ ok: false }, form({ id: onlineReturnId, reason: " " })))).toMatchObject({ ok: false, errors: { reason: expect.stringMatching(/Say why/) } });
    expect(await as(p.officer, () => refuseOnlineReturn({ ok: false }, form({ id: onlineReturnId, reason: "The declaration is not signed." })))).toEqual({ ok: true });
    const row = await db.awardOnlineReturn.findUniqueOrThrow({ where: { id: onlineReturnId }, include: { files: true } });
    expect(row).toMatchObject({ refusedByPersonId: p.officer, refusedReason: "The declaration is not signed." });
    expect(row.files).toHaveLength(3);
    expect((await db.award.findUniqueOrThrow({ where: { id: k.awardId } })).status).toBe("ISSUED");
    expect(await db.documentAttachment.count({ where: { awardId: k.awardId } })).toBe(0);
    expect(await as(p.officer, () => refuseOnlineReturn({ ok: false }, form({ id: onlineReturnId, reason: "Again" })))).toMatchObject({ ok: false, message: expect.stringMatching(/already been decided/) });
    // A new return may follow, with new files.
    const again = await lodge(c, k);
    expect(again.onlineReturnId).not.toBe(onlineReturnId);
  });
});

describe("paper and online are not mixed (WV-4)", () => {
  it("refuses recording the return on paper, a staff attach of a return scan and cancelling while one waits; once refused, both reopen", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const { onlineReturnId } = await lodge(c, k);
    const paper = await as(p.officer, () => recordReturn({ ok: false }, form({ id: k.awardId, signedLetterReceivedOn: today })));
    expect(paper).toMatchObject({ ok: false, message: expect.stringMatching(/sent the return online/) });
    // A staff scan of a return purpose: refused through the award's owner facts.
    const doc = await db.document.create({ data: { organisationId, title: "Signed letter scan", documentClassId: internalClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, status: "STAGED" } });
    const bytes = new TextEncoder().encode(`%PDF-1.4 staff ${run} ${++counter}`);
    await db.blobContent.createMany({ data: [{ organisationId, sha256: sha256Hex(bytes), byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    const v = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha256Hex(bytes), byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: "letter.pdf", recordedByPersonId: p.officer, storedAt: new Date() } });
    const attach = () => as(p.officer, () => attachDocument({ ok: false }, form({ ownerKind: "award", ownerId: k.awardId, purpose: "SIGNED_LETTER", versionId: v.id })));
    expect(await attach()).toMatchObject({ ok: false, message: expect.stringMatching(/sent the return online/) });
    const cancel = await as(p.officer, () => cancelAward({ ok: false }, form({ id: k.awardId, reason: "Withdrawn by the department" })));
    expect(cancel).toMatchObject({ ok: false, message: expect.stringMatching(/sent the signed return online on .* not cancelled while its return waits/) });
    expect((await db.award.findUniqueOrThrow({ where: { id: k.awardId } })).status).toBe("ISSUED");
    await as(p.officer, () => refuseOnlineReturn({ ok: false }, form({ id: onlineReturnId, reason: "Unreadable scans." })));
    expect(await attach()).toMatchObject({ ok: true });
    expect(await db.documentAttachment.count({ where: { awardId: k.awardId, purpose: "SIGNED_LETTER", detachedAt: null } })).toBe(1);
    expect(await as(p.officer, () => cancelAward({ ok: false }, form({ id: k.awardId, reason: "Withdrawn by the department" })))).toMatchObject({ ok: true });
    expect((await db.award.findUniqueOrThrow({ where: { id: k.awardId } })).status).toBe("CANCELLED");
  });
});

describe("questions on an award (ADR 0045 D3, WV-7)", () => {
  it("are asked while issued, move no date, tell the offices and the person in charge, and are answered once, after acceptance too", async () => {
    await rule(AWARD_RETURN_EVENT_KEY.AWARD_QUERY_RAISED);
    const c = await contractor();
    const k = await issued(c.supplierId, { kind: "WORK_INDENT" });
    const beforeAsk = await db.award.findUniqueOrThrow({ where: { id: k.awardId }, include: { awardReturn: true } });
    const { queryId } = await askAwardQuery(c.actor, { contractId: k.contractId, body: "  When is the site handed over?  " });
    const afterAsk = await db.award.findUniqueOrThrow({ where: { id: k.awardId }, include: { awardReturn: true } });
    expect(afterAsk).toEqual(beforeAsk);
    expect((await db.awardQuery.findUniqueOrThrow({ where: { id: queryId } })).body).toBe("When is the site handed over?");
    expect((await told(queryId)).map((n) => [n.recipientPersonId, n.kind])).toEqual([p.holder, p.pic].sort().map((r) => [r, "AWARD_QUERY_RAISED"]));
    await refusedWith(askAwardQuery(c.actor, { contractId: k.contractId, body: "x".repeat(2001) }), "BODY_TOO_LONG");
    await expect(askAwardQuery((await contractor()).actor, { contractId: k.contractId, body: "Mine?" })).rejects.toBeInstanceOf(ProjectRefused);
    // Accepted meanwhile: no more questions, but the one asked is still answered.
    await db.award.update({ where: { id: k.awardId }, data: { status: "ACCEPTED" } });
    await refusedWith(askAwardQuery(c.actor, { contractId: k.contractId, body: "One more?" }), "NOT_ISSUED");
    expect(await as(p.officer, () => answerAwardQuery({ ok: false }, form({ id: queryId, answer: "" })))).toMatchObject({ ok: false, errors: { answer: expect.any(String) } });
    expect(await as(p.officer, () => answerAwardQuery({ ok: false }, form({ id: queryId, answer: "On 1 November." })))).toEqual({ ok: true });
    expect(await db.awardQuery.findUniqueOrThrow({ where: { id: queryId } })).toMatchObject({ answer: "On 1 November.", answeredByPersonId: p.officer });
    expect(await as(p.officer, () => answerAwardQuery({ ok: false }, form({ id: queryId, answer: "Again." })))).toMatchObject({ ok: false, message: expect.stringMatching(/already been answered/) });
    // The answer is set once by the database too (PA049).
    expect(await sqlState(db.awardQuery.update({ where: { id: queryId }, data: { answer: "Changed" } }))).toBe("PA049");
  });
});

describe("who is told (WV-8)", () => {
  it("with no rule the person in charge alone is told; with no rule and no person in charge nobody is", async () => {
    await noRule(AWARD_RETURN_EVENT_KEY.AWARD_RETURN_LODGED);
    const c = await contractor();
    const k = await issued(c.supplierId);
    const one = await lodge(c, k);
    expect((await told(one.onlineReturnId)).map((n) => n.recipientPersonId)).toEqual([p.pic]);
    const nobody = await issued(c.supplierId, { pic: null });
    const two = await lodge(c, nobody);
    expect(await told(two.onlineReturnId)).toEqual([]);
  });

  it("an inactive person in charge is not told", async () => {
    await noRule(AWARD_RETURN_EVENT_KEY.AWARD_RETURN_LODGED);
    const gone = (await makePerson(organisationId, `WV2 gone ${run}`)).id;
    await db.person.update({ where: { id: gone }, data: { isActive: false } });
    const c = await contractor();
    const k = await issued(c.supplierId, { pic: gone });
    const { onlineReturnId } = await lodge(c, k);
    expect(await told(onlineReturnId)).toEqual([]);
  });

  it("the person in charge of a restricted exercise reads the whole case, its Award stage included, and sees the notice; an office holder not named on it does not", async () => {
    await rule(AWARD_RETURN_EVENT_KEY.AWARD_RETURN_LODGED);
    const c = await contractor();
    const k = await issued(c.supplierId, { restricted: true });
    const { onlineReturnId } = await lodge(c, k);
    const reader = (personId: string) => ({ organisationId, organisationCode: orgCode, personId, isAdministrator: false, sessionId: `s_${personId}`, sourceAddress: "203.0.113.8" });
    const picHidden = await hiddenExerciseIds(db, reader(p.pic));
    expect(picHidden).not.toContain(k.exerciseId);
    expect(caseVisibility({ restricted: picHidden.includes(k.exerciseId), actorNamed: false, system: false, issued: true })).toBe("WHOLE");
    const inbox = async (personId: string) => (await loadInboxPage(db, { organisationId, personId }, await hiddenExerciseIds(db, reader(personId)))).notices.filter((n) => n.kind === "AWARD_RETURN_LODGED" && n.href === `/projects/${k.contractId}?stage=award&tab=return`);
    expect(await inbox(p.pic)).toHaveLength(1);
    // The office holder is written the notice, but a restricted exercise's notice is hidden from someone not named on it (FR-MTD-007).
    expect((await told(onlineReturnId)).map((n) => n.recipientPersonId)).toContain(p.holder);
    expect(await inbox(p.holder)).toHaveLength(0);
  });
});

describe("the paper path and the staff attach, moved into their cores, behave as before (wave V plan V2)", () => {
  /// A scan an officer uploaded, staged in the internal class.
  async function staffScan(personId: string, title: string): Promise<string> {
    const doc = await db.document.create({ data: { organisationId, title, documentClassId: internalClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, status: "STAGED" } });
    const bytes = new TextEncoder().encode(`%PDF-1.4 paper ${run} ${++counter}`);
    await db.blobContent.createMany({ data: [{ organisationId, sha256: sha256Hex(bytes), byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    return (await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha256Hex(bytes), byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: `${title}.pdf`, recordedByPersonId: personId, storedAt: new Date() } })).id;
  }

  it("records a paper return, attaches each scan (filed, audited), refuses a second of the same, detaches with a reason, and the last scan accepts the award", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const tooLate = await as(p.officer, () => recordReturn({ ok: false }, form({ id: k.awardId, signedLetterReceivedOn: dayPlus(today, 1) })));
    expect(tooLate).toMatchObject({ ok: false, errors: { signedLetterReceivedOn: "Not after today." } });
    const tooEarly = await as(p.officer, () => recordReturn({ ok: false }, form({ id: k.awardId, signedLetterReceivedOn: dayPlus(today, -11) })));
    expect(tooEarly).toMatchObject({ ok: false, errors: { signedLetterReceivedOn: "Not before the instrument was issued." } });
    expect(await as(p.officer, () => recordReturn({ ok: false }, form({ id: k.awardId, signedLetterReceivedOn: today, declarationReceivedOn: today, authorisationReceivedOn: today, whereHeld: "Strongroom" })))).toMatchObject({ ok: true });
    const ret = await db.awardReturn.findUniqueOrThrow({ where: { id: k.returnId } });
    expect(ret).toMatchObject({ whereHeld: "Strongroom", receivedByPersonId: p.officer });
    expect(await db.auditEntry.count({ where: { organisationId, entity: "AwardReturn", entityId: k.returnId } })).toBe(1);
    // Paper has started, so the contractor's lodge is refused.
    await refusedWith(lodge(c, k), "PAPER_STARTED");
    const attach = (purpose: string, versionId: string) => as(p.officer, () => attachDocument({ ok: false }, form({ ownerKind: "award", ownerId: k.awardId, purpose, versionId })));
    const letter = await staffScan(p.officer, "Signed letter");
    expect(await attach("SIGNED_LETTER", letter)).toMatchObject({ ok: true });
    expect(await attach("SIGNED_LETTER", letter)).toMatchObject({ ok: false, message: expect.stringMatching(/already attached/i) });
    const letterDoc = (await db.documentVersion.findUniqueOrThrow({ where: { id: letter }, include: { document: true } })).document;
    expect(letterDoc.status).toBe("FILED");
    expect(await db.auditEntry.count({ where: { organisationId, entity: "DocumentAttachment", entityLabel: { startsWith: (await db.award.findUniqueOrThrow({ where: { id: k.awardId } })).reference } } })).toBe(1);
    const pin = await db.documentAttachment.findFirstOrThrow({ where: { awardId: k.awardId, versionId: letter } });
    const { detachDocument } = await import("@/app/documents/actions");
    expect(await as(p.officer, () => detachDocument({ ok: false }, form({ attachmentId: pin.id, reason: "Wrong page scanned" })))).toMatchObject({ ok: true });
    expect(await attach("SIGNED_LETTER", await staffScan(p.officer, "Signed letter, again"))).toMatchObject({ ok: true });
    expect(await attach("DECLARATION", await staffScan(p.officer, "Declaration"))).toMatchObject({ ok: true });
    expect((await db.award.findUniqueOrThrow({ where: { id: k.awardId } })).status).toBe("ISSUED");
    const last = await attach("AUTHORISATION", await staffScan(p.officer, "Authorisation"));
    expect(last).toMatchObject({ ok: true, message: expect.stringMatching(/accepted/) });
    expect((await db.award.findUniqueOrThrow({ where: { id: k.awardId } })).status).toBe("ACCEPTED");
  });

  it("refuses a SULIT file another officer staged, as a document that is not there", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const v = await staffScan(p.outsider, "Someone else's scan");
    await db.document.update({ where: { id: (await db.documentVersion.findUniqueOrThrow({ where: { id: v } })).documentId }, data: { documentClassId: returnClassId, classificationSnapshot: "SULIT" } });
    const r = await as(p.officer, () => attachDocument({ ok: false }, form({ ownerKind: "award", ownerId: k.awardId, purpose: "SIGNED_LETTER", versionId: v })));
    expect(r.ok).toBe(false);
    expect(await db.documentAttachment.count({ where: { awardId: k.awardId } })).toBe(0);
  });
});

// ------------------------------------------------------------------------------------------------------------- through the portal routes (wave V, V10)

const jsonPost = (url: string, fields: Record<string, unknown>) => new Request(`http://portal.example${url}`, { method: "POST", body: JSON.stringify(fields), headers: { "content-type": "application/json" } });
/// One scan staged through the upload route, as the drawer posts it.
async function viaUpload(c: Holder, k: Case, scan: string) {
  h.supplier = c.actor;
  const fd = new FormData();
  fd.set("file", new File([`%PDF-1.4 route ${run} ${++counter}`], `${scan}-${counter}.pdf`, { type: "application/pdf" }));
  const packed = new Response(fd);
  const body = new Uint8Array(await packed.arrayBuffer());
  const res = await uploadRoute(new Request(`http://portal.example/supplier/projects/award-return/upload?contractId=${k.contractId}&scan=${scan}`, { method: "POST", body, headers: { "content-type": packed.headers.get("content-type")!, "content-length": String(body.length) } }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const LETTER_SCANS = ["SIGNED_LETTER", "DECLARATION", "AUTHORISATION"];
async function stageViaRoute(c: Holder, k: Case, scans = LETTER_SCANS) {
  const files: Record<string, string> = {};
  for (const scan of scans) {
    const r = await viaUpload(c, k, scan);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    files[scan] = r.body.versionId as string;
  }
  return files;
}
async function viaSubmit(c: Holder, k: Case, files: Record<string, string>, o: { page?: typeof PAGE | null; password?: string } = {}) {
  h.supplier = c.actor;
  const res = await submitRoute(jsonPost("/supplier/projects/award-return/submit", { contractId: k.contractId, files, ...(o.page ? { page: o.page } : {}), password: o.password ?? c.password }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function viaQuery(c: Holder, k: Case, text: string) {
  h.supplier = c.actor;
  const res = await queryRoute(jsonPost("/supplier/projects/award-query", { contractId: k.contractId, body: text }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const verify = (id: string) => as(p.officer, () => verifyOnlineReturn({ ok: false }, form({ id })));

describe("the online return through the portal routes (wave V, V10)", () => {
  it("Story: stage, lodge with the password, verify, accepted on the lodge day with the scans on the award and the right people told; then a question asked and answered once", async () => {
    await rule(AWARD_RETURN_EVENT_KEY.AWARD_RETURN_LODGED);
    const c = await contractor();
    const k = await issued(c.supplierId);
    const files = await stageViaRoute(c, k);

    // A wrong password writes nothing (403) and does not stop the right one.
    expect((await viaSubmit(c, k, files, { password: "not-the-password" })).status).toBe(403);
    expect(await db.awardOnlineReturn.count({ where: { awardId: k.awardId } })).toBe(0);
    const lodged = await viaSubmit(c, k, files);
    expect(lodged.status, JSON.stringify(lodged.body)).toBe(201);
    const onlineReturnId = lodged.body.onlineReturnId as string;
    expect((await viaSubmit(c, k, files)).status).toBe(409);

    expect(await told(onlineReturnId)).toEqual([p.holder, p.pic].sort().map((recipientPersonId) => ({ recipientPersonId, kind: "AWARD_RETURN_LODGED", exerciseId: k.exerciseId, href: `/projects/${k.contractId}?stage=award&tab=return` })));

    // While it waits the officer cannot cancel the award.
    const cancel = await as(p.officer, () => cancelAward({ ok: false }, form({ id: k.awardId, reason: "Withdrawn by the department" })));
    expect(cancel).toMatchObject({ ok: false });
    expect((await db.award.findUniqueOrThrow({ where: { id: k.awardId } })).status).toBe("ISSUED");

    // A question while it waits.
    const asked = await viaQuery(c, k, "When will the letter be checked?");
    expect(asked.status).toBe(201);

    expect(await verify(onlineReturnId)).toMatchObject({ ok: true });
    const award = await db.award.findUniqueOrThrow({ where: { id: k.awardId }, include: { awardReturn: true } });
    expect(award.status).toBe("ACCEPTED");
    const row = await db.awardOnlineReturn.findUniqueOrThrow({ where: { id: onlineReturnId } });
    const ret = award.awardReturn!;
    const lodgedOn = storedDay(row.submittedOn);
    expect(lodgedOn).toBe(today);
    expect([ret.signedLetterReceivedOn, ret.declarationReceivedOn, ret.authorisationReceivedOn].map((d) => storedDay(d!))).toEqual([lodgedOn, lodgedOn, lodgedOn]);
    expect(await db.documentAttachment.count({ where: { awardId: k.awardId, detachedAt: null } })).toBe(3);

    // Answered once, after acceptance too; a second answer is refused; a new question on an accepted award is not taken.
    const queryId = asked.body.queryId as string;
    expect(await as(p.officer, () => answerAwardQuery({ ok: false }, form({ id: queryId, answer: "Done." })))).toEqual({ ok: true });
    expect(await as(p.officer, () => answerAwardQuery({ ok: false }, form({ id: queryId, answer: "Again." })))).toMatchObject({ ok: false });
    expect((await viaQuery(c, k, "One more?")).status).toBe(422);
  });

  it("refused with a reason, the award stays issued and the contractor sends again through the same routes, then it is verified", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const first = await viaSubmit(c, k, await stageViaRoute(c, k));
    expect(first.status).toBe(201);
    const refused = await as(p.officer, () => refuseOnlineReturn({ ok: false }, form({ id: first.body.onlineReturnId as string, reason: "The declaration is not signed." })));
    expect(refused).toEqual({ ok: true });
    expect((await db.award.findUniqueOrThrow({ where: { id: k.awardId } })).status).toBe("ISSUED");
    expect(await db.documentAttachment.count({ where: { awardId: k.awardId } })).toBe(0);

    const again = await viaSubmit(c, k, await stageViaRoute(c, k));
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(again.body.onlineReturnId).not.toBe(first.body.onlineReturnId);
    expect(await verify(again.body.onlineReturnId as string)).toMatchObject({ ok: true });
    expect((await db.award.findUniqueOrThrow({ where: { id: k.awardId } })).status).toBe("ACCEPTED");
  });

  it("another contractor's award is 404 on every route, and nothing is written", async () => {
    const c = await contractor();
    const k = await issued(c.supplierId);
    const other = await contractor();
    expect((await viaUpload(other, k, "SIGNED_LETTER")).status).toBe(404);
    expect((await viaSubmit(other, k, { SIGNED_LETTER: "x".repeat(25) })).status).toBe(404);
    expect((await viaQuery(other, k, "Hello?")).status).toBe(404);
    expect(await db.awardQuery.count({ where: { awardId: k.awardId } })).toBe(0);
  });

  it("FR-AWD-006 finding: an indent whose 14-day validity has passed is still lodged, verified and accepted (no validity rule stops it)", async () => {
    const policy = await db.awardPolicy.findUnique({ where: { organisationId } });
    await db.awardPolicy.upsert({ where: { organisationId }, update: { indentValidityDays: 14 }, create: { organisationId, indentValidityDays: 14 } });
    try {
      const c = await contractor();
      const k = await issued(c.supplierId, { kind: "WORK_INDENT" });
      await db.award.update({ where: { id: k.awardId }, data: { indentReceivedOn: D(dayPlus(today, -40)), erpCommitmentKind: "INDENT", erpCommitmentNo: "IN/EXPIRED/1" } });
      // The product's own reading calls it expired before the contractor starts.
      expect(indentState(dayPlus(today, -40), 14, today)).toMatchObject({ state: "EXPIRED" });
      const lodged = await viaSubmit(c, k, await stageViaRoute(c, k, ["ACCEPTANCE_PAGE"]), { page: PAGE });
      expect(lodged.status, JSON.stringify(lodged.body)).toBe(201);
      expect(await verify(lodged.body.onlineReturnId as string)).toMatchObject({ ok: true });
      const award = await db.award.findUniqueOrThrow({ where: { id: k.awardId } });
      expect(award.status).toBe("ACCEPTED");
      // The staff screens still raise it (expired, not commenced, not cancelled): a warning, never a refusal.
      expect(indentExpiryRaised(indentState(dayPlus(today, -40), 14, today), null, award.status)).toBe(true);
    } finally {
      await db.awardPolicy.update({ where: { organisationId }, data: { indentValidityDays: policy?.indentValidityDays ?? null } });
    }
  });
});
