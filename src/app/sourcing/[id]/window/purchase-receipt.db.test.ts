import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, makeSupplierAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import { isFinanceReceipt } from "@/lib/integration/payment-gateway";

/**
 * The officer's way to "paid" (SR-10, ruling 17 as amended): recording the finance receipt of an online purchase that waits for payment, through the real action, against the scratch database. It pays the
 * purchase with the receipt's channel, makes the sale with the receipt and the officer, attributes the act, refuses a number another sale holds and a purchase not awaiting payment; and the register's own
 * receipt act refuses a sale that was paid on the simulator, whatever number is typed.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, staffForAct: async () => ({ ok: true as const, actor: who.actor! }) };
});
vi.mock("@/app/_auth/act", async () => {
  const begin = await import("@/lib/auth/act-begin");
  const { attributeAct } = await import("@/lib/auth/attribution-store");
  const deps: import("@/lib/auth/act-begin").ActDeps = { now: () => new Date(), paperSignatureRecording: async () => null, stepUp: async () => ({ ok: false, message: "no step-up in this test" }), attribute: attributeAct };
  return {
    beginAct: (actor: StaffActor, data: FormData, key: string, o: Parameters<typeof begin.beginActWith>[4]) => begin.beginActWith(deps, actor, data, key, o),
    attributionRefusalState: begin.attributionRefusalState,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { takeSaleMode } from "./actions";
import { recordPurchaseReceipt, recordReceipt } from "./register-actions";

let organisationId = "";
let exerciseId = "";
let windowId = "";
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

async function officer() {
  const person = await makeAccount(organisationId, { admin: false });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...person, actor: read.actor as StaffActor };
}

/// A purchase awaiting payment by a fresh supplier.
async function awaiting() {
  const s = await makeSupplierAccount(organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
  return db.documentPurchase.create({ data: { organisationId, windowId, supplierId: s.supplier.id, buyerAccountId: s.account!.id, createdAt: new Date(), amount: "50.00", checks: [] } });
}

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `PR_${randomId()}`, name: "Purchase receipt", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
  const boss = await db.person.create({ data: { organisationId, name: `Requester ${randomId()}` } });
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `PR/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: boss.id, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: D(at(100)), estimatedValue: "1000.00", raisedOn: D(at(-5)) },
  });
  const ex = await db.sourcingExercise.create({
    data: { organisationId, reference: `PR/EX/${randomId()}`, requisitionId: requisition.id, title: "Pump house", estimatedValue: "1000.00", sourcingMethodCode: "M", status: "ADVERTISED", closingAt: at(30), saleMode: "ONLINE" },
  });
  exerciseId = ex.id;
  windowId = (await db.exerciseWindow.create({ data: { organisationId, exerciseId, path: "ADVERTISED", publishedAt: at(-2), advertisementDay: D(at(-2)), policySnapshot: { attendance: { mandatoryPermitted: true } }, purchaseFromDay: D(at(-1)), purchaseCloseDay: D(at(10)), feeAmount: "50.00" } })).id;
});

afterAll(async () => {
  await db.sourcingExercise.update({ where: { id: exerciseId }, data: { status: "CANCELLED" } });
});

describe("recording the finance receipt of an online purchase", () => {
  it("pays it with the receipt's channel, makes the sale with the receipt and the officer, and attributes the act", async () => {
    const o = await officer();
    who.actor = o.actor;
    const p = await awaiting();
    const number = `FIN-${randomId()}`;
    const out = await recordPurchaseReceipt({ ok: false }, form({ exerciseId, purchaseId: p.id, financeReceiptNo: number }));
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true });
    const after = await db.documentPurchase.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ state: "PAID", paidChannel: "FINANCE_RECEIPT", receiptRecordedByPersonId: o.person.id, paidReference: null });
    const sale = await db.documentSale.findUniqueOrThrow({ where: { purchaseId: p.id } });
    expect(sale).toMatchObject({ paymentChannel: "COUNTER", financeReceiptNo: number, issuedByPersonId: o.person.id });
    expect(isFinanceReceipt({ paymentChannel: sale.paymentChannel, financeReceiptNo: sale.financeReceiptNo, voidedAt: null })).toBe(true);
    // The act is attributed, as a counter sale's is.
    expect(await db.actAttribution.count({ where: { entity: "DocumentSale", entityId: sale.id, slot: "issuedBy" } })).toBe(1);
    // A second recording refuses: it is no longer awaiting payment.
    expect(await recordPurchaseReceipt({ ok: false }, form({ exerciseId, purchaseId: p.id, financeReceiptNo: `FIN-${randomId()}` }))).toMatchObject({ ok: false, message: expect.stringContaining("not awaiting payment") });
  });

  it("refuses a number another sale of the organisation holds, and a blank one, and writes nothing", async () => {
    const o = await officer();
    who.actor = o.actor;
    const first = await awaiting();
    const number = `FIN-${randomId()}`;
    await recordPurchaseReceipt({ ok: false }, form({ exerciseId, purchaseId: first.id, financeReceiptNo: number }));
    const second = await awaiting();
    const taken = await recordPurchaseReceipt({ ok: false }, form({ exerciseId, purchaseId: second.id, financeReceiptNo: number }));
    expect(taken).toMatchObject({ ok: false });
    expect(JSON.stringify(taken)).toMatch(/already|taken|another/i);
    const blank = await recordPurchaseReceipt({ ok: false }, form({ exerciseId, purchaseId: second.id, financeReceiptNo: " " }));
    expect(blank).toMatchObject({ ok: false });
    expect((await db.documentPurchase.findUniqueOrThrow({ where: { id: second.id } })).state).toBe("AWAITING_PAYMENT");
    expect(await db.documentSale.count({ where: { purchaseId: second.id } })).toBe(0);
  });

  it("the register's own receipt act refuses a sale paid on the simulator, whatever number is typed", async () => {
    const o = await officer();
    who.actor = o.actor;
    const p = await awaiting();
    const party = await db.exerciseParty.create({ data: { organisationId, exerciseId, source: "PURCHASER", name: "P", registrationNo: `RN-${randomId()}`, vendorId: p.supplierId } });
    // SR-10 review S8: the database refuses a PAID purchase with no sale by commit, so the purchase moves and its sale is made in one transaction, as markPurchasePaid does.
    const sale = await db.$transaction(async (tx) => {
      await tx.documentPurchase.update({ where: { id: p.id }, data: { state: "PAID", paidAt: new Date(), paidChannel: "SIMULATED", paidMethod: "Card", paidReference: "SIM-TEST" } });
      return tx.documentSale.create({ data: { organisationId, windowId, partyId: party.id, soldOn: D(new Date()), collectedBy: "x", authoritySighted: false, amount: "50.00", paymentMethod: "Simulated payment: Card", annotation: {}, paymentChannel: "SIMULATED", simulatedReference: "SIM-TEST", purchaseId: p.id } });
    });
    const out = await recordReceipt({ ok: false }, form({ exerciseId, saleId: sale.id, financeReceiptNo: `FIN-${randomId()}` }));
    expect(out).toMatchObject({ ok: false, message: expect.stringContaining("not a finance receipt") });
    expect((await db.documentSale.findUniqueOrThrow({ where: { id: sale.id } })).financeReceiptNo).toBeNull();
  });
});

describe("taking the organisation's setting for how the documents are sold (G1)", () => {
  it("pins an exercise whose pin is not set from the setting once, refuses while the setting is unset, and never changes a pin that is set", async () => {
    const o = await officer();
    who.actor = o.actor;
    const requisitionId = (await db.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId } })).requisitionId;
    const ex = await db.sourcingExercise.create({ data: { organisationId, reference: `PR/TK/${randomId()}`, requisitionId, title: "Unpinned", estimatedValue: "1000.00", sourcingMethodCode: "M", status: "DOCUMENTS_IN_PREPARATION" } });
    expect(ex.saleMode).toBeNull();
    await db.windowPolicy.upsert({ where: { organisationId }, create: { organisationId, documentSaleMode: null }, update: { documentSaleMode: null } });
    // Wording cut under 0005 (founder 2026-10-19, minimal words): "Sale mode not set" and "release online is not Yes"; the refusals are the same.
    const unset = await takeSaleMode({ ok: false }, form({ exerciseId: ex.id }));
    expect(unset).toMatchObject({ ok: false, message: expect.stringContaining("Sale mode not set") });
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).saleMode).toBeNull();
    // SR-10 review S3: an exercise does not take an online setting while the organisation's release of documents online is not Yes, so the release is set first.
    await db.windowPolicy.update({ where: { organisationId }, data: { documentSaleMode: "ONLINE", electronicDocumentRelease: null } });
    expect(await takeSaleMode({ ok: false }, form({ exerciseId: ex.id }))).toMatchObject({ ok: false, message: expect.stringContaining("release online is not") });
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).saleMode).toBeNull();
    await db.windowPolicy.update({ where: { organisationId }, data: { electronicDocumentRelease: true } });
    expect(await takeSaleMode({ ok: false }, form({ exerciseId: ex.id }))).toMatchObject({ ok: true });
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).saleMode).toBe("ONLINE");
    // A pin that is set is never changed, even when the setting has changed since.
    await db.windowPolicy.update({ where: { organisationId }, data: { documentSaleMode: "COUNTER" } });
    expect(await takeSaleMode({ ok: false }, form({ exerciseId: ex.id }))).toMatchObject({ ok: false, message: expect.stringContaining("already set") });
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).saleMode).toBe("ONLINE");
    expect(JSON.stringify((await db.auditEntry.findFirstOrThrow({ where: { entity: "SourcingExercise", entityId: ex.id }, orderBy: { at: "desc" } })).changes)).toContain("Online, through the supplier portal");
    await db.sourcingExercise.update({ where: { id: ex.id }, data: { status: "CANCELLED" } });
  });
});
