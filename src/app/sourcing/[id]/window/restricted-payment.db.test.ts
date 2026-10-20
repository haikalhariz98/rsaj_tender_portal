import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { PAYMENT_SIMULATOR_ENV } from "@/lib/integration/payment-deployment";
import { BidRefused } from "@/lib/portal/bids/types";
import { settlePayment, startPurchase } from "@/lib/portal/bids/purchase-store";
import { facts, makeAccount, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS } from "@/lib/test-db/auth-fixtures";
import { onlineRestrictionOfSale } from "@/lib/window/sale-checks";

/**
 * Review of ruling 17a, finding 4: the supplier register is read again at payment, on the supplier row the payment already locks, by both writers of "paid" (the simulator and the officer's finance
 * receipt). A document that has stopped being in force between the purchase and the payment refuses the payment in words, and a payment that goes through freezes the structured reading on the sale
 * and puts the restriction, a warning included, in the trail of the sale and of the purchase.
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

import { recordPurchaseReceipt } from "./register-actions";

const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const ENV_BEFORE = process.env[PAYMENT_SIMULATOR_ENV];
const METHODS = ["Online banking (FPX)"];
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

let organisationId = "";
let exerciseId = "";
let windowId = "";
let typeId = "";
let personId = "";
let refSeq = 0;

async function staff() {
  const person = await makeAccount(organisationId, { admin: false });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...person, actor: read.actor as StaffActor };
}

async function buyer(docExpiresInDays: number) {
  const s = await makeSupplierAccount(organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
  const actor: SupplierActor = {
    kind: "SUPPLIER", accountId: s.account!.id, sessionId: `sess_${randomId()}`, contactId: s.contact.id, displayName: s.contact.name, supplierId: s.supplier.id, supplierName: s.supplier.registeredName, loginName: s.loginName,
    organisationId, organisationTimeZone: "Asia/Kuala_Lumpur", stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false, resetNoticePending: false,
  };
  const doc = await db.supplierDocument.create({
    data: {
      organisationId, supplierId: s.supplier.id, typeId, typeLabelSnapshot: "Status certificate", reference: `STA-${++refSeq}`, validFrom: D(at(-60)), expiresOn: D(at(docExpiresInDays)), lodgedOn: D(at(-50)), recordedAt: new Date(),
      recordedByPersonId: personId, verification: "VERIFIED", verifiedByPersonId: personId, verifiedOn: D(at(-40)), verifiedAt: new Date(), verificationNote: "Checked.",
    },
  });
  expect((await startPurchase(actor, { exerciseId })).outcome).toBe("MADE");
  const purchase = await db.documentPurchase.findFirstOrThrow({ where: { windowId, supplierId: s.supplier.id } });
  return { actor, supplierId: s.supplier.id, doc, purchase };
}

const wordsOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (e) {
    if (e instanceof BidRefused) return String((e.faults[0]?.data as { words?: string } | undefined)?.words ?? e.message);
    throw e;
  }
  return null;
};

beforeAll(async () => {
  process.env[PAYMENT_SIMULATOR_ENV] = "true";
  organisationId = (await db.organisation.create({ data: { code: `RP_${randomId()}`, name: "Restricted payment", timeZone: "Asia/Kuala_Lumpur" } })).id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  personId = (await db.person.create({ data: { organisationId, name: `Registrar ${randomId()}` } })).id;
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `RP/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: personId, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: D(at(100)), estimatedValue: "1000.00", raisedOn: D(at(-5)) },
  });
  typeId = (await db.supplierDocumentType.create({ data: { organisationId, code: `rp_cert_${randomId()}`, nameEn: "Status certificate", provenance: "ASSUMED", expires: true } })).id;
  await db.supplierPolicy.upsert({ where: { organisationId }, create: { organisationId, restrictionEvidenceTypeId: typeId, expiryOnClosingDayCounts: true }, update: { restrictionEvidenceTypeId: typeId, expiryOnClosingDayCounts: true } });
  await db.windowPolicy.upsert({
    where: { organisationId },
    create: { organisationId, electronicDocumentRelease: true, paymentSimulatorOn: true, simulatedPaymentMethods: METHODS },
    update: { electronicDocumentRelease: true, paymentSimulatorOn: true, simulatedPaymentMethods: METHODS },
  });
  const ex = await db.sourcingExercise.create({
    data: { organisationId, reference: `RP/EX/${randomId()}`, requisitionId: requisition.id, title: "Restricted pump house", estimatedValue: "1000.00", sourcingMethodCode: "M", status: "ADVERTISED", closingAt: at(30), saleMode: "ONLINE", restrictedTender: true },
  });
  exerciseId = ex.id;
  windowId = (await db.exerciseWindow.create({ data: { organisationId, exerciseId, path: "ADVERTISED", publishedAt: at(-2), advertisementDay: D(at(-2)), policySnapshot: { attendance: { mandatoryPermitted: true } }, purchaseFromDay: D(at(-1)), purchaseCloseDay: D(at(10)), feeAmount: "50.00" } })).id;
});

afterAll(async () => {
  await db.sourcingExercise.update({ where: { id: exerciseId }, data: { status: "CANCELLED" } });
  if (ENV_BEFORE === undefined) delete process.env[PAYMENT_SIMULATOR_ENV];
  else process.env[PAYMENT_SIMULATOR_ENV] = ENV_BEFORE;
  await db.$disconnect();
});

const trail = (entityId: string) => db.auditEntry.findMany({ where: { entityId }, orderBy: { at: "asc" } });

describe("review of 17a (finding 4): the register is read again when the purchase is paid", () => {
  it("a simulated payment is refused, in the buyer's words, when the document was found not in order since the purchase, and nothing is written", async () => {
    const b = await buyer(400);
    await db.supplierDocument.update({ where: { id: b.doc.id }, data: { verification: "NOT_IN_ORDER", verificationNote: "Illegible." } });
    const words = await wordsOf(() => settlePayment(b.actor, { exerciseId, method: METHODS[0], choice: "PAY" }));
    expect(words).toMatch(/found not in order/);
    // Wording cut under 0005 (founder 2026-10-19): the buyer is still sent to their own Company page.
    expect(words).toMatch(/Lodge a corrected one under Company/);
    expect((await db.documentPurchase.findUniqueOrThrow({ where: { id: b.purchase.id } })).state).toBe("AWAITING_PAYMENT");
    expect(await db.documentSale.count({ where: { purchaseId: b.purchase.id } })).toBe(0);
    expect(await db.paymentAttempt.count({ where: { purchaseId: b.purchase.id } })).toBe(0);
  });

  it("an officer's finance receipt is refused, in the officer's words, when the document has since expired", async () => {
    const o = await staff();
    who.actor = o.actor;
    const b = await buyer(400);
    await db.supplierDocument.update({ where: { id: b.doc.id }, data: { expiresOn: D(at(-2)) } });
    const out = await recordPurchaseReceipt({ ok: false }, form({ exerciseId, purchaseId: b.purchase.id, financeReceiptNo: `FIN-${randomId()}` }));
    expect(out).toMatchObject({ ok: false });
    expect(out.message).toMatch(/^Not recorded: /);
    expect(out.message).toMatch(/the supplier's status document/);
    expect(out.message).not.toMatch(/\byour\b/);
    expect((await db.documentPurchase.findUniqueOrThrow({ where: { id: b.purchase.id } })).state).toBe("AWAITING_PAYMENT");
    expect(await db.documentSale.count({ where: { purchaseId: b.purchase.id } })).toBe(0);
  });

  it("a payment that goes through freezes the structured reading on the sale, with the warning, and puts it in the trail of the sale and of the purchase", async () => {
    // Lapses before the closing day (30 days away): allowed with a warning.
    const b = await buyer(20);
    expect((await settlePayment(b.actor, { exerciseId, method: METHODS[0], choice: "PAY" })).outcome).toBe("PAID");
    const sale = await db.documentSale.findFirstOrThrow({ where: { purchaseId: b.purchase.id } });
    const snapshot = sale.eligibilitySnapshot as { restriction?: { source: string; document: { id: string; reference: string }; lapses: { kind: string } | null }; verdict?: string } | null;
    expect(snapshot?.restriction).toMatchObject({ source: "SUPPLIER_REGISTER", document: { id: b.doc.id }, lapses: { kind: "BEFORE_CLOSING" } });
    // The register's own reading stays on the snapshot beside it.
    expect(snapshot?.verdict).toBeDefined();
    // The staff register is told in the staff's words, from the frozen reading.
    const shown = onlineRestrictionOfSale(sale.eligibilitySnapshot, b.purchase.checks);
    expect(shown?.warn).toBe(true);
    expect(shown?.text).toMatch(/Verified on the supplier register: the supplier's document STA-/);
    expect(shown?.text).not.toMatch(/\byour\b/);
    // A sale paid before the reading was kept falls back to the purchase's own check and says only that it was verified.
    expect(onlineRestrictionOfSale({}, b.purchase.checks)?.text).toMatch(/Verified on the register at purchase/);

    const saleTrail = JSON.stringify((await trail(sale.id)).map((x) => x.changes));
    expect(saleTrail).toMatch(/Warning\. [^"]*Verified on the supplier register: the supplier's document/);
    const purchaseTrail = (await trail(b.purchase.id)).find((x) => x.action === "CREATE");
    expect(JSON.stringify(purchaseTrail?.changes)).toMatch(/Warning\. [^"]*Verified on the supplier register: the supplier's document/);
  });

  it("an officer's receipt on a purchase whose document is still in force goes through and freezes the same reading", async () => {
    const o = await staff();
    who.actor = o.actor;
    const b = await buyer(400);
    const out = await recordPurchaseReceipt({ ok: false }, form({ exerciseId, purchaseId: b.purchase.id, financeReceiptNo: `FIN-${randomId()}` }));
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true });
    const sale = await db.documentSale.findFirstOrThrow({ where: { purchaseId: b.purchase.id } });
    expect((sale.eligibilitySnapshot as { restriction?: { lapses: unknown } }).restriction).toMatchObject({ lapses: null });
    expect(onlineRestrictionOfSale(sale.eligibilitySnapshot, b.purchase.checks)?.warn).toBe(false);
  });
});
