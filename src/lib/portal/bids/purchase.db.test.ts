import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticateSupplier } from "@/lib/auth/supplier-identity";
import { readSupplierSession } from "@/lib/auth/supplier-session-store";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";
import { uncollectedReceipts } from "@/lib/integration/fee-receipt";
import { isFinanceReceipt } from "@/lib/integration/payment-gateway";

import { loadBidContext } from "./context-store";
import { prepareDownload, releasedPackOf } from "./download-store";
import { loadReleaseFacts } from "./inspection-store";
import { holdsReleasedPurchase } from "./purchase";
import { markPurchasePaid } from "./purchase-paid";
import { settlePayment, startPurchase } from "./purchase-store";
import { requestDocuments } from "./request-store";
import { BidRefused } from "./types";
import { documentsTab } from "./workspace-store";

/**
 * Buying the documents online, and paying on the payment simulator, against a real database (SR-10, rulings 16 and 17 as amended): "Buy documents" makes a purchase awaiting payment; a failed try leaves it
 * so, with the failure kept; a successful one pays it on the simulator, makes the sale every reader of a sale reads, releases the documents, and is never a finance receipt; the simulator switched off refuses in
 * words; an officer recording the finance receipt is the other way to "paid"; every download is logged; the database holds the states as well as the code.
 */

let organisationId: string;
let officerId: string;
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const METHODS = ["Online banking (FPX)", "Credit or debit card"];

interface Fixture {
  exerciseId: string;
  windowId: string;
  versionId: string;
}
let online: Fixture;
let counter: Fixture;
let requisitionId: string;
let classId: string;

