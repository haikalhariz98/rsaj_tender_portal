import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SupplierActor } from "@/lib/auth/types";
import { dayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { PAYMENT_SIMULATOR_ENV } from "@/lib/integration/payment-deployment";
import { liveSaleOf, restrictionFinding } from "@/lib/opening/findings";
import { registerRestrictionOf } from "@/lib/opening/restriction-read";
import { OPENING_SALE_SELECT, saleFactsOf } from "@/lib/opening/repo";
import { makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS } from "@/lib/test-db/auth-fixtures";
import { onlineRestrictionOfSale, saleChecks } from "@/lib/window/sale-checks";

import { settlePayment, startPurchase } from "./purchase-store";

/**
 * Ruling 17a, end to end against a real database: a RESTRICTED tender sold ONLINE. A supplier buys the documents and the restriction is read from the supplier register, never from a declared claim and
 * never from a sighting. At the purchase: refused (with the reason kept) while the evidence type is not set, nothing is lodged, or what is lodged is not verified or has expired; allowed with a warning when
 * it lapses before the closing. Paid on the simulator, the sale carries no sighting. At the opening the restriction is read from the register for the closing day: expired is NOT_EVIDENCED, a renewal
 * lodged and waiting is NOT_ASSESSED, and the renewal verified (or found not in order) settles it. A configuration gap is a fault.
 */

let organisationId: string;
let officerId: string;
let requisitionId: string;
let typeId: string;
let otherTypeId: string;
let exerciseId: string;
let windowId: string;
let closingDay: string;
let closingAt: Date;
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const ENV_BEFORE = process.env[PAYMENT_SIMULATOR_ENV];
const METHODS = ["Online banking (FPX)"];

async function supplier(): Promise<{ actor: SupplierActor; supplierId: string }> {
  const s = await makeSupplierAccount(organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
  const actor: SupplierActor = {
    kind: "SUPPLIER",
    accountId: s.account!.id,
    sessionId: `sess_${randomId()}`,
    contactId: s.contact.id,
    displayName: s.contact.name,
    supplierId: s.supplier.id,
    supplierName: s.supplier.registeredName,
    loginName: s.loginName,
    organisationId,
    organisationTimeZone: "Asia/Kuala_Lumpur",
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: null,
    mustChangePassword: false,
    resetNoticePending: false,
  };
  return { actor, supplierId: s.supplier.id };
}

const policy = (v: { type: string | null; closingDayCounts: boolean | null }) =>
  db.supplierPolicy.upsert({
    where: { organisationId },
    create: { organisationId, restrictionEvidenceTypeId: v.type, expiryOnClosingDayCounts: v.closingDayCounts },
    update: { restrictionEvidenceTypeId: v.type, expiryOnClosingDayCounts: v.closingDayCounts },
  });

let refSeq = 0;
const lodge = (supplierId: string, o: { type?: string; verification: "VERIFIED" | "NOT_CHECKED" | "NOT_IN_ORDER"; expiresInDays: number | null; expiresOnDay?: string; validFromDays?: number; lodgedDays?: number; supersedesId?: string; reference?: string }) =>
  db.supplierDocument.create({
    data: {
      organisationId,
      supplierId,
      typeId: o.type ?? typeId,
      typeLabelSnapshot: "Status certificate",
      reference: o.reference ?? `STA-${++refSeq}`,
      validFrom: D(at(o.validFromDays ?? -60)),
      expiresOn: o.expiresOnDay ? new Date(`${o.expiresOnDay}T00:00:00.000Z`) : o.expiresInDays == null ? null : D(at(o.expiresInDays)),
      lodgedOn: D(at(o.lodgedDays ?? -50)),
      recordedAt: new Date(),
      recordedByPersonId: officerId,
      supersedesId: o.supersedesId ?? null,
      verification: o.verification,
      ...(o.verification !== "NOT_CHECKED" ? { verifiedByPersonId: officerId, verifiedOn: D(at(-40)), verifiedAt: new Date(), verificationNote: "Checked." } : {}),
    },
  });

beforeAll(async () => {
  process.env[PAYMENT_SIMULATOR_ENV] = "true";
  organisationId = (await db.organisation.create({ data: { code: `RO_${randomId()}`, name: "Restricted online", timeZone: "Asia/Kuala_Lumpur" } })).id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  officerId = (await makePerson(organisationId, `Registrar ${randomId()}`)).id;
  requisitionId = (
    await db.requisition.create({
      data: { organisationId, reference: `RO/REQ/${randomId()}`, requestingUnitCode: "BID_DEPT", requestingPersonId: officerId, title: "Restricted online", justification: "Tests.", needStatement: "None.", costCentreCode: "BID_CC", accountCode: "BID_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "1000.00", raisedOn: D(at(-5)) },
    })
  ).id;
  typeId = (await db.supplierDocumentType.create({ data: { organisationId, code: `ro_cert_${randomId()}`, nameEn: "Status certificate", provenance: "ASSUMED", expires: true } })).id;
  otherTypeId = (await db.supplierDocumentType.create({ data: { organisationId, code: `ro_other_${randomId()}`, nameEn: "Tax clearance", provenance: "ASSUMED", expires: true } })).id;
  await db.windowPolicy.upsert({
    where: { organisationId },
    create: { organisationId, electronicDocumentRelease: true, paymentSimulatorOn: true, simulatedPaymentMethods: METHODS },
    update: { electronicDocumentRelease: true, paymentSimulatorOn: true, simulatedPaymentMethods: METHODS },
  });
  closingAt = at(30);
  closingDay = dayIn(closingAt, "Asia/Kuala_Lumpur");
  const ex = await db.sourcingExercise.create({
    data: { organisationId, reference: `RO/EX/${randomId()}`, requisitionId, title: "Restricted pump house", estimatedValue: "1000.00", sourcingMethodCode: "BID_METHOD", status: "ADVERTISED", closingAt, saleMode: "ONLINE", restrictedTender: true },
  });
  exerciseId = ex.id;
  windowId = (
    await db.exerciseWindow.create({
      data: { organisationId, exerciseId: ex.id, path: "ADVERTISED", publishedAt: at(-2), advertisementDay: D(at(-2)), policySnapshot: { attendance: { mandatoryPermitted: true } }, purchaseFromDay: D(at(-1)), purchaseCloseDay: D(at(10)), feeAmount: "50.00" },
    })
  ).id;
});

afterAll(async () => {
  if (ENV_BEFORE === undefined) delete process.env[PAYMENT_SIMULATOR_ENV];
  else process.env[PAYMENT_SIMULATOR_ENV] = ENV_BEFORE;
  await db.$disconnect();
});

const reasonsOf = (r: Awaited<ReturnType<typeof startPurchase>>) => (r.outcome === "REFUSED" ? r.reasons.join(" ") : "");

describe("17a: a restricted tender sold online, from purchase to the opened bid's finding", () => {
  it("is refused, with the reason kept, while the organisation has not set the evidence document", async () => {
    await policy({ type: null, closingDayCounts: true });
    const { actor } = await supplier();
    const r = await startPurchase(actor, { exerciseId });
    expect(r).toMatchObject({ outcome: "REFUSED", recorded: true });
    expect(reasonsOf(r)).toMatch(/has not set which document on the supplier register evidences/);
    const kept = await db.documentRequest.findMany({ where: { windowId, supplierId: actor.supplierId, refusedAt: { not: null } } });
    expect(kept).toHaveLength(1);
    expect(JSON.stringify(kept[0].checks)).toMatch(/has not set which document/);
    expect(await db.documentPurchase.count({ where: { windowId, supplierId: actor.supplierId } })).toBe(0);
  });

  it("is refused when nothing is lodged, and the declared claim is never read", async () => {
    await policy({ type: typeId, closingDayCounts: true });
    const { actor, supplierId } = await supplier();
    await db.supplier.update({ where: { id: supplierId }, data: { bumiputeraClaimCode: "BUMI" } });
    const r = await startPurchase(actor, { exerciseId });
    expect(r).toMatchObject({ outcome: "REFUSED", recorded: true });
    expect(reasonsOf(r)).toMatch(/no status document on the supplier register/);
  });

  it("is refused for a document of another type, one not yet verified, one found not in order and one that has expired", async () => {
    await policy({ type: typeId, closingDayCounts: true });
    const other = await supplier();
    await lodge(other.supplierId, { type: otherTypeId, verification: "VERIFIED", expiresInDays: 400 });
    expect(reasonsOf(await startPurchase(other.actor, { exerciseId }))).toMatch(/no status document/);
    const waiting = await supplier();
    await lodge(waiting.supplierId, { verification: "NOT_CHECKED", expiresInDays: 400 });
    expect(reasonsOf(await startPurchase(waiting.actor, { exerciseId }))).toMatch(/not been verified/);
    const bad = await supplier();
    await lodge(bad.supplierId, { verification: "NOT_IN_ORDER", expiresInDays: 400 });
    expect(reasonsOf(await startPurchase(bad.actor, { exerciseId }))).toMatch(/found not in order/);
    const expired = await supplier();
    await lodge(expired.supplierId, { verification: "VERIFIED", expiresInDays: -3 });
    expect(reasonsOf(await startPurchase(expired.actor, { exerciseId }))).toMatch(/has expired/);
    for (const s of [other, waiting, bad, expired]) expect(await db.documentPurchase.count({ where: { windowId, supplierId: s.supplierId } })).toBe(0);
  });

  it("a verified document in force through the closing day lets the purchase through, with no warning, and the finding at the opening is EVIDENCED", async () => {
    await policy({ type: typeId, closingDayCounts: true });
    const { actor, supplierId } = await supplier();
    const doc = await lodge(supplierId, { verification: "VERIFIED", expiresInDays: 400, reference: "STA-GOOD" });
    const made = await startPurchase(actor, { exerciseId });
    expect(made.outcome).toBe("MADE");
    const purchase = await db.documentPurchase.findFirstOrThrow({ where: { windowId, supplierId } });
    const restriction = (purchase.checks as { key: string; state: string; detail: string }[]).find((c) => c.key === "RESTRICTION");
    expect(restriction).toMatchObject({ state: "PASS" });
    expect(restriction!.detail).toMatch(/Verified on the supplier register: your document STA-GOOD/);
    const paid = await settlePayment(actor, { exerciseId, method: METHODS[0], choice: "PAY" });
    expect(paid.outcome).toBe("PAID");

    // The sale made from the purchase carries no sighting, and the sale register says where the restriction was read.
    const sale = await db.documentSale.findFirstOrThrow({ where: { windowId, purchaseId: purchase.id } });
    expect(sale.restrictionCertSighted).toBeNull();
    expect(sale.restrictionCertValidUntil).toBeNull();
    const rows = saleChecks({ authoritySighted: false, certSighted: null, certValidUntil: null, registrationCheck: "CLEAR", suspensionCheck: "CLEAR", registerReadOn: ymd(new Date()), noSupplierNamed: false, onlineRestriction: onlineRestrictionOfSale(sale.eligibilitySnapshot, purchase.checks) }, closingDay);
    // Review of 17a (finding 7): the staff register speaks of the supplier, from the reading frozen on the sale, never in the buyer's "your".
    expect(rows.find((r) => r.text.startsWith("Restriction"))?.text).toMatch(/Verified on the supplier register: the supplier's document STA-GOOD/);

    // The opening reads the sale as it reads it from the window, and the restriction from the register for the closing day.
    const sales = (await db.documentSale.findMany({ where: { windowId }, select: OPENING_SALE_SELECT })).map(saleFactsOf);
    const live = liveSaleOf(sale.partyId, sales);
    expect(live?.purchaseSupplierId).toBe(supplierId);
    // The counter's reading of this sale would find NOT_EVIDENCED (no sighting): this is why the register is read instead.
    expect(restrictionFinding(true, live, closingDay)).toEqual({ finding: "NOT_EVIDENCED" });
    const read = await db.$transaction((tx) => registerRestrictionOf(tx, { id: organisationId, timeZone: "Asia/Kuala_Lumpur" }, { day: closingDay, at: closingAt }, live!.purchaseSupplierId!, new Date()));
    expect(read).toMatchObject({ finding: "EVIDENCED", reading: { source: "SUPPLIER_REGISTER", finding: "EVIDENCED", reason: "COVERS_CLOSING_DAY", closingDay, document: { id: doc.id, reference: "STA-GOOD" } } });
  });

  it("a document that lapses before the closing day is allowed with a warning, then NOT_EVIDENCED at the opening, NOT_ASSESSED while a renewal waits, and settled by its verification", async () => {
    await policy({ type: typeId, closingDayCounts: true });
    const { actor, supplierId } = await supplier();
    const old = await lodge(supplierId, { verification: "VERIFIED", expiresInDays: 20, reference: "STA-OLD" });
    expect((await startPurchase(actor, { exerciseId })).outcome).toBe("MADE");
    const purchase = await db.documentPurchase.findFirstOrThrow({ where: { windowId, supplierId } });
    const restriction = (purchase.checks as { key: string; state: string; detail: string }[]).find((c) => c.key === "RESTRICTION");
    expect(restriction).toMatchObject({ state: "WARN" });
    expect(restriction!.detail).toMatch(/renewal must be lodged and verified by an officer before the closing day/);
    await settlePayment(actor, { exerciseId, method: METHODS[0], choice: "PAY" });

    const org = { id: organisationId, timeZone: "Asia/Kuala_Lumpur" };
    const readNow = () => db.$transaction((tx) => registerRestrictionOf(tx, org, { day: closingDay, at: closingAt }, supplierId, new Date()));
    expect(await readNow()).toMatchObject({ finding: "NOT_EVIDENCED", reading: { reason: "EXPIRED_BEFORE_CLOSING", document: { reference: "STA-OLD" } } });

    // A renewal lodged by the closing day and waiting for its check: not assessed, and it stays so each time the reading is taken again.
    const renewal = await lodge(supplierId, { verification: "NOT_CHECKED", expiresInDays: 700, validFromDays: 21, lodgedDays: 0, supersedesId: old.id, reference: "STA-NEW" });
    expect(await readNow()).toMatchObject({ finding: "NOT_ASSESSED", reading: { reason: "RENEWAL_NOT_VERIFIED" } });
    expect(await readNow()).toMatchObject({ finding: "NOT_ASSESSED" });

    // Verified: evidenced, and the opening can finish.
    await db.supplierDocument.update({ where: { id: renewal.id }, data: { verification: "VERIFIED", verifiedByPersonId: officerId, verifiedOn: D(new Date()), verifiedAt: new Date() } });
    expect(await readNow()).toMatchObject({ finding: "EVIDENCED", reading: { reason: "COVERS_CLOSING_DAY", document: { reference: "STA-NEW" } } });
  });

  it("a renewal found not in order ends the wait as NOT_EVIDENCED", async () => {
    await policy({ type: typeId, closingDayCounts: true });
    const { supplierId } = await supplier();
    const old = await lodge(supplierId, { verification: "VERIFIED", expiresInDays: 20 });
    const renewal = await lodge(supplierId, { verification: "NOT_CHECKED", expiresInDays: 700, validFromDays: 21, lodgedDays: 0, supersedesId: old.id });
    const org = { id: organisationId, timeZone: "Asia/Kuala_Lumpur" };
    const readNow = () => db.$transaction((tx) => registerRestrictionOf(tx, org, { day: closingDay, at: closingAt }, supplierId, new Date()));
    expect(await readNow()).toMatchObject({ finding: "NOT_ASSESSED" });
    await db.supplierDocument.update({ where: { id: renewal.id }, data: { verification: "NOT_IN_ORDER", verificationNote: "Not legible.", verifiedByPersonId: officerId, verifiedOn: D(new Date()), verifiedAt: new Date() } });
    expect(await readNow()).toMatchObject({ finding: "NOT_EVIDENCED", reading: { reason: "EXPIRED_BEFORE_CLOSING" } });
  });

  it("a configuration gap at the opening is a blocking fault in the opening's own words, never a finding", async () => {
    const { supplierId } = await supplier();
    await lodge(supplierId, { verification: "VERIFIED", expiresInDays: null, expiresOnDay: closingDay });
    const org = { id: organisationId, timeZone: "Asia/Kuala_Lumpur" };
    const readNow = () => db.$transaction((tx) => registerRestrictionOf(tx, org, { day: closingDay, at: closingAt }, supplierId, new Date()));
    await policy({ type: null, closingDayCounts: true });
    expect(await readNow()).toEqual({ fault: { code: "RESTRICTION_EVIDENCE_TYPE_NOT_SET", level: "block" } });
    // Expiring on the closing day itself with the closing-day rule unset cannot be judged.
    await policy({ type: typeId, closingDayCounts: null });
    expect(await readNow()).toEqual({ fault: { code: "RESTRICTION_CLOSING_DAY_RULE_NOT_SET", level: "block" } });
    // The closing day cannot be told without the organisation's time zone: a fault, not a reading on an empty day.
    expect(await db.$transaction((tx) => registerRestrictionOf(tx, org, { day: null, at: closingAt }, supplierId, new Date()))).toEqual({ fault: { code: "TIME_ZONE_NOT_SET", level: "block" } });
  });

  it("the database holds the new finding, so an opened bid can freeze it", async () => {
    const rows = await db.$queryRaw<{ v: string }[]>`SELECT 'NOT_ASSESSED'::"RestrictionFinding"::text AS v`;
    expect(rows[0].v).toBe("NOT_ASSESSED");
    const col = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'OpenedBid' AND column_name = 'restrictionReading'`;
    expect(col[0].n).toBe(1);
  });
});
