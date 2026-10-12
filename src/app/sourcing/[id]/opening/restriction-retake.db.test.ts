import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { PAYMENT_SIMULATOR_ENV } from "@/lib/integration/payment-deployment";
import { settlePayment, startPurchase } from "@/lib/portal/bids/purchase-store";
import { facts, makeAccount, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS } from "@/lib/test-db/auth-fixtures";

/**
 * Review of ruling 17a, finding 1 (the opening could wait for ever), driven through the real server actions against the scratch database: open an online buyer's envelope while its renewal waits
 * (NOT_ASSESSED), the deployment then stops allowing the simulator the sale was paid on (so the sale no longer reads as live), the renewal is verified, and the verdict and the finalising still go through.
 * Also the configuration frozen with the first reading (finding 3), a refused act that writes no retake (finding 2) and a bid whose supplier cannot be found (settled, never held).
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

import { finaliseOpening, openEnvelope, recordInitial, recordScheduleDetails, recordVerdict } from "./actions";

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
let requisitionId = "";
let typeId = "";
let committeeId = "";
let closingAt: Date;
let refSeq = 0;
const timeZone = "Asia/Kuala_Lumpur";

async function staff() {
  const person = await makeAccount(organisationId, { admin: false });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...person, actor: read.actor as StaffActor };
}

const policy = (v: { type: string | null; closingDayCounts: boolean | null }) =>
  db.supplierPolicy.upsert({
    where: { organisationId },
    create: { organisationId, restrictionEvidenceTypeId: v.type, expiryOnClosingDayCounts: v.closingDayCounts },
    update: { restrictionEvidenceTypeId: v.type, expiryOnClosingDayCounts: v.closingDayCounts },
  });

async function lodge(supplierId: string, personId: string, o: { type?: string; verification: "VERIFIED" | "NOT_CHECKED" | "NOT_IN_ORDER"; expiresInDays: number; validFromDays?: number; supersedesId?: string; reference?: string }) {
  return db.supplierDocument.create({
    data: {
      organisationId, supplierId, typeId: o.type ?? typeId, typeLabelSnapshot: "Status certificate", reference: o.reference ?? `STA-${++refSeq}`,
      validFrom: D(at(o.validFromDays ?? -60)), expiresOn: D(at(o.expiresInDays)), lodgedOn: D(new Date()), recordedAt: new Date(), recordedByPersonId: personId, supersedesId: o.supersedesId ?? null, verification: o.verification,
      ...(o.verification !== "NOT_CHECKED" ? { verifiedByPersonId: personId, verifiedOn: D(at(-40)), verifiedAt: new Date(), verificationNote: "Checked." } : {}),
    },
  });
}

/// An exercise sold online, restricted, with an opening that is under way: two panel members present and both authorised, the box opened.
async function openingOn(officer: { person: { id: string } }, second: { person: { id: string } }) {
  const ex = await db.sourcingExercise.create({
    data: { organisationId, reference: `RT/EX/${randomId()}`, requisitionId, title: "Restricted retake", estimatedValue: "1000.00", sourcingMethodCode: "BID_METHOD", status: "ADVERTISED", closingAt, saleMode: "ONLINE", restrictedTender: true },
  });
  const window = await db.exerciseWindow.create({
    data: { organisationId, exerciseId: ex.id, path: "ADVERTISED", publishedAt: at(-2), advertisementDay: D(at(-2)), policySnapshot: { attendance: { mandatoryPermitted: true } }, purchaseFromDay: D(at(-1)), purchaseCloseDay: D(at(10)), feeAmount: "50.00" },
  });
  return { ex, window, officer, second };
}

async function startedOpening(e: Awaited<ReturnType<typeof openingOn>>) {
  const opening = await db.opening.create({
    data: {
      organisationId, exerciseId: e.ex.id, kind: "MAIN", sequenceNo: 1, committeeId, committeeNameSnapshot: "Opening committee", startedAt: new Date(), startedByPersonId: e.officer.person.id, unsealedAt: new Date(),
      checklistSnapshot: { items: [], notJudged: [], notReturned: [] },
      policySnapshot: { completeness: { eliminates: true, provenance: "STATED", source: "TEST" }, unpurchased: { consequence: "ELIMINATE", provenance: "STATED" }, minimumBids: { value: null, provenance: null }, alternativesPermitted: false, restrictedTender: true, path: "ADVERTISED", estimate: { requires: false, provenance: "STATED" }, invited: { reading: "PURCHASERS", provenance: "STATED" } },
    },
  });
  await db.openingSitting.create({ data: { organisationId, openingId: opening.id, sittingNo: 1, startedAt: new Date(), recordedByPersonId: e.officer.person.id } });
  for (const p of [e.officer, e.second]) {
    const seat = await db.openingPanelMember.create({ data: { organisationId, openingId: opening.id, personId: p.person.id, seatLabelSnapshot: "Member", present: true } });
    await db.openingAuthorisation.create({ data: { organisationId, openingId: opening.id, personId: p.person.id, panelMemberId: seat.id, sittingNo: 1, recordedAt: new Date() } });
    await db.openingSignature.create({ data: { organisationId, openingId: opening.id, personId: p.person.id, panelMemberId: seat.id, signedOn: D(new Date()), recordedAt: new Date() } });
  }
  await db.sourcingExercise.update({ where: { id: e.ex.id }, data: { status: "OPENING_IN_PROGRESS" } });
  return opening;
}

/// The buyer: bought and paid on the simulator, its partner on the exercise made by the payment.
async function buyerOf(e: Awaited<ReturnType<typeof openingOn>>, docs: (supplierId: string) => Promise<void>) {
  const s = await makeSupplierAccount(organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
  const actor: SupplierActor = {
    kind: "SUPPLIER", accountId: s.account!.id, sessionId: `sess_${randomId()}`, contactId: s.contact.id, displayName: s.contact.name, supplierId: s.supplier.id, supplierName: s.supplier.registeredName, loginName: s.loginName,
    organisationId, organisationTimeZone: timeZone, stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false, resetNoticePending: false,
  };
  await docs(s.supplier.id);
  expect((await startPurchase(actor, { exerciseId: e.ex.id })).outcome).toBe("MADE");
  expect((await settlePayment(actor, { exerciseId: e.ex.id, method: METHODS[0], choice: "PAY" })).outcome).toBe("PAID");
  const sale = await db.documentSale.findFirstOrThrow({ where: { windowId: e.window.id, purchase: { supplierId: s.supplier.id } } });
  const envelope = await db.bidEnvelope.create({
    data: { organisationId, exerciseId: e.ex.id, sequence: 1 + (await db.bidEnvelope.count({ where: { exerciseId: e.ex.id } })), kind: "BID", channel: "COUNTER", receivedAt: at(-1), receivedSource: "SERVER", receivedByPersonId: e.officer.person.id, markings: "Sealed", late: false, closingAtJudged: closingAt, recordedAfterClosing: false },
  });
  return { supplierId: s.supplier.id, partyId: sale.partyId, envelopeId: envelope.id, name: s.supplier.registeredName, registrationNo: s.supplier.registrationNo };
}

const open = (openingId: string, exerciseId: string, b: { partyId: string; envelopeId: string; name: string; registrationNo: string }) =>
  openEnvelope({ ok: false }, form({ exerciseId, openingId, envelopeId: b.envelopeId, partyId: b.partyId, bidderName: b.name, registrationNo: b.registrationNo, registrationClass: "Grade 5", registrationStatus: "Active", price: "1000.00", periodValue: "3", periodUnit: "MONTHS", validityDays: "90" }));

beforeAll(async () => {
  process.env[PAYMENT_SIMULATOR_ENV] = "true";
  organisationId = (await db.organisation.create({ data: { code: `RT_${randomId()}`, name: "Restriction retake", timeZone } })).id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  const requester = await db.person.create({ data: { organisationId, name: `Requester ${randomId()}` } });
  requisitionId = (
    await db.requisition.create({
      data: { organisationId, reference: `RT/REQ/${randomId()}`, requestingUnitCode: "BID_DEPT", requestingPersonId: requester.id, title: "Retake", justification: "Tests.", needStatement: "None.", costCentreCode: "BID_CC", accountCode: "BID_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "1000.00", raisedOn: D(at(-5)) },
    })
  ).id;
  typeId = (await db.supplierDocumentType.create({ data: { organisationId, code: `rt_cert_${randomId()}`, nameEn: "Status certificate", provenance: "ASSUMED", expires: true } })).id;
  committeeId = (await db.committee.create({ data: { organisationId, code: `RT_C_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "A test" } })).id;
  await db.windowPolicy.upsert({
    where: { organisationId },
    create: { organisationId, electronicDocumentRelease: true, paymentSimulatorOn: true, simulatedPaymentMethods: METHODS },
    update: { electronicDocumentRelease: true, paymentSimulatorOn: true, simulatedPaymentMethods: METHODS },
  });
  closingAt = at(30);
});

afterAll(async () => {
  if (ENV_BEFORE === undefined) delete process.env[PAYMENT_SIMULATOR_ENV];
  else process.env[PAYMENT_SIMULATOR_ENV] = ENV_BEFORE;
  await db.$disconnect();
});

const auditsOf = (bidId: string) => db.auditEntry.findMany({ where: { entityId: bidId }, orderBy: { at: "asc" } });

beforeEach(() => {
  process.env[PAYMENT_SIMULATOR_ENV] = "true";
});

describe("review of 17a: the opening of an online buyer whose renewal waits, to the end", () => {
  it("opens as NOT_ASSESSED, reads the same supplier again when the simulator is no longer allowed, and finalises once the renewal is verified", async () => {
    await policy({ type: typeId, closingDayCounts: true });
    const a = await staff();
    const b = await staff();
    who.actor = a.actor;
    const e = await openingOn(a, b);
    const buyer = await buyerOf(e, async (supplierId) => {
      await lodge(supplierId, a.person.id, { verification: "VERIFIED", expiresInDays: 20, reference: "STA-OLD" });
    });
    // The old certificate lapses before the closing; the renewal is lodged now and waits for its check.
    const renewal = await lodge(buyer.supplierId, a.person.id, { verification: "NOT_CHECKED", expiresInDays: 700, validFromDays: 21, reference: "STA-NEW" });
    const opening = await startedOpening(e);

    const opened = await open(opening.id, e.ex.id, buyer);
    expect(opened, JSON.stringify(opened)).toMatchObject({ ok: true });
    const bid = await db.openedBid.findFirstOrThrow({ where: { openingId: opening.id } });
    expect(bid.restrictionFinding).toBe("NOT_ASSESSED");
    // Frozen with the first reading: the supplier, the document type, the closing-day rule and the closing time.
    expect(bid.restrictionReading).toMatchObject({ supplierId: buyer.supplierId, evidenceTypeId: typeId, closingDayCounts: true, closingTime: closingAt.toISOString(), reason: "RENEWAL_NOT_VERIFIED" });

    // A verdict now, while the renewal waits, is refused in words and says the reading was taken again.
    const waiting = await recordVerdict({ ok: false }, form({ exerciseId: e.ex.id, openedBidId: bid.id, verdict: "PASS" }));
    expect(waiting).toMatchObject({ ok: false });
    expect(waiting.message).toMatch(/not assessed/i);
    expect(waiting.message).toMatch(/read again from the supplier register and the new reading is saved/);
    expect(waiting.message).not.toMatch(/Nothing was saved/);

    // The officer's own initial reads it again too (nothing changed: still not assessed), and is audited.
    who.actor = b.actor;
    expect(await recordInitial({ ok: false }, form({ exerciseId: e.ex.id, openedBidId: bid.id }))).toMatchObject({ ok: true });
    who.actor = a.actor;
    expect(await recordInitial({ ok: false }, form({ exerciseId: e.ex.id, openedBidId: bid.id }))).toMatchObject({ ok: true });

    // The configuration changes meanwhile (finding 3): the evidence type is cleared and the closing-day rule flipped. This opening goes on under the rule it started with.
    await policy({ type: null, closingDayCounts: false });
    // The deployment stops allowing the simulator (finding 1): the sale the buyer paid on it no longer reads as live, so the supplier can no longer be found through the sale.
    process.env[PAYMENT_SIMULATOR_ENV] = "false";
    // And the renewal is verified.
    await db.supplierDocument.update({ where: { id: renewal.id }, data: { verification: "VERIFIED", verifiedByPersonId: a.person.id, verifiedOn: D(new Date()), verifiedAt: new Date() } });

    // A verdict refused for want of a reason after the reading was taken again keeps the reading and says so (finding 2).
    const noReason = await recordVerdict({ ok: false }, form({ exerciseId: e.ex.id, openedBidId: bid.id, verdict: "REJECT", verdictReason: "" }));
    expect(noReason).toMatchObject({ ok: false });
    const retaken = await db.openedBid.findUniqueOrThrow({ where: { id: bid.id } });
    expect(retaken.restrictionFinding).toBe("EVIDENCED");
    expect(retaken.restrictionReading).toMatchObject({ reason: "COVERS_CLOSING_DAY", supplierId: buyer.supplierId, evidenceTypeId: typeId, document: { reference: "STA-NEW" } });
    expect(noReason.message ?? "").toMatch(/read again from the supplier register and the new reading is saved/);

    const verdict = await recordVerdict({ ok: false }, form({ exerciseId: e.ex.id, openedBidId: bid.id, verdict: "PASS" }));
    expect(verdict, JSON.stringify(verdict)).toMatchObject({ ok: true });
    expect((await db.openedBid.findUniqueOrThrow({ where: { id: bid.id } })).verdict).toBe("PASS");

    expect(await recordScheduleDetails({ ok: false }, form({ exerciseId: e.ex.id, openingId: opening.id, schedulePages: "2", minutes: "" }))).toMatchObject({ ok: true });
    const done = await finaliseOpening({ ok: false }, form({ exerciseId: e.ex.id, openingId: opening.id, paperCopy: "notInBox" }));
    expect(done, JSON.stringify(done)).toMatchObject({ ok: true });
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).not.toBeNull();

    // Every retake is audited on the offer, with the words of the reading it replaced.
    const trail = (await auditsOf(bid.id)).filter((x) => JSON.stringify(x.changes).includes("Read again from the supplier register"));
    expect(trail.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(trail.at(-1)!.changes)).toMatch(/Verified on the supplier register: document STA-NEW/);

    // Nothing is retaken once the opening is finalised (finding 2): a retake on it writes nothing and reports the finding as it stands.
    const before = (await auditsOf(bid.id)).length;
    expect(await recordInitial({ ok: false }, form({ exerciseId: e.ex.id, openedBidId: bid.id }))).toMatchObject({ ok: false });
    expect((await auditsOf(bid.id)).length).toBe(before);
    process.env[PAYMENT_SIMULATOR_ENV] = "true";
  });

  it("settles NOT_EVIDENCED, with its reason, where no supplier can be found, so the verdict is not refused for ever", async () => {
    await policy({ type: typeId, closingDayCounts: true });
    const a = await staff();
    const b = await staff();
    who.actor = a.actor;
    const e = await openingOn(a, b);
    const buyer = await buyerOf(e, async (supplierId) => {
      await lodge(supplierId, a.person.id, { verification: "VERIFIED", expiresInDays: 20 });
      await lodge(supplierId, a.person.id, { verification: "NOT_CHECKED", expiresInDays: 700, validFromDays: 21 });
    });
    const opening = await startedOpening(e);
    expect(await open(opening.id, e.ex.id, buyer)).toMatchObject({ ok: true });
    const bid = await db.openedBid.findFirstOrThrow({ where: { openingId: opening.id } });
    expect(bid.restrictionFinding).toBe("NOT_ASSESSED");
    // A reading frozen without its supplier, and the sale no longer live: nothing to read the register by.
    const { supplierId: _gone, ...rest } = bid.restrictionReading as Record<string, unknown>;
    void _gone;
    await db.openedBid.update({ where: { id: bid.id }, data: { restrictionReading: rest as never } });
    process.env[PAYMENT_SIMULATOR_ENV] = "false";
    const verdict = await recordVerdict({ ok: false }, form({ exerciseId: e.ex.id, openedBidId: bid.id, verdict: "REJECT", verdictReason: "Restriction not evidenced." }));
    process.env[PAYMENT_SIMULATOR_ENV] = "true";
    expect(verdict, JSON.stringify(verdict)).toMatchObject({ ok: true });
    const after = await db.openedBid.findUniqueOrThrow({ where: { id: bid.id } });
    expect(after).toMatchObject({ restrictionFinding: "NOT_EVIDENCED", verdict: "REJECT" });
    expect(after.restrictionReading).toMatchObject({ reason: "SUPPLIER_NOT_FOUND", finding: "NOT_EVIDENCED" });
  });

  it("an act the opening refuses writes no retake: a verdict on a finalised opening is refused before anything is read", async () => {
    await policy({ type: typeId, closingDayCounts: true });
    const a = await staff();
    const b = await staff();
    who.actor = a.actor;
    const e = await openingOn(a, b);
    const buyer = await buyerOf(e, async (supplierId) => {
      await lodge(supplierId, a.person.id, { verification: "VERIFIED", expiresInDays: 20 });
      await lodge(supplierId, a.person.id, { verification: "NOT_CHECKED", expiresInDays: 700, validFromDays: 21 });
    });
    const opening = await startedOpening(e);
    expect(await open(opening.id, e.ex.id, buyer)).toMatchObject({ ok: true });
    const bid = await db.openedBid.findFirstOrThrow({ where: { openingId: opening.id } });
    await db.opening.update({ where: { id: opening.id }, data: { finalisedAt: new Date() } });
    const before = (await auditsOf(bid.id)).length;
    const out = await recordVerdict({ ok: false }, form({ exerciseId: e.ex.id, openedBidId: bid.id, verdict: "PASS" }));
    expect(out).toMatchObject({ ok: false });
    expect(out.message).toMatch(/Nothing was saved/);
    expect((await auditsOf(bid.id)).length).toBe(before);
  });
});