async function exercise(saleMode: "ONLINE" | "COUNTER"): Promise<Fixture> {
  const ex = await db.sourcingExercise.create({
    data: { organisationId, reference: `PUR/EX/${randomId()}`, requisitionId, title: "Pump house", estimatedValue: "1000.00", sourcingMethodCode: "BID_METHOD", status: "ADVERTISED", closingAt: at(30), saleMode },
  });
  const w = await db.exerciseWindow.create({
    data: { organisationId, exerciseId: ex.id, path: "ADVERTISED", publishedAt: at(-2), advertisementDay: D(at(-2)), policySnapshot: { attendance: { mandatoryPermitted: true } }, purchaseFromDay: D(at(-1)), purchaseCloseDay: D(at(10)), feeAmount: "50.00" },
  });
  // An approved, frozen pack with one issued part holding a file and a merged text, one omitted part, and one file that is SULIT.
  const bytes = Buffer.from(`the drawings of ${ex.reference}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256, byteSize: BigInt(bytes.length), bytes }], skipDuplicates: true });
  const doc = await db.document.create({ data: { organisationId, title: "Drawings", documentClassId: classId, classificationSnapshot: "INTERNAL", retentionSnapshot: {} } });
  const version = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256, byteSize: BigInt(bytes.length), mediaType: "text/plain", originalFilename: "drawings.txt", recordedByPersonId: officerId } });
  const secret = await db.document.create({ data: { organisationId, title: "Secret", documentClassId: classId, classificationSnapshot: "SULIT", retentionSnapshot: {} } });
  const secretBytes = Buffer.from(`secret of ${ex.reference}`);
  const secretSha = createHash("sha256").update(secretBytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256: secretSha, byteSize: BigInt(secretBytes.length), bytes: secretBytes }], skipDuplicates: true });
  const secretVersion = await db.documentVersion.create({ data: { organisationId, documentId: secret.id, versionNo: 1, sha256: secretSha, byteSize: BigInt(secretBytes.length), mediaType: "text/plain", originalFilename: "secret.txt", recordedByPersonId: officerId } });
  const pin = (v: { id: string; documentId: string; sha256: string }, title: string) => ({ versionId: v.id, documentId: v.documentId, versionNo: 1, sha256: v.sha256, title });
  const manifest = [
    { partCode: "p1", printedNumber: "1", label: "Instructions", role: "INSTRUCTIONS", source: "BQ_UNPRICED", state: "READY", omittedReason: null, inTableDocument: true, template: null, bill: null, appendixId: null, files: [pin(version, "Drawings")] },
    { partCode: "p2", printedNumber: "2", label: "Secret annex", role: "ANNEX", source: "UPLOAD", state: "READY", omittedReason: null, inTableDocument: false, template: null, bill: null, appendixId: null, files: [pin(secretVersion, "Secret")] },
    { partCode: "p3", printedNumber: "3", label: "Not issued", role: "ANNEX", source: "UPLOAD", state: "OMITTED", omittedReason: "none", inTableDocument: false, template: null, bill: null, appendixId: null, files: [] },
  ];
  const pack = await db.tenderPack.create({ data: { organisationId, exerciseId: ex.id, versionNo: 1, status: "APPROVED", packKind: "TENDER", contractBasisCode: "X", compositionSnapshot: {}, frozenAt: new Date(), submittedAt: new Date(), approvedAt: new Date(), approvedStartOn: D(at(-1)), approvedClosingAt: at(30), manifest } });
  await db.tenderPackDocument.create({ data: { organisationId, packId: pack.id, partCode: "p1", source: "BQ_UNPRICED", language: "EN", fields: {}, renderedText: "Instructions to tenderers: supply and lay the pipe.", frozenAt: new Date() } });
  return { exerciseId: ex.id, windowId: w.id, versionId: version.id };
}

async function supplier(status: "REGISTERED" | "APPLICANT" = "REGISTERED"): Promise<{ actor: SupplierActor; supplierId: string; accountId: string }> {
  const s = await makeSupplierAccount(organisationId);
  if (status === "REGISTERED") await db.supplier.update({ where: { id: s.supplier.id }, data: { status, registeredOn: D(at(-100)) } });
  const signedIn = await authenticateSupplier({ loginName: s.loginName, password: s.password }, facts(), null);
  if (!signedIn.ok) throw new Error("sign-in failed");
  const read = await readSupplierSession(signedIn.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session failed");
  return { actor: read.actor, supplierId: s.supplier.id, accountId: s.account!.id };
}

const setSwitches = (v: { release?: boolean | null; simulator?: boolean | null; methods?: string[] }) =>
  db.windowPolicy.upsert({
    where: { organisationId },
    create: { organisationId, electronicDocumentRelease: v.release ?? null, paymentSimulatorOn: v.simulator ?? null, simulatedPaymentMethods: v.methods ?? [] },
    update: { electronicDocumentRelease: v.release ?? null, paymentSimulatorOn: v.simulator ?? null, simulatedPaymentMethods: v.methods ?? [] },
  });

const refusedWith = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(() => null, (x) => x);
  expect(e, `expected a refusal with ${code}`).toBeInstanceOf(BidRefused);
  expect((e as BidRefused).faults.map((f) => f.code), code).toContain(code);
};

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  await db.organisation.update({ where: { id: organisationId }, data: { timeZone: "Asia/Kuala_Lumpur" } });
  officerId = (await makePerson(organisationId, `Purchase officer ${randomId()}`)).id;
  requisitionId = (
    await db.requisition.create({
      data: { organisationId, reference: `PUR/REQ/${randomId()}`, requestingUnitCode: "BID_DEPT", requestingPersonId: officerId, title: "Purchase requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "BID_CC", accountCode: "BID_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "1000.00", raisedOn: D(at(-5)) },
    })
  ).id;
  classId = (await db.documentClass.create({ data: { organisationId, code: `PUR_${randomId()}`, nameEn: "Purchase test class" } })).id;
  await setSwitches({ release: true, simulator: true, methods: METHODS });
  online = await exercise("ONLINE");
  counter = await exercise("COUNTER");
});

afterAll(async () => {
  await db.sourcingExercise.updateMany({ where: { id: { in: [online.exerciseId, counter.exerciseId] } }, data: { status: "CANCELLED" } });
  await db.windowPolicy.deleteMany({ where: { organisationId } });
});

describe("Buy documents", () => {
  it("makes a purchase awaiting payment, takes nothing and releases nothing; a second press stands", async () => {
    const s = await supplier();
    const made = await startPurchase(s.actor, { exerciseId: online.exerciseId });
    expect(made.outcome).toBe("MADE");
    const row = await db.documentPurchase.findFirstOrThrow({ where: { supplierId: s.supplierId, windowId: online.windowId } });
    expect(row).toMatchObject({ state: "AWAITING_PAYMENT", paidAt: null, paidChannel: null, buyerAccountId: s.accountId });
    expect(row.amount.toString()).toBe("50");
    expect(await db.documentSale.count({ where: { purchaseId: row.id } })).toBe(0);
    expect(await startPurchase(s.actor, { exerciseId: online.exerciseId })).toMatchObject({ outcome: "STANDS", purchaseId: row.id });
    const view = await documentsTab(db, s.actor, (await loadBidContext(db, s.actor, online.exerciseId))!);
    expect(view.online).toMatchObject({ state: "AWAITING_PAYMENT", canBuy: false });
    expect(view.release.state).toBe("AWAITING_PAYMENT");
    // The checks online carry the standing of the person signed in in place of the officer's sighting.
    expect(view.online!.checks.find((c) => c.key === "AUTHORITY")).toMatchObject({ state: "PASS" });
    expect(view.online!.checks.some((c) => c.state === "BRING")).toBe(false);
  });

  it("is refused, the refusal kept with its reasons, for a supplier not on the register; and for an exercise not sold online, or release not set", async () => {
    const a = await supplier("APPLICANT");
    const refused = await startPurchase(a.actor, { exerciseId: online.exerciseId });
    expect(refused).toMatchObject({ outcome: "REFUSED", recorded: true });
    expect(await db.documentPurchase.count({ where: { supplierId: a.supplierId } })).toBe(0);
    expect(await db.documentRequest.count({ where: { supplierId: a.supplierId, refusedAt: { not: null } } })).toBe(1);
    const b = await supplier();
    await refusedWith(startPurchase(b.actor, { exerciseId: counter.exerciseId }), "NOT_SOLD_ONLINE");
    await setSwitches({ release: null, simulator: true, methods: METHODS });
    try {
      await refusedWith(startPurchase(b.actor, { exerciseId: online.exerciseId }), "RELEASE_NOT_ONLINE");
    } finally {
      await setSwitches({ release: true, simulator: true, methods: METHODS });
    }
    expect(await db.documentPurchase.count({ where: { supplierId: b.supplierId } })).toBe(0);
  });

  it("an exercise sold online is bought, not asked for: the counter's request is refused in words", async () => {
    const s = await supplier();
    await refusedWith(requestDocuments(s.actor, { exerciseId: online.exerciseId, collectorName: "Lim Wei" }), "SOLD_ONLINE");
  });
});

describe("paying on the payment simulator", () => {
  it("a failure leaves the purchase awaiting payment with the failure kept and shown; a success pays it, makes the sale and releases the documents", async () => {
    const s = await supplier();
    await startPurchase(s.actor, { exerciseId: online.exerciseId });
    const failed = await settlePayment(s.actor, { exerciseId: online.exerciseId, method: METHODS[1], choice: "FAIL" });
    expect(failed).toMatchObject({ outcome: "FAILED", method: METHODS[1] });
    const purchase = await db.documentPurchase.findFirstOrThrow({ where: { supplierId: s.supplierId, windowId: online.windowId } });
    expect(purchase.state).toBe("AWAITING_PAYMENT");
    expect(await db.documentSale.count({ where: { purchaseId: purchase.id } })).toBe(0);
    const view = await documentsTab(db, s.actor, (await loadBidContext(db, s.actor, online.exerciseId))!);
    expect(view.online!.purchase!.lastFailure).toMatchObject({ method: METHODS[1] });
    expect(view.release.state).toBe("AWAITING_PAYMENT");

    const paid = await settlePayment(s.actor, { exerciseId: online.exerciseId, method: METHODS[0], choice: "PAY" });
    expect(paid).toMatchObject({ outcome: "PAID", method: METHODS[0], already: false });
    const after = await db.documentPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(after).toMatchObject({ state: "PAID", paidChannel: "SIMULATED", paidMethod: METHODS[0], receiptRecordedByPersonId: null });
    expect(after.paidReference).toMatch(/^SIM-/);
    // Both tries are kept.
    expect((await db.paymentAttempt.findMany({ where: { purchaseId: purchase.id }, orderBy: { attemptNo: "asc" } })).map((a) => a.outcome)).toEqual(["FAILED", "PAID"]);
    // The sale every reader of a sale reads: simulated, no officer, no receipt number, the purchaser named.
    const sale = await db.documentSale.findUniqueOrThrow({ where: { purchaseId: purchase.id }, include: { party: true } });
    expect(sale).toMatchObject({ paymentChannel: "SIMULATED", simulatedReference: after.paidReference, financeReceiptNo: null, receiptRecordedOn: null, issuedByPersonId: null, voidedAt: null });
    expect(sale.party.vendorId).toBe(s.supplierId);
    expect(sale.paymentMethod).toContain("Simulated payment");
    expect(JSON.stringify(sale.annotation)).toContain("Simulated payment");
    // It is never a finance receipt, and not among the receipts to collect.
    expect(isFinanceReceipt({ paymentChannel: sale.paymentChannel, financeReceiptNo: sale.financeReceiptNo, voidedAt: sale.voidedAt })).toBe(false);
    expect(uncollectedReceipts([sale])).toEqual([]);
    // Released, and the predicate for a later bid holds, independently of the phase.
    const ctx = (await loadBidContext(db, s.actor, online.exerciseId))!;
    expect((await loadReleaseFacts(db, s.actor, ctx)).state).toBe("READY");
    expect(holdsReleasedPurchase({ releaseOnline: true, purchase: { state: after.state }, sale: { voidedAt: sale.voidedAt, financeReceiptNo: sale.financeReceiptNo, paymentChannel: sale.paymentChannel } }).released).toBe(true);
    // A double press changes nothing: the payment that stands answers, and no second attempt is kept.
    expect(await settlePayment(s.actor, { exerciseId: online.exerciseId, method: METHODS[0], choice: "PAY" })).toMatchObject({ outcome: "PAID", already: true });
    expect(await db.paymentAttempt.count({ where: { purchaseId: purchase.id } })).toBe(2);
    expect(await db.documentSale.count({ where: { purchaseId: purchase.id } })).toBe(1);
    // The audit trail names the simulation.
    const trail = await db.auditEntry.findMany({ where: { entityId: purchase.id } });
    expect(JSON.stringify(trail.map((t) => t.changes))).toContain("Simulated payment");
  });

  it("refuses in words where the simulator is not switched on, or is off, or has no method, or a method that is not offered", async () => {
    const s = await supplier();
    await startPurchase(s.actor, { exerciseId: online.exerciseId });
    const pay = (method = METHODS[0]) => settlePayment(s.actor, { exerciseId: online.exerciseId, method, choice: "PAY" });
    await refusedWith(pay("Bitcoin"), "METHOD_NOT_OFFERED");
    for (const v of [{ simulator: null }, { simulator: false }, { simulator: true, methods: [] as string[] }]) {
      await setSwitches({ release: true, methods: METHODS, ...v });
      try {
        const e = await pay().then(() => null, (x) => x);
        expect(e).toBeInstanceOf(BidRefused);
        expect((e as BidRefused).faults[0]).toMatchObject({ code: "PAYMENT_UNAVAILABLE" });
      } finally {
        await setSwitches({ release: true, simulator: true, methods: METHODS });
      }
    }
    const purchase = await db.documentPurchase.findFirstOrThrow({ where: { supplierId: s.supplierId, windowId: online.windowId } });
    expect(purchase.state).toBe("AWAITING_PAYMENT");
    expect(await db.paymentAttempt.count({ where: { purchaseId: purchase.id } })).toBe(0);
  });

  it("a supplier cannot pay another supplier's purchase: it has none, and the answer is the same", async () => {
    const a = await supplier();
    const b = await supplier();
    await startPurchase(a.actor, { exerciseId: online.exerciseId });
    await refusedWith(settlePayment(b.actor, { exerciseId: online.exerciseId, method: METHODS[0], choice: "PAY" }), "NO_PURCHASE");
  });
});

describe("the officer recording the finance receipt, the other way to paid", () => {
  it("pays an awaiting purchase with the receipt's channel, the officer named, and releases the documents", async () => {
    const s = await supplier();
    await startPurchase(s.actor, { exerciseId: online.exerciseId });
    const purchase = await db.documentPurchase.findFirstOrThrow({ where: { supplierId: s.supplierId, windowId: online.windowId } });
    const receiptNo = `FIN-${randomId()}`;
    await db.$transaction(async (tx) => {
      await markPurchasePaid(tx, {
        org: { id: organisationId, timeZone: "Asia/Kuala_Lumpur", today: new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) },
        exercise: { id: online.exerciseId, reference: "R", title: "T", closes: at(30) },
        window: { id: online.windowId },
        purchase: { id: purchase.id, supplierId: s.supplierId, amount: purchase.amount },
        buyer: { accountId: s.accountId, name: s.actor.displayName },
        now: new Date(),
        by: { channel: "FINANCE_RECEIPT", personId: officerId, personName: "Officer", receiptNo },
        auditActor: { kind: "SUPPLIER", supplierAccountId: s.accountId, sessionId: s.actor.sessionId, sourceAddress: null },
      });
    });
    const after = await db.documentPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(after).toMatchObject({ state: "PAID", paidChannel: "FINANCE_RECEIPT", receiptRecordedByPersonId: officerId, paidReference: null });
    const sale = await db.documentSale.findUniqueOrThrow({ where: { purchaseId: purchase.id } });
    expect(sale).toMatchObject({ paymentChannel: "COUNTER", financeReceiptNo: receiptNo, issuedByPersonId: officerId });
    expect(isFinanceReceipt({ paymentChannel: sale.paymentChannel, financeReceiptNo: sale.financeReceiptNo, voidedAt: null })).toBe(true);
    expect((await loadReleaseFacts(db, s.actor, (await loadBidContext(db, s.actor, online.exerciseId))!)).state).toBe("READY");
  });

  it("is the only other writer: a purchase already paid cannot be paid again", async () => {
    const s = await supplier();
    await startPurchase(s.actor, { exerciseId: online.exerciseId });
    await settlePayment(s.actor, { exerciseId: online.exerciseId, method: METHODS[0], choice: "PAY" });
    const purchase = await db.documentPurchase.findFirstOrThrow({ where: { supplierId: s.supplierId, windowId: online.windowId } });
    const again = db.$transaction((tx) =>
      markPurchasePaid(tx, {
        org: { id: organisationId, timeZone: "Asia/Kuala_Lumpur", today: new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) },
        exercise: { id: online.exerciseId, reference: "R", title: "T", closes: at(30) },
        window: { id: online.windowId },
        purchase: { id: purchase.id, supplierId: s.supplierId, amount: purchase.amount },
        buyer: { accountId: s.accountId, name: "x" },
        now: new Date(),
        by: { channel: "FINANCE_RECEIPT", personId: officerId, personName: "Officer", receiptNo: `FIN-${randomId()}` },
        auditActor: { kind: "SUPPLIER", supplierAccountId: s.accountId, sessionId: s.actor.sessionId, sourceAddress: null },
      }),
    );
    await expect(again).rejects.toThrow(/no longer awaiting payment/);
  });
});

describe("the database holds the states", () => {
  it("refuses a paid purchase with no channel, a simulated sale with a receipt number, a sale with no officer unless simulated, and any change to an attempt or a download", async () => {
    const s = await supplier();
    await startPurchase(s.actor, { exerciseId: online.exerciseId });
    const purchase = await db.documentPurchase.findFirstOrThrow({ where: { supplierId: s.supplierId, windowId: online.windowId } });
    await expect(db.documentPurchase.update({ where: { id: purchase.id }, data: { state: "PAID" } })).rejects.toThrow();
    await expect(db.documentPurchase.update({ where: { id: purchase.id }, data: { state: "PAID", paidAt: new Date(), paidChannel: "SIMULATED" } })).rejects.toThrow();
    const party = await db.exerciseParty.create({ data: { organisationId, exerciseId: online.exerciseId, source: "PURCHASER", name: "P", registrationNo: `RN-${randomId()}`, vendorId: s.supplierId } });
    const base = { organisationId, windowId: online.windowId, partyId: party.id, soldOn: D(new Date()), collectedBy: "x", authoritySighted: false, amount: "50.00", paymentMethod: "x", annotation: {} };
    await expect(db.documentSale.create({ data: { ...base, paymentChannel: "SIMULATED", simulatedReference: "SIM-1", financeReceiptNo: "R-1", purchaseId: purchase.id } })).rejects.toThrow();
    await expect(db.documentSale.create({ data: { ...base, issuedByPersonId: null } })).rejects.toThrow();
    await expect(db.documentSale.create({ data: { ...base, paymentChannel: "SIMULATED" } })).rejects.toThrow();
    const attempt = await db.paymentAttempt.create({ data: { organisationId, purchaseId: purchase.id, attemptNo: 1, method: "x", outcome: "FAILED", reference: "SIM-X", failureText: "no", attemptedAt: new Date(), byAccountId: s.accountId } });
    await expect(db.paymentAttempt.update({ where: { id: attempt.id }, data: { outcome: "PAID" } })).rejects.toThrow();
    await expect(db.paymentAttempt.delete({ where: { id: attempt.id } })).rejects.toThrow();
    await expect(db.documentPurchase.create({ data: { organisationId, windowId: online.windowId, supplierId: s.supplierId, buyerAccountId: s.accountId, createdAt: new Date(), amount: "50.00", checks: [] } })).rejects.toThrow();
  });
});

describe("downloading what a released purchase releases", () => {
  it("serves the files and texts of the approved pack to the supplier whose purchase is released, logs each download, and never a SULIT file or one the pack does not name", async () => {
    const s = await supplier();
    await startPurchase(s.actor, { exerciseId: online.exerciseId });
    const pack = (await releasedPackOf(organisationId, online.exerciseId))!;
    expect(pack.files.map((f) => f.title).sort()).toEqual(["Drawings", "Secret"]);
    expect(pack.texts.map((t) => t.id)).toEqual(["p1.EN"]);
    // Not released yet: nothing is served, and nothing is logged.
    const no = await prepareDownload(s.actor, { exerciseId: online.exerciseId, file: online.versionId, text: null, secFetchSite: "same-origin" });
    expect(no).toMatchObject({ ok: false, status: 403 });
    await settlePayment(s.actor, { exerciseId: online.exerciseId, method: METHODS[0], choice: "PAY" });
    // Another site's request reads nothing and logs nothing.
    expect(await prepareDownload(s.actor, { exerciseId: online.exerciseId, file: online.versionId, text: null, secFetchSite: "cross-site" })).toMatchObject({ ok: false, status: 403 });
    const file = await prepareDownload(s.actor, { exerciseId: online.exerciseId, file: online.versionId, text: null, secFetchSite: "same-origin" });
    if (!file.ok) throw new Error(file.text);
    expect(Buffer.from(file.body).toString()).toContain("the drawings");
    expect(await db.purchaseDownload.count({ where: { supplierId: s.supplierId } })).toBe(0);
    await file.commit();
    const text = await prepareDownload(s.actor, { exerciseId: online.exerciseId, file: null, text: "p1.EN", secFetchSite: null });
    if (!text.ok) throw new Error(text.text);
    expect(Buffer.from(text.body).toString()).toContain("Instructions to tenderers");
    await text.commit();
    // Each is a row; asking again is another row, none deduplicated.
    const again = await prepareDownload(s.actor, { exerciseId: online.exerciseId, file: online.versionId, text: null, secFetchSite: null });
    if (!again.ok) throw new Error(again.text);
    await again.commit();
    const rows = await db.purchaseDownload.findMany({ where: { supplierId: s.supplierId }, orderBy: { downloadedAt: "asc" } });
    expect(rows.map((r) => r.kind)).toEqual(["FILE", "MERGED_TEXT", "FILE"]);
    expect(rows.every((r) => r.accountId === s.accountId && r.packVersion === 1)).toBe(true);
    // A SULIT file is never served to a supplier, and a version the pack does not name is not found.
    const secret = pack.files.find((f) => f.title === "Secret")!;
    expect(await prepareDownload(s.actor, { exerciseId: online.exerciseId, file: secret.versionId, text: null, secFetchSite: null })).toMatchObject({ ok: false, status: 403 });
    expect(await prepareDownload(s.actor, { exerciseId: online.exerciseId, file: "nosuchversion1", text: null, secFetchSite: null })).toMatchObject({ ok: false, status: 404 });
    // Another supplier, with no purchase, is served nothing.
    const other = await supplier();
    expect(await prepareDownload(other.actor, { exerciseId: online.exerciseId, file: online.versionId, text: null, secFetchSite: null })).toMatchObject({ ok: false, status: 403 });
  });
});
