import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { ActWriter } from "@/lib/auth/act-writer";
import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { withLockedContract } from "@/lib/contract/repo";
import { dayOf } from "@/lib/dates";
import { db } from "@/lib/db";
import { makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS } from "@/lib/test-db/auth-fixtures";
import type { WrittenAttribution } from "@/lib/test-support/staff";

/**
 * Supply claims, from the contractor's delivery order and invoice to Finance's payment, against a real database (ADR 0045 D5 to D7; WV-9 to WV-13; wave V step V6):
 * - the seventh kind is offered only where the contract type's route is "delivery order and invoice", read live, and two valuation claims are not (WV-10);
 * - every version carries a delivery order and an invoice (WV-11), and those files are kept and downloadable as project files are;
 * - it is returned with remarks and verified by the existing mark, and Finance's payment is recorded once, by hand, through the staff act (WV-13), with its attribution
 *   and its audit row, under the contract's and the claim's locks;
 * - a route changed later never hides or blocks a claim already sent (WV-9);
 * - the act refuses in words, never by the trigger (PA050): another contract's or organisation's claim, a claim of another kind, one not verified, a second payment.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null, written: [] as WrittenAttribution[] }));

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
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { saveContractBehaviours } from "@/app/configuration/reference-data/core";
import { withdrawVersion } from "@/app/documents/actions";
import { recordSupplyPayment } from "@/app/projects/[id]/supply-actions";
import { markProjectVersion } from "@/app/projects/[id]/document-actions";
import { contractorCreate, contractorVersion } from "@/lib/project-docs/portal-acts";
import { findProjectFile } from "@/lib/project-docs/portal-file";
import { loadSupplyClaims, supplyClaimCounts } from "@/lib/project-docs/supply-read";

import { recordSupplyPayment as recordSupplyPaymentCore, SupplyPaymentRefused } from "./supply-write";

const run = randomId();
const ORG_NAME = `Jabatan Bekalan ${run}`;
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

let organisationId = "";
let orgCode = "";
let otherOrganisationId = "";
let soRole = "";
let projectClassId = "";
const p = { so: "", finance: "" };
let otherPerson = "";
let counter = 0;
const SUPPLY = `SUP_${run}`;
const WORK = `WRK_${run}`;
const UNSET = `UNS_${run}`;

const staff = (personId: string): StaffActor =>
  ({
    kind: "STAFF",
    accountId: `acc_${personId}`,
    sessionId: `ses_${personId}`,
    personId,
    personName: "Officer",
    jobTitle: null,
    isAdministrator: false,
    organisationId,
    organisationCode: orgCode,
    organisationTimeZone: "Asia/Kuala_Lumpur",
    offices: [],
    permissions: new Set(),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.8",
    mustChangePassword: false,
  }) as unknown as StaffActor;
const as = <T>(personId: string, fn: () => Promise<T>): Promise<T> => {
  h.who = staff(personId);
  return fn();
};

interface Contractor {
  actor: SupplierActor;
  supplierId: string;
  accountId: string;
}
async function contractor(): Promise<Contractor> {
  const s = await makeSupplierAccount(organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
  const actor: SupplierActor = {
    kind: "SUPPLIER",
    accountId: s.account!.id,
    sessionId: `ses_${s.account!.id}`,
    contactId: s.contact.id,
    displayName: s.contact.name,
    supplierId: s.supplier.id,
    supplierName: s.supplier.registeredName,
    loginName: s.loginName,
    organisationId,
    organisationTimeZone: "Asia/Kuala_Lumpur",
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.9",
    mustChangePassword: false,
    resetNoticePending: false,
  };
  return { actor, supplierId: s.supplier.id, accountId: s.account!.id };
}

/// An active contract of `typeCode` (null: none), awarded to the contractor, with its S.O. office.
async function contract(vendorId: string, typeCode: string | null, org = organisationId) {
  const r = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId: org, reference: `SUP/RQ/${r}`, requestingUnitCode: "SUP_DEPT", requestingPersonId: org === organisationId ? p.so : otherPerson, title: "Supply requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "SUP_CC", accountCode: "SUP_AC", placeOfDelivery: "Store", dateRequired: D(at(100)), estimatedValue: "50000.00", raisedOn: D(at(-30)) },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId: org, reference: `SUP/EX/${r}`, requisitionId: requisition.id, title: `Pipes ${r}`, estimatedValue: "50000.00", sourcingMethodCode: "SUP_METHOD", status: "EVALUATED", contractTypeCode: typeCode } });
  const award = await db.award.create({ data: { organisationId: org, reference: `SUP/AW/${r}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Supplier", awardedValue: "50000.00", completionPeriod: 30, completionUnit: "DAYS", status: "ISSUED", vendorId } });
  const c = await db.contract.create({ data: { organisationId: org, number: `SUP/CON/${r}`, numberSource: "SERIES", numberedOn: D(at(-20)), awardId: award.id, contractSum: "50000.00", status: "ACTIVE" } });
  if (org === organisationId) await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: soRole, roleLabel: "Superintending Officer (test)", reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "50000.00", warnings: [], effectiveOn: D(at(-20)), recordedAt: at(-20) } });
  return c.id;
}

/// A file the contractor staged for a project document.
async function stage(c: Contractor) {
  const bytes = new TextEncoder().encode(`%PDF-1.4 supply ${run} ${++counter}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const name = `file-${counter}.pdf`;
  const doc = await db.document.create({ data: { organisationId, title: name, documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: "project-document" } });
  return (await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedBySupplierAccountId: c.accountId, storedAt: new Date() } })).id;
}

/// The contractor sends a delivery order and its invoice, as the create route hands the parsed body on.
async function sendClaim(c: Contractor, contractId: string, invoiceNo: string) {
  const ids = [await stage(c), await stage(c)];
  return contractorCreate(c.actor, { contractId, title: invoiceNo, note: "", first: { upload: { stagedVersionIds: ids, filePurposes: ["DELIVERY_ORDER", "SUPPLY_INVOICE"], note: "" } }, kind: "SUPPLY_CLAIM" });
}
const docOf = (r: { status: number; body: Record<string, unknown> }) => {
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.documentId as string;
};
const latestVersionOf = async (documentId: string) => (await db.projectDocumentVersion.findFirstOrThrow({ where: { documentId }, orderBy: { number: "desc" } })).id;
const mark = async (contractId: string, documentId: string, outcome: "TAKEN_UP" | "RETURNED", remarks = "") => as(p.so, async () => markProjectVersion({ ok: false }, form({ contractId, documentId, versionId: await latestVersionOf(documentId), outcome, remarks })));
const today = () => dayOf(new Date(), "Asia/Kuala_Lumpur")!;
const pay = (contractId: string, documentId: string, o: Partial<Record<"paidOn" | "batchNo" | "amount" | "note", string>> = {}) =>
  as(p.finance, () => recordSupplyPayment({ ok: false }, form({ id: contractId, documentId, paidOn: today(), batchNo: "B-0042", amount: "12500.00", note: "", ...o })));
const claimsOf = (contractId: string) => loadSupplyClaims(db, { organisationId, orgName: ORG_NAME, contractId });

beforeAll(async () => {
  orgCode = `SUP_${run}`;
  organisationId = (await db.organisation.create({ data: { code: orgCode, name: ORG_NAME, timeZone: "Asia/Kuala_Lumpur" } })).id;
  otherOrganisationId = (await db.organisation.create({ data: { code: `SUPX_${run}`, name: `Other ${run}`, timeZone: "Asia/Kuala_Lumpur" } })).id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Supply ${k} ${run}`)).id;
  otherPerson = (await makePerson(otherOrganisationId, `Other person ${run}`)).id;
  soRole = `SUP_SO_${run}`;
  await db.roleAssignment.create({ data: { personId: p.so, roleCode: soRole, effectiveFrom: D(new Date("2020-01-01")) } });
  projectClassId = (await db.documentClass.create({ data: { organisationId, code: "sup_project", nameEn: "Project files", classification: "INTERNAL" } })).id;
  await db.documentStorePolicy.upsert({ where: { organisationId }, update: { projectDocumentClassId: projectClassId }, create: { organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: projectClassId } });
  await db.contractType.createMany({
    data: [
      { organisationId, code: SUPPLY, nameEn: "Supply", paymentRoute: "DELIVERY_ORDER_INVOICE" },
      { organisationId, code: WORK, nameEn: "Work", paymentRoute: "CERTIFIED_CLAIM" },
      { organisationId, code: UNSET, nameEn: "Consultancy" },
    ],
  });
});

describe("a supply claim from delivery order to payment (worked example)", () => {
  it("is sent with a delivery order and an invoice, returned, sent again, verified, and paid RM12,500 in batch B-0042, once", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId, SUPPLY);
    const documentId = docOf(await sendClaim(c, contractId, "INV-2026-0042"));
    expect((await db.projectDocument.findUniqueOrThrow({ where: { id: documentId } })).kind).toBe("SUPPLY_CLAIM");
    const v1 = await latestVersionOf(documentId);
    const files = await db.documentAttachment.findMany({ where: { projectDocumentVersionId: v1 }, select: { id: true, purpose: true, versionId: true } });
    expect(files.map((f) => f.purpose).sort()).toEqual(["DELIVERY_ORDER", "SUPPLY_INVOICE"]);
    // Each pin is audited under its purpose's words.
    expect((await db.auditEntry.findMany({ where: { organisationId, entity: "DocumentAttachment", entityId: { in: files.map((f) => f.id) } } })).map((a) => a.entityLabel.split(" · ").at(-1)).sort()).toEqual(["Delivery order", "Invoice"]);
    // The contractor downloads its own delivery order, and the store keeps it as a project file.
    expect(await findProjectFile(db, c.actor, files[0]!.id)).toMatchObject({ ok: true });
    const kept = await as(p.so, () => withdrawVersion({ ok: false }, form({ versionId: files[0]!.versionId, reason: "Wrong file." })));
    expect(kept).toMatchObject({ ok: false, message: expect.stringMatching(/project file is kept/) });
    expect(await claimsOf(contractId)).toMatchObject([{ documentId, invoiceNo: "INV-2026-0042", state: "WITH_ORGANISATION", stateLabel: `With ${ORG_NAME}`, payment: null, payable: false }]);

    // Returned with remarks: the contractor sends Version 2, which must carry both files again.
    expect(await mark(contractId, documentId, "RETURNED", "The invoice is not signed.")).toMatchObject({ ok: true });
    expect((await claimsOf(contractId))[0]).toMatchObject({ state: "RETURNED", stateLabel: "Returned" });
    const plain = await contractorVersion(c.actor, { contractId, documentId, stagedVersionIds: [await stage(c)], note: "", kind: null });
    expect(plain.status).toBe(422);
    expect(plain.body.message).toMatch(/not marked as the delivery order or the invoice.*Add the delivery order.*Add the invoice/);
    const half = await contractorVersion(c.actor, { contractId, documentId, stagedVersionIds: [await stage(c)], filePurposes: ["DELIVERY_ORDER"], note: "", kind: null });
    expect(half).toMatchObject({ status: 422, body: { message: "Not done: Add the invoice." } });
    expect(await db.projectDocumentVersion.count({ where: { documentId } })).toBe(1);
    const v2 = await contractorVersion(c.actor, { contractId, documentId, stagedVersionIds: [await stage(c), await stage(c)], filePurposes: ["SUPPLY_INVOICE", "DELIVERY_ORDER"], note: "Signed invoice.", kind: null });
    expect(v2.status).toBe(201);

    // Payment before verification is refused in words, and nothing is written.
    expect(await pay(contractId, documentId)).toEqual({ ok: false, message: "Not recorded: Finance pays a verified claim: this one is not verified." });
    expect(await mark(contractId, documentId, "TAKEN_UP")).toMatchObject({ ok: true, message: "Verified." });
    expect((await claimsOf(contractId))[0]).toMatchObject({ state: "VERIFIED", stateLabel: "Verified", payable: true });
    expect(supplyClaimCounts(await claimsOf(contractId))).toEqual({ toVerify: 0, toRecordPayment: 1 });

    h.written.length = 0;
    expect(await pay(contractId, documentId, { note: "Remittance 77." })).toEqual({ ok: true });
    const row = await db.supplyInvoicePayment.findUniqueOrThrow({ where: { documentId } });
    expect(row).toMatchObject({ organisationId, contractId, versionId: await latestVersionOf(documentId), batchNo: "B-0042", personId: p.finance, note: "Remittance 77." });
    expect(row.amount.toString()).toBe("12500");
    expect(h.written.map((w) => [w.entity, w.entityId, w.slot, w.subjectPersonId])).toEqual([["SupplyInvoicePayment", row.id, "person", p.finance]]);
    const audit = await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "SupplyInvoicePayment", entityId: row.id } });
    expect(audit.action).toBe("CREATE");
    expect(audit.entityLabel).toMatch(/INV-2026-0042 · paid by Finance$/);
    const day = today();
    const [paid] = await claimsOf(contractId);
    expect(paid).toMatchObject({ state: "PAID", payable: false, payment: { paidOn: day, batchNo: "B-0042", amount: 1250000n, amountText: "RM12,500", note: "Remittance 77." } });
    expect(paid!.stateLabel).toMatch(/^Paid RM12,500 on \d{2} \w{3} \d{4}, batch B-0042$/);

    // A second payment is refused in words.
    expect(await pay(contractId, documentId, { batchNo: "B-0043" })).toEqual({ ok: false, message: "Not recorded: Finance's payment of this claim is already recorded." });
    expect(await db.supplyInvoicePayment.count({ where: { documentId } })).toBe(1);
  });

  it("refuses a payment dated before the claim was verified or after today, of nothing, or with no batch: each in words, nothing written", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId, SUPPLY);
    const documentId = docOf(await sendClaim(c, contractId, "INV-7"));
    await mark(contractId, documentId, "TAKEN_UP");
    const yesterday = dayOf(at(-1), "Asia/Kuala_Lumpur")!;
    const tomorrow = dayOf(at(1), "Asia/Kuala_Lumpur")!;
    expect((await pay(contractId, documentId, { paidOn: yesterday })).message).toMatch(/cannot be paid before it was verified/);
    expect((await pay(contractId, documentId, { paidOn: tomorrow })).message).toMatch(/after today/);
    expect((await pay(contractId, documentId, { amount: "0" })).message).toMatch(/more than zero/);
    expect(await pay(contractId, documentId, { batchNo: "" })).toMatchObject({ ok: false, errors: { batchNo: expect.any(String) } });
    expect(await pay(contractId, documentId, { amount: "" })).toMatchObject({ ok: false, errors: { amount: expect.any(String) } });
    expect(await db.supplyInvoicePayment.count({ where: { documentId } })).toBe(0);
  });
});

describe("which kinds a contract offers, read live from its type's route (WV-9, WV-10)", () => {
  it("a supply claim is refused on a certified-claim contract and on one whose type has no route or no type; an interim claim is refused on a delivery-order contract", async () => {
    const c = await contractor();
    for (const type of [WORK, UNSET, null]) {
      const contractId = await contract(c.supplierId, type);
      const r = await sendClaim(c, contractId, "INV-X");
      expect(r.status, String(type)).toBe(422);
      expect(r.body.message).toBe("Not done: Delivery order and invoice is not sent on this contract.");
      expect(await db.projectDocument.count({ where: { contractId } })).toBe(0);
    }
    const supply = await contract(c.supplierId, SUPPLY);
    for (const kind of ["INTERIM_CLAIM", "MATERIALS_ON_SITE"] as const) {
      const r = await contractorCreate(c.actor, { contractId: supply, title: "Claim 1", note: "", first: { upload: { stagedVersionIds: [await stage(c)], note: "" } }, kind });
      expect(r, kind).toMatchObject({ status: 422, body: { message: expect.stringMatching(/is not sent on this contract/) } });
    }
    // The other kinds, and an ordinary document, are taken there as anywhere; a delivery order on an ordinary document is not.
    expect((await contractorCreate(c.actor, { contractId: supply, title: "Programme", note: "", first: { upload: { stagedVersionIds: [await stage(c)], note: "" } }, kind: "WORK_PROGRAMME" })).status).toBe(201);
    const stray = await contractorCreate(c.actor, { contractId: supply, title: "Photos", note: "", first: { upload: { stagedVersionIds: [await stage(c)], filePurposes: ["DELIVERY_ORDER"], note: "" } }, kind: null });
    expect(stray).toMatchObject({ status: 422, body: { message: expect.stringMatching(/goes only with a delivery order and invoice/) } });
    // And an interim claim is still taken on a certified-claim contract.
    expect((await contractorCreate(c.actor, { contractId: await contract(c.supplierId, WORK), title: "Claim 1", note: "", first: { upload: { stagedVersionIds: [await stage(c)], note: "" } }, kind: "INTERIM_CLAIM" })).status).toBe(201);
  });

  it("a route changed after a claim was sent leaves it readable, its next version taken, and payable; only a new claim is refused", async () => {
    const c = await contractor();
    const type = `CHG_${randomId()}`;
    await db.contractType.create({ data: { organisationId, code: type, nameEn: "Supply, changed", paymentRoute: "DELIVERY_ORDER_INVOICE" } });
    const contractId = await contract(c.supplierId, type);
    const documentId = docOf(await sendClaim(c, contractId, "INV-OLD"));
    await mark(contractId, documentId, "RETURNED", "Wrong delivery order.");
    await db.contractType.updateMany({ where: { organisationId, code: type }, data: { paymentRoute: "CERTIFIED_CLAIM" } });
    expect((await sendClaim(c, contractId, "INV-NEW")).status).toBe(422);
    const v2 = await contractorVersion(c.actor, { contractId, documentId, stagedVersionIds: [await stage(c), await stage(c)], filePurposes: ["DELIVERY_ORDER", "SUPPLY_INVOICE"], note: "", kind: null });
    expect(v2.status).toBe(201);
    await mark(contractId, documentId, "TAKEN_UP");
    expect(await pay(contractId, documentId)).toEqual({ ok: true });
    expect((await claimsOf(contractId)).map((r) => [r.invoiceNo, r.state])).toEqual([["INV-OLD", "PAID"]]);
  });
});

describe("the payment act reaches only this contract's supply claims, in this organisation, and refuses in words before the trigger would (PA050)", () => {
  it("another contract's claim, another organisation's document, an unknown id, and a verified interim claim are each 'not a delivery order and invoice on this contract'", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId, SUPPLY);
    const elsewhere = await contract(c.supplierId, SUPPLY);
    const theirs = docOf(await sendClaim(c, elsewhere, "INV-ELSEWHERE"));
    await mark(elsewhere, theirs, "TAKEN_UP");
    // Another organisation's supply claim, written directly by its own awardee's account.
    const oc = await makeSupplierAccount(otherOrganisationId);
    const foreignContract = await contract(oc.supplier.id, null, otherOrganisationId);
    const foreign = await db.projectDocument.create({ data: { organisationId: otherOrganisationId, contractId: foreignContract, title: "INV-FOREIGN", side: "CONTRACTOR", kind: "SUPPLY_CLAIM", createdBySupplierAccountId: oc.account!.id, createdAt: new Date() } });
    const interimContract = await contract(c.supplierId, WORK);
    const interim = docOf(await contractorCreate(c.actor, { contractId: interimContract, title: "Claim 1", note: "", first: { upload: { stagedVersionIds: [await stage(c)], note: "" } }, kind: "INTERIM_CLAIM" }));
    await mark(interimContract, interim, "TAKEN_UP");
    const NOT_OURS = "Not recorded: That is not a delivery order and invoice on this contract.";
    expect(await pay(contractId, theirs)).toEqual({ ok: false, message: NOT_OURS });
    expect(await pay(contractId, foreign.id)).toEqual({ ok: false, message: NOT_OURS });
    expect(await pay(contractId, "cl_not_a_document_at_all")).toEqual({ ok: false, message: NOT_OURS });
    expect(await pay(interimContract, interim)).toEqual({ ok: false, message: NOT_OURS });
    expect(await db.supplyInvoicePayment.count({ where: { documentId: { in: [theirs, interim, foreign.id] } } })).toBe(0);
  });

  it("the core refuses a recorder who is not on record and active in this organisation, and writes nothing", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId, SUPPLY);
    const documentId = docOf(await sendClaim(c, contractId, "INV-P"));
    await mark(contractId, documentId, "TAKEN_UP");
    const act = (subjectPersonId: string) => ({ subjectPersonId, recorderId: null, intent: { mode: "SIGNED" }, day: null, write: async () => undefined, writeAlso: async () => undefined }) as unknown as ActWriter;
    const attempt = (subjectPersonId: string) =>
      withLockedContract(organisationId, contractId, (tx, l) => recordSupplyPaymentCore({ tx, l, actor: { kind: "SYSTEM" } as never, now: new Date(), today: today() }, { documentId, paidOn: today(), batchNo: "B1", amount: 100n, note: "", act: act(subjectPersonId) }));
    const e = await attempt(otherPerson).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(SupplyPaymentRefused);
    expect((e as SupplyPaymentRefused).message).toBe("Not recorded: Name who it is recorded for: someone on record and active.");
    expect(await db.supplyInvoicePayment.count({ where: { documentId } })).toBe(0);
  });
});

describe("the contract type's route is saved by the reference-data editor, and kept when the form does not send it", () => {
  it("round-trips Delivery order and invoice; a form without the field keeps it; empty is not set; anything else is refused", async () => {
    const t = await db.contractType.create({ data: { organisationId, code: `RT_${randomId()}`, nameEn: "Round trip" } });
    const save = (fields: Record<string, string>) => as(p.so, () => saveContractBehaviours({ ok: false }, form({ id: t.id, ...fields })));
    const route = async () => (await db.contractType.findUniqueOrThrow({ where: { id: t.id } })).paymentRoute;
    expect(await save({ paymentRoute: "DELIVERY_ORDER_INVOICE" })).toEqual({ ok: true });
    expect(await route()).toBe("DELIVERY_ORDER_INVOICE");
    expect(await save({ pricingBasis: "Schedule of prices" })).toEqual({ ok: true });
    expect(await route()).toBe("DELIVERY_ORDER_INVOICE");
    expect(await save({ paymentRoute: "PAY_ON_HOPE" })).toMatchObject({ ok: false, errors: { paymentRoute: expect.any(String) } });
    expect(await route()).toBe("DELIVERY_ORDER_INVOICE");
    expect(await save({ paymentRoute: "" })).toEqual({ ok: true });
    expect(await route()).toBeNull();
    const audits = await db.auditEntry.findMany({ where: { organisationId, entity: "ContractType", entityId: t.id }, orderBy: { at: "asc" } });
    expect(audits.some((a) => JSON.stringify(a).includes("paymentRoute"))).toBe(true);
  });
});
