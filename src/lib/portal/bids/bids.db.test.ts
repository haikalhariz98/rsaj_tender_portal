import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticateSupplier } from "@/lib/auth/supplier-identity";
import { readSupplierSession } from "@/lib/auth/supplier-session-store";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { attendanceFaults } from "@/lib/window/events";
import { facts, makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { acknowledgeAddendum } from "./acknowledge-store";
import { loadBidContext } from "./context-store";
import { loadMyExercises, loadMyNotices } from "./list-store";
import { requestDocuments, withdrawRequest } from "./request-store";
import { signUp, withdrawSignUp } from "./signup-store";
import { acknowledgementsByAddendum, inspectionLogOf, requestsOfWindow, signUpsByEvent } from "./staff-read";
import { loadReleaseFacts, openForInspection, recordInspection } from "./inspection-store";
import { loadNonAwardPanel } from "./non-award-store";
import { SUPERSEDED_NOTICE_WORDS } from "./non-award";
import { INSPECTION_REPEAT_SECONDS } from "./documents";
import { addendaTab, briefingsTab, documentsTab, outcomeTab, overviewTab } from "./workspace-store";
import { BidRefused } from "./types";

/**
 * My Bids against a real database (Phase 4d): a supplier signs up for an event, acknowledges an addendum it holds a copy of, asks for the documents and inspects them, all as the session's supplier;
 * the rules judged on the locked rows; what is not the supplier's to see reads as not found, alike for an id that exists nowhere; and the three records the app may only add to refuse a change.
 */

let organisationId: string;
let officerId: string;
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);

interface Fixture {
  exerciseId: string;
  windowId: string;
  eventId: string;
  pastEventId: string;
  addendumId: string;
}
let open: Fixture;
let restricted: Fixture;
let requisitionId: string;

async function exercise(o: { restricted?: boolean; path?: "ADVERTISED" | "INVITED"; published?: boolean; status?: "ADVERTISED" | "INVITED" | "DRAFT" }): Promise<Fixture> {
  const published = o.published ?? true;
  const ex = await db.sourcingExercise.create({
    data: {
      organisationId,
      reference: `BID/EX/${randomId()}`,
      requisitionId,
      title: "Pipe replacement",
      estimatedValue: "1000.00",
      sourcingMethodCode: "BID_METHOD",
      status: o.status ?? "ADVERTISED",
      restricted: o.restricted ?? false,
      closingAt: at(30),
    },
  });
  const w = await db.exerciseWindow.create({
    data: {
      organisationId,
      exerciseId: ex.id,
      path: o.path ?? "ADVERTISED",
      publishedAt: published ? at(-2) : null,
      ...(published ? { advertisementDay: D(at(-2)), policySnapshot: { attendance: { mandatoryPermitted: true } } } : {}),
      purchaseFromDay: D(at(-1)),
      purchaseCloseDay: D(at(10)),
      purchasePlace: "The counter",
      feeAmount: "50.00",
      feePaymentMethods: "Cash",
      submissionPlace: "The tender box",
    },
  });
  const event = await db.siteEvent.create({ data: { organisationId, windowId: w.id, kind: "BRIEFING", startsAt: at(3), place: "Meeting room 2" } });
  const past = await db.siteEvent.create({ data: { organisationId, windowId: w.id, kind: "SITE_VISIT", startsAt: at(-1), place: "The site" } });
  const addendum = await db.addendum.create({ data: { organisationId, windowId: w.id, number: 1, title: "Clarification", whatChanged: "The pipe is 300 mm.", status: "ISSUED", issuedOn: D(at(-1)), renderedText: "The pipe is 300 mm.", frozenAt: new Date() } });
  return { exerciseId: ex.id, windowId: w.id, eventId: event.id, pastEventId: past.id, addendumId: addendum.id };
}

/// A supplier with a live account, signed in, as the actor the portal reads from its session.
async function supplier(status: "REGISTERED" | "APPLICANT" = "REGISTERED"): Promise<{ actor: SupplierActor; supplierId: string; accountId: string }> {
  const s = await makeSupplierAccount(organisationId);
  if (status === "REGISTERED") await db.supplier.update({ where: { id: s.supplier.id }, data: { status, registeredOn: D(at(-100)) } });
  const signedIn = await authenticateSupplier({ loginName: s.loginName, password: s.password }, facts(), null);
  if (!signedIn.ok) throw new Error("sign-in failed");
  const read = await readSupplierSession(signedIn.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session failed");
  return { actor: read.actor, supplierId: s.supplier.id, accountId: s.account!.id };
}

/// The office links a party of the exercise to the supplier (an audited act on the staff side), optionally with a copy of the addendum and a sale.
async function link(f: Fixture, supplierId: string, o: { copy?: boolean; sale?: boolean; receipt?: string | null; letter?: boolean; source?: "PROPOSED_INVITEE" | "PURCHASER" } = {}) {
  const party = await db.exerciseParty.create({ data: { organisationId, exerciseId: (await db.exerciseWindow.findUniqueOrThrow({ where: { id: f.windowId } })).exerciseId, source: o.source ?? "PURCHASER", name: `Party ${randomId()}`, registrationNo: `RN-${randomId()}`, vendorId: supplierId } });
  if (o.copy) await db.addendumRecipient.create({ data: { organisationId, addendumId: f.addendumId, partyId: party.id, withDocuments: true } });
  if (o.letter) await db.invitationLetter.create({ data: { organisationId, windowId: f.windowId, partyId: party.id, templateCode: "t", templateBodyVersion: 1, language: "EN", fields: {}, renderedText: "Dear tenderer", frozenAt: new Date() } });
  if (o.sale) {
    await db.documentSale.create({
      data: { organisationId, windowId: f.windowId, partyId: party.id, soldOn: D(new Date()), collectedBy: "A collector", authoritySighted: true, amount: "50.00", paymentMethod: "Cash", financeReceiptNo: o.receipt == null ? null : `${o.receipt}-${randomId()}`, issuedByPersonId: officerId, annotation: { v: 1, purchaser: party.name } },
    });
  }
  return party;
}

const refusedWith = async (p: Promise<unknown>, code: string, status?: number) => {
  const e = await p.then(() => null, (x) => x);
  expect(e, `expected a refusal with ${code}`).toBeInstanceOf(BidRefused);
  expect((e as BidRefused).faults.map((f) => f.code), code).toContain(code);
  if (status) expect((e as BidRefused).status).toBe(status);
};

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  await db.organisation.update({ where: { id: organisationId }, data: { timeZone: "Asia/Kuala_Lumpur" } });
  officerId = (await makePerson(organisationId, `Bid officer ${randomId()}`)).id;
  requisitionId = (
    await db.requisition.create({
      data: { organisationId, reference: `BID/REQ/${randomId()}`, requestingUnitCode: "BID_DEPT", requestingPersonId: officerId, title: "Bid requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "BID_CC", accountCode: "BID_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "1000.00", raisedOn: D(at(-5)) },
    })
  ).id;
  open = await exercise({});
  restricted = await exercise({ restricted: true, path: "INVITED", status: "INVITED" });
});

afterAll(async () => {
  // The exercises stay (the scratch organisation is shared), but they close, so no other file's list of open exercises is one of these.
  await db.sourcingExercise.updateMany({ where: { id: { in: [open.exerciseId, restricted.exerciseId] } }, data: { status: "CANCELLED" } });
});

describe("which exercise a supplier may open", () => {
  it("an advertised, published exercise is open to any signed-in supplier", async () => {
    const s = await supplier();
    expect(await loadBidContext(db, s.actor, open.exerciseId)).toMatchObject({ seen: { seen: true, via: "PUBLIC" }, phase: "OPEN_FOR_PURCHASE" });
  });

  it("a confidential, invited exercise reads as not found to a supplier the office has not linked to it, exactly as an id that exists nowhere does", async () => {
    const stranger = await supplier();
    expect(await loadBidContext(db, stranger.actor, restricted.exerciseId)).toBeNull();
    expect(await loadBidContext(db, stranger.actor, "nonexistent-id-0001")).toBeNull();
    await refusedWith(signUp(stranger.actor, { exerciseId: restricted.exerciseId, eventId: restricted.eventId, representative: "A. Person" }), "NOT_FOUND", 404);
    await refusedWith(signUp(stranger.actor, { exerciseId: "nonexistent-id-0001", eventId: restricted.eventId, representative: "A. Person" }), "NOT_FOUND", 404);
  });

  it("is opened through a linked party, and only once the window is published", async () => {
    const invitee = await supplier();
    await link(restricted, invitee.supplierId, { source: "PROPOSED_INVITEE", letter: true });
    expect(await loadBidContext(db, invitee.actor, restricted.exerciseId)).toMatchObject({ seen: { seen: true, via: "LINKED" } });
    const unpublished = await exercise({ restricted: true, path: "INVITED", status: "DRAFT", published: false });
    await link(unpublished, invitee.supplierId, { source: "PROPOSED_INVITEE" });
    expect(await loadBidContext(db, invitee.actor, unpublished.exerciseId)).toBeNull();
  });

  it("another organisation's exercise reads as not found", async () => {
    const s = await supplier();
    const other = await db.organisation.create({ data: { code: `OTHER_${randomId()}`, name: "Another organisation" } });
    const ex = await db.sourcingExercise.create({ data: { organisationId: other.id, reference: `OTH/${randomId()}`, requisitionId: (await db.requisition.create({ data: { organisationId: other.id, reference: `OTH/R/${randomId()}`, requestingUnitCode: "X", requestingPersonId: (await makePerson(other.id)).id, title: "x", justification: "x", needStatement: "x", costCentreCode: "X", accountCode: "X", placeOfDelivery: "x", dateRequired: D(at(10)), estimatedValue: "1.00", raisedOn: D(at(-1)) } })).id, title: "Theirs", estimatedValue: "1.00", sourcingMethodCode: "X", status: "ADVERTISED" } });
    expect(await loadBidContext(db, s.actor, ex.id)).toBeNull();
  });
});

describe("signing up for a briefing or a site visit", () => {
  it("is recorded as the session's supplier with the server's clock, audited, and withdrawn and made again", async () => {
    const s = await supplier();
    const made = await signUp(s.actor, { exerciseId: open.exerciseId, eventId: open.eventId, representative: "  Aminah Yusof " });
    const row = await db.siteEventRegistration.findUniqueOrThrow({ where: { id: made.registrationId } });
    expect(row).toMatchObject({ supplierId: s.supplierId, representative: "Aminah Yusof", registeredBySupplierAccountId: s.accountId, endedAt: null });
    const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "SiteEventRegistration", entityId: row.id }, orderBy: { at: "desc" } });
    expect(audit).toMatchObject({ action: "CREATE", actorSupplierAccountId: s.accountId });
    await refusedWith(signUp(s.actor, { exerciseId: open.exerciseId, eventId: open.eventId, representative: "Someone" }), "ALREADY_SIGNED_UP");
    await withdrawSignUp(s.actor, { exerciseId: open.exerciseId, eventId: open.eventId });
    expect((await db.siteEventRegistration.findUniqueOrThrow({ where: { id: row.id } })).endedBySupplierAccountId).toBe(s.accountId);
    await refusedWith(withdrawSignUp(s.actor, { exerciseId: open.exerciseId, eventId: open.eventId }), "NOT_SIGNED_UP");
    const again = await signUp(s.actor, { exerciseId: open.exerciseId, eventId: open.eventId, representative: "Lim Wei" });
    expect(again.registrationId).toBe(row.id);
    expect(await db.siteEventRegistration.count({ where: { eventId: open.eventId, supplierId: s.supplierId } })).toBe(1);
  });

  it("is refused for an event that has begun, a cancelled one and a held one, and for a name that is missing", async () => {
    const s = await supplier();
    await refusedWith(signUp(s.actor, { exerciseId: open.exerciseId, eventId: open.pastEventId, representative: "Late" }), "EVENT_STARTED");
    const cancelled = await db.siteEvent.create({ data: { organisationId, windowId: open.windowId, kind: "BRIEFING", startsAt: at(4), place: "x", cancelledAt: new Date(), cancelReason: "Rain" } });
    await refusedWith(signUp(s.actor, { exerciseId: open.exerciseId, eventId: cancelled.id, representative: "x y" }), "EVENT_CANCELLED");
    const held = await db.siteEvent.create({ data: { organisationId, windowId: open.windowId, kind: "BRIEFING", startsAt: at(5), place: "x", heldOn: D(new Date()) } });
    await refusedWith(signUp(s.actor, { exerciseId: open.exerciseId, eventId: held.id, representative: "x y" }), "EVENT_HELD");
    await refusedWith(signUp(s.actor, { exerciseId: open.exerciseId, eventId: open.eventId, representative: "   " }), "REPRESENTATIVE_REQUIRED");
    expect(await db.siteEventRegistration.count({ where: { supplierId: s.supplierId } })).toBe(0);
  });

  it("an event of another exercise is not found under this one", async () => {
    const s = await supplier();
    await refusedWith(signUp(s.actor, { exerciseId: open.exerciseId, eventId: restricted.eventId, representative: "A B" }), "EVENT_NOT_FOUND", 404);
  });

  it("on the invited path only an invitee whose letter was issued may sign up", async () => {
    const withLetter = await supplier();
    await link(restricted, withLetter.supplierId, { source: "PROPOSED_INVITEE", letter: true });
    await expect(signUp(withLetter.actor, { exerciseId: restricted.exerciseId, eventId: restricted.eventId, representative: "A B" })).resolves.toBeDefined();
    const noLetter = await supplier();
    await link(restricted, noLetter.supplierId, { source: "PROPOSED_INVITEE" });
    await refusedWith(signUp(noLetter.actor, { exerciseId: restricted.exerciseId, eventId: restricted.eventId, representative: "A B" }), "NOT_INVITED");
  });

  it("is NOT attendance: the officer's register is untouched, and the purchase gate still refuses a supplier that only signed up", async () => {
    // Its own exercise: a mandatory event stops every purchase on its window until it is held, which would stop the other tests'.
    const ex = await exercise({});
    const s = await supplier();
    const party = await link(ex, s.supplierId, {});
    const mandatory = await db.siteEvent.create({ data: { organisationId, windowId: ex.windowId, kind: "BRIEFING", startsAt: at(6), place: "x", mandatory: true, heldOn: null } });
    await signUp(s.actor, { exerciseId: ex.exerciseId, eventId: mandatory.id, representative: "A B" });
    expect(await db.siteEventAttendance.count({ where: { eventId: mandatory.id } })).toBe(0);
    // The gate the sale reads: held, mandatory, and the party is not on the officer's register.
    expect(attendanceFaults(party.id, [{ id: mandatory.id, kind: "BRIEFING", startsAt: at(6), place: "x", mandatory: true, heldOn: "2026-11-01", cancelled: false, attendeePartyIds: [] }], true).map((f) => f.code)).toEqual(["ATTENDANCE_REQUIRED"]);
    const tab = await briefingsTab(db, s.actor, (await loadBidContext(db, s.actor, ex.exerciseId))!);
    expect(tab.rows.find((r) => r.id === mandatory.id)).toMatchObject({ signUp: "SIGNED_UP", attended: false });
    // And the pre-sale check says so in words, whether or not the supplier signed up.
    const asked = await requestDocuments(s.actor, { exerciseId: ex.exerciseId, collectorName: "A B" });
    expect(asked).toMatchObject({ outcome: "REFUSED", recorded: true });
    expect(asked.checks.find((c) => c.key === "ATTENDANCE")?.detail).toContain("has not been held yet");
  });

  it("supplier B sees only its own sign-ups, and the officers see both, labelled by supplier", async () => {
    const a = await supplier();
    const b = await supplier();
    await signUp(a.actor, { exerciseId: open.exerciseId, eventId: open.eventId, representative: "A's person" });
    await signUp(b.actor, { exerciseId: open.exerciseId, eventId: open.eventId, representative: "B's person" });
    const ctxB = (await loadBidContext(db, b.actor, open.exerciseId))!;
    const rowsB = (await briefingsTab(db, b.actor, ctxB)).rows.find((r) => r.id === open.eventId)!;
    expect(rowsB.representative).toBe("B's person");
    expect(JSON.stringify(await briefingsTab(db, b.actor, ctxB))).not.toContain("A's person");
    const staff = await signUpsByEvent(db, organisationId, [open.eventId], "Asia/Kuala_Lumpur");
    expect((staff.get(open.eventId) ?? []).map((r) => r.representative)).toEqual(expect.arrayContaining(["A's person", "B's person"]));
  });
});

describe("acknowledging an addendum", () => {
  it("is allowed to a supplier that holds a copy, once, with the organisation's day, and never touches the officer's recorded delivery", async () => {
    const s = await supplier();
    const party = await link(open, s.supplierId, { copy: true, sale: true, receipt: "R-1" });
    const done = await acknowledgeAddendum(s.actor, { exerciseId: open.exerciseId, addendumId: open.addendumId });
    expect(done.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const row = await db.addendumAcknowledgement.findUniqueOrThrow({ where: { id: done.acknowledgementId } });
    expect(row).toMatchObject({ supplierId: s.supplierId, acknowledgedBySupplierAccountId: s.accountId });
    const copy = await db.addendumRecipient.findFirstOrThrow({ where: { addendumId: open.addendumId, partyId: party.id } });
    expect(copy.acknowledgedOn).toBeNull();
    expect(copy.despatchedOn).toBeNull();
    await refusedWith(acknowledgeAddendum(s.actor, { exerciseId: open.exerciseId, addendumId: open.addendumId }), "ALREADY_ACKNOWLEDGED");
    const staff = await acknowledgementsByAddendum(db, organisationId, [open.addendumId], "Asia/Kuala_Lumpur");
    expect(staff.get(open.addendumId)?.length).toBeGreaterThan(0);
  });

  it("is refused to a supplier whose parties hold no copy, and for a draft addendum", async () => {
    const s = await supplier();
    await refusedWith(acknowledgeAddendum(s.actor, { exerciseId: open.exerciseId, addendumId: open.addendumId }), "NOT_A_PURCHASER");
    const draft = await db.addendum.create({ data: { organisationId, windowId: open.windowId, title: "Draft", whatChanged: "x", status: "DRAFT" } });
    await link(open, s.supplierId, { copy: true });
    await refusedWith(acknowledgeAddendum(s.actor, { exerciseId: open.exerciseId, addendumId: draft.id }), "ADDENDUM_NOT_ISSUED");
    await refusedWith(acknowledgeAddendum(s.actor, { exerciseId: open.exerciseId, addendumId: "nonexistent-id-0001" }), "ADDENDUM_NOT_FOUND", 404);
  });

  it("the record cannot be changed or removed, by any login (the database refuses)", async () => {
    const s = await supplier();
    await link(open, s.supplierId, { copy: true });
    const done = await acknowledgeAddendum(s.actor, { exerciseId: open.exerciseId, addendumId: open.addendumId });
    await expect(db.addendumAcknowledgement.update({ where: { id: done.acknowledgementId }, data: { acknowledgedBySupplierAccountId: s.accountId } })).rejects.toThrow();
    await expect(db.addendumAcknowledgement.delete({ where: { id: done.acknowledgementId } })).rejects.toThrow();
    await expect(db.$executeRaw`TRUNCATE TABLE "AddendumAcknowledgement"`).rejects.toThrow();
  });

  it("the notices a supplier is shown are its own, and an acknowledgement shows in them", async () => {
    const a = await supplier();
    const b = await supplier();
    await link(open, a.supplierId, { copy: true, sale: true, receipt: "R-2" });
    await acknowledgeAddendum(a.actor, { exerciseId: open.exerciseId, addendumId: open.addendumId });
    const mine = await loadMyNotices(db, a.actor);
    expect(mine.find((n) => n.kind === "ADDENDUM")?.addendum?.acknowledgedOn).not.toBeNull();
    expect(await loadMyNotices(db, b.actor)).toEqual([]);
    const ctx = (await loadBidContext(db, a.actor, open.exerciseId))!;
    expect((await addendaTab(db, a.actor, ctx)).addenda.find((x) => x.id === open.addendumId)).toMatchObject({ holdsCopy: true, canAcknowledge: false });
  });
});

describe("the overview", () => {
  it("says where the supplier is from a few counts: an addendum to acknowledge, what became of the documents, an event to sign up for", async () => {
    const s = await supplier();
    await link(open, s.supplierId, { copy: true, sale: true, receipt: "R-OV" });
    const ctx = (await loadBidContext(db, s.actor, open.exerciseId))!;
    const o = await overviewTab(db, s.actor, ctx);
    expect(o.todo).toEqual(expect.arrayContaining(["Acknowledge the addendum that came with your documents.", "The documents were sold to your company and the payment is recorded."]));
    expect(o.todo.some((t) => t.startsWith("Sign up for the"))).toBe(true);
    expect(o.facts.parties.length).toBe(1);
    await acknowledgeAddendum(s.actor, { exerciseId: open.exerciseId, addendumId: open.addendumId });
    expect((await overviewTab(db, s.actor, ctx)).todo.some((t) => t.startsWith("Acknowledge"))).toBe(false);
  });
});

describe("asking for the documents", () => {
  it("is recorded for a registered supplier on an open sale, waits for an officer, shows on the staff register and is withdrawn", async () => {
    const s = await supplier();
    const made = await requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Lim Wei" });
    expect(made).toMatchObject({ outcome: "MADE" });
    const row = await db.documentRequest.findFirstOrThrow({ where: { supplierId: s.supplierId, windowId: open.windowId } });
    expect(row).toMatchObject({ collectorName: "Lim Wei", refusedAt: null, endedAt: null, requestedBySupplierAccountId: s.accountId });
    expect(await db.documentSale.count({ where: { windowId: open.windowId, party: { vendorId: s.supplierId } } })).toBe(0);
    await refusedWith(requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Lim Wei" }), "REQUEST_STANDS");
    const staff = await requestsOfWindow(db, organisationId, open.windowId, "Asia/Kuala_Lumpur");
    expect(staff.find((r) => r.id === row.id)).toMatchObject({ state: "WAITING", collector: "Lim Wei" });
    await withdrawRequest(s.actor, { exerciseId: open.exerciseId });
    await refusedWith(withdrawRequest(s.actor, { exerciseId: open.exerciseId }), "NO_REQUEST");
    expect((await requestsOfWindow(db, organisationId, open.windowId, "Asia/Kuala_Lumpur")).find((r) => r.id === row.id)?.state).toBe("WITHDRAWN");
    // May ask again after withdrawing.
    expect((await requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Lim Wei" })).outcome).toBe("MADE");
  });

  it("is fulfilled by a sale an officer records, which the request itself never makes", async () => {
    const s = await supplier();
    await requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Tan Mei" });
    await link(open, s.supplierId, { sale: true, receipt: null });
    const staff = await requestsOfWindow(db, organisationId, open.windowId, "Asia/Kuala_Lumpur");
    expect(staff.find((r) => r.supplierId === s.supplierId)?.state).toBe("BOUGHT");
    await refusedWith(requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Tan Mei" }), "REQUEST_STANDS");
  });

  it("a supplier not on the register is refused by the pre-sale check, the refusal and its reason kept once, not again for the same refusal", async () => {
    const s = await supplier("APPLICANT");
    const first = await requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Lim Wei" });
    expect(first).toMatchObject({ outcome: "REFUSED", recorded: true });
    const again = await requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Lim Wei" });
    expect(again).toMatchObject({ outcome: "REFUSED", recorded: true });
    const rows = await db.documentRequest.findMany({ where: { supplierId: s.supplierId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.refusedAt).not.toBeNull();
    const staff = (await requestsOfWindow(db, organisationId, open.windowId, "Asia/Kuala_Lumpur")).find((r) => r.supplierId === s.supplierId)!;
    expect(staff.state).toBe("REFUSED");
    expect(staff.reasons.join(" ")).toContain("not on the supplier register");
    expect(JSON.stringify(first)).not.toMatch(/SALE_NOT_REGISTERED/);
  });

  it("the refusal is told only while it is the last thing that happened: a request made and withdrawn since leaves no refusal to read", async () => {
    const s = await supplier("APPLICANT");
    const ctx = async () => (await loadBidContext(db, s.actor, open.exerciseId))!;
    await requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Lim Wei" });
    expect((await documentsTab(db, s.actor, await ctx())).refused?.reasons.join(" ")).toContain("not on the supplier register");
    await db.supplier.update({ where: { id: s.supplierId }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
    expect((await requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Lim Wei" })).outcome).toBe("MADE");
    expect((await documentsTab(db, s.actor, await ctx())).refused).toBeNull();
    await withdrawRequest(s.actor, { exerciseId: open.exerciseId });
    const after = await documentsTab(db, s.actor, await ctx());
    expect(after.refused).toBeNull();
    expect(after.request).toBeNull();
  });

  it("a name is required before anything is judged or recorded", async () => {
    const s = await supplier("APPLICANT");
    await refusedWith(requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: " " }), "COLLECTOR_REQUIRED");
    expect(await db.documentRequest.count({ where: { supplierId: s.supplierId } })).toBe(0);
  });

  it("when the sale is not open nothing is refused or recorded: it is no refusal of the supplier", async () => {
    const closed = await exercise({});
    await db.exerciseWindow.update({ where: { id: closed.windowId }, data: { purchaseFromDay: D(at(5)), purchaseCloseDay: D(at(9)) } });
    const s = await supplier();
    const r = await requestDocuments(s.actor, { exerciseId: closed.exerciseId, collectorName: "Lim Wei" });
    expect(r).toMatchObject({ outcome: "REFUSED", recorded: false });
    expect(await db.documentRequest.count({ where: { supplierId: s.supplierId } })).toBe(0);
  });

  it("with the organisation's time zone unset nothing is judged, recorded or left to fail twice: the request is refused in words, however often it is made", async () => {
    // The pre-sale checks need the organisation's day. A fresh installation has no time zone, and the handler is the authority, not the button that hides.
    const s = await supplier();
    await db.organisation.update({ where: { id: organisationId }, data: { timeZone: null } });
    try {
      await refusedWith(requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Lim Wei" }), "WINDOW_NOT_DATED");
      await refusedWith(requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Lim Wei" }), "WINDOW_NOT_DATED");
      expect(await db.documentRequest.count({ where: { supplierId: s.supplierId } })).toBe(0);
      const view = await documentsTab(db, s.actor, (await loadBidContext(db, s.actor, open.exerciseId))!);
      expect(view.canRequest).toBe(false);
      expect(view.checks.map((c) => c.state)).toContain("BLOCK");
    } finally {
      await db.organisation.update({ where: { id: organisationId }, data: { timeZone: "Asia/Kuala_Lumpur" } });
    }
  });

  it("only one request stands per supplier and window, held by the database as well as the rules", async () => {
    const s = await supplier();
    await requestDocuments(s.actor, { exerciseId: open.exerciseId, collectorName: "Lim Wei" });
    await expect(db.documentRequest.create({ data: { organisationId, windowId: open.windowId, supplierId: s.supplierId, collectorName: "x", requestedBySupplierAccountId: s.accountId, requestedAt: new Date(), checks: [] } })).rejects.toThrow();
  });

  it("the documents tab reads the checks, the request and the release for this supplier only", async () => {
    const a = await supplier();
    const b = await supplier();
    await requestDocuments(a.actor, { exerciseId: open.exerciseId, collectorName: "Only A knows" });
    const view = await documentsTab(db, b.actor, (await loadBidContext(db, b.actor, open.exerciseId))!);
    expect(view.request).toBeNull();
    expect(JSON.stringify(view)).not.toContain("Only A knows");
    expect(view.release.state).toBe("NOT_SET");
  });
});

describe("the tender documents", () => {
  it("nothing is released online while the setting is not made, however much has been paid", async () => {
    const s = await supplier();
    await link(open, s.supplierId, { sale: true, receipt: "R-9" });
    const ctx = (await loadBidContext(db, s.actor, open.exerciseId))!;
    expect((await loadReleaseFacts(db, s.actor, ctx)).state).toBe("NOT_SET");
    const refused = await openForInspection(s.actor, { exerciseId: open.exerciseId, kind: "PACK" });
    expect(refused).toMatchObject({ open: false });
    expect(await db.tenderInspectionEvent.count({ where: { supplierId: s.supplierId } })).toBe(0);
  });

  it("a release that is on needs the sale and its recorded receipt, and shows each state in turn", async () => {
    await db.windowPolicy.upsert({ where: { organisationId }, update: { electronicDocumentRelease: true, electronicReleaseProvenance: "ASSUMED" }, create: { organisationId, electronicDocumentRelease: true, electronicReleaseProvenance: "ASSUMED" } });
    try {
      const s = await supplier();
      const ctx0 = (await loadBidContext(db, s.actor, open.exerciseId))!;
      expect((await loadReleaseFacts(db, s.actor, ctx0)).state).toBe("NO_SALE");
      const party = await link(open, s.supplierId, { sale: true, receipt: null });
      const ctx1 = (await loadBidContext(db, s.actor, open.exerciseId))!;
      expect((await loadReleaseFacts(db, s.actor, ctx1)).state).toBe("AWAITING_RECEIPT");
      await db.documentSale.updateMany({ where: { partyId: party.id }, data: { financeReceiptNo: `R-${randomId()}`, receiptRecordedOn: D(new Date()) } });
      expect((await loadReleaseFacts(db, s.actor, ctx1)).state).toBe("READY");
      await db.documentSale.updateMany({ where: { partyId: party.id }, data: { voidedAt: new Date(), voidReason: "In error" } });
      expect((await loadReleaseFacts(db, s.actor, ctx1)).state).toBe("NO_SALE");
    } finally {
      await db.windowPolicy.update({ where: { organisationId }, data: { electronicDocumentRelease: null, electronicReleaseProvenance: null } });
    }
  });

  it("the Tender Table Document is not shown, and nothing is logged, where the exercise has no approved documents", async () => {
    const s = await supplier();
    const r = await openForInspection(s.actor, { exerciseId: open.exerciseId, kind: "TABLE_DOCUMENT" });
    expect(r.open).toBe(false);
    expect(await db.tenderInspectionEvent.count({ where: { supplierId: s.supplierId } })).toBe(0);
    const gone = await openForInspection(s.actor, { exerciseId: restricted.exerciseId, kind: "TABLE_DOCUMENT" });
    expect(gone).toMatchObject({ open: false, ctx: null });
  });

  it("a request another site started is refused before anything is read or logged, in its own words", async () => {
    const s = await supplier();
    for (const kind of ["TABLE_DOCUMENT", "PACK"] as const) {
      const r = await openForInspection(s.actor, { exerciseId: open.exerciseId, kind, secFetchSite: "cross-site" });
      expect(r).toMatchObject({ open: false, ctx: null, crossSite: true, headline: "Open this from your own list" });
      expect(r.open === false && r.detail).toContain("another site");
    }
    expect(await db.tenderInspectionEvent.count({ where: { supplierId: s.supplierId } })).toBe(0);
    // Same-origin, same-site, a typed address and a client that sends nothing are not cross-site: they go on to the rules below (here refused for want of approved documents, not for where they came from).
    for (const site of ["same-origin", "same-site", "none", null]) {
      const r = await openForInspection(s.actor, { exerciseId: open.exerciseId, kind: "TABLE_DOCUMENT", secFetchSite: site });
      expect(r.open === false && r.crossSite, String(site)).toBeUndefined();
    }
  });

  it("a supplier opening the same version again inside a minute adds no row, a later sitting does, and another supplier's opening never counts as its own", async () => {
    const a = await supplier();
    const b = await supplier();
    const w = { windowId: open.windowId, kind: "TABLE_DOCUMENT" as const, documentVersion: 7 };
    const t0 = new Date("2026-11-02T09:00:00.000Z");
    const rows = (x: { supplierId: string }) => db.tenderInspectionEvent.count({ where: { supplierId: x.supplierId, windowId: open.windowId, documentVersion: 7 } });
    expect(await recordInspection(db, a.actor, w, t0)).toEqual({ written: true });
    expect(await recordInspection(db, a.actor, w, new Date(t0.getTime() + 1000))).toEqual({ written: false });
    expect(await recordInspection(db, a.actor, w, new Date(t0.getTime() + (INSPECTION_REPEAT_SECONDS - 1) * 1000))).toEqual({ written: false });
    expect(await rows(a)).toBe(1);
    expect(await recordInspection(db, b.actor, w, new Date(t0.getTime() + 1000))).toEqual({ written: true });
    expect(await recordInspection(db, a.actor, { ...w, documentVersion: 8 }, new Date(t0.getTime() + 1000))).toEqual({ written: true });
    expect(await recordInspection(db, a.actor, w, new Date(t0.getTime() + INSPECTION_REPEAT_SECONDS * 1000))).toEqual({ written: true });
    expect(await rows(a)).toBe(2);
    expect(await rows(b)).toBe(1);
  });

  it("the inspection log refuses a change or a removal by any login, and the staff read it back", async () => {
    const s = await supplier();
    const row = await db.tenderInspectionEvent.create({ data: { organisationId, windowId: open.windowId, supplierId: s.supplierId, kind: "TABLE_DOCUMENT", documentVersion: 1, viewedBySupplierAccountId: s.accountId, viewedAt: new Date() } });
    await expect(db.tenderInspectionEvent.update({ where: { id: row.id }, data: { documentVersion: 2 } })).rejects.toThrow();
    await expect(db.tenderInspectionEvent.delete({ where: { id: row.id } })).rejects.toThrow();
    await expect(db.$executeRaw`TRUNCATE TABLE "TenderInspectionEvent"`).rejects.toThrow();
    const log = await inspectionLogOf(db, organisationId, open.windowId, "Asia/Kuala_Lumpur");
    expect(log.total).toBeGreaterThan(0);
    expect(log.rows[0]!.supplier).toContain(" · ");
  });

  it("a version that is not positive is refused by the database", async () => {
    const s = await supplier();
    await expect(db.tenderInspectionEvent.create({ data: { organisationId, windowId: open.windowId, supplierId: s.supplierId, kind: "PACK", documentVersion: 0, viewedBySupplierAccountId: s.accountId, viewedAt: new Date() } })).rejects.toThrow();
  });
});

describe("where a supplier's own bid stands", () => {
  /// A closed exercise with two opened bids, one by each party, named at the opening.
  async function opened(a: { supplierId: string }, b: { supplierId: string }) {
    const ex = await exercise({});
    await db.sourcingExercise.update({ where: { id: ex.exerciseId }, data: { closingAt: at(-3), status: "UNDER_EVALUATION" } });
    const committee = await db.committee.create({ data: { organisationId, code: `BID_C_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "A test" } });
    const opening = await db.opening.create({
      data: { organisationId, exerciseId: ex.exerciseId, kind: "MAIN", sequenceNo: 1, committeeId: committee.id, committeeNameSnapshot: "Opening committee", startedAt: at(-3), startedByPersonId: officerId, checklistSnapshot: [], policySnapshot: {} },
    });
    const pa = await link(ex, a.supplierId, {});
    const pb = await link(ex, b.supplierId, {});
    let n = 0;
    for (const party of [pa, pb]) {
      n += 1;
      const env = await db.bidEnvelope.create({ data: { organisationId, exerciseId: ex.exerciseId, sequence: n, kind: "BID", channel: "COUNTER", receivedAt: at(-4), receivedSource: "SERVER", receivedByPersonId: officerId, markings: "Sealed", partyId: party.id, late: false, closingAtJudged: at(-3), recordedAfterClosing: false } });
      await db.openedBid.create({
        data: {
          organisationId, exerciseId: ex.exerciseId, openingId: opening.id, envelopeId: env.id, listingNo: n, partyId: party.id, openedAt: at(-3), bidderNameAsRead: party.name, priceAsRead: "123456.78",
          saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED", verdict: n === 2 ? "REJECT" : null, verdictReason: n === 2 ? "A mandatory document is missing" : "",
        },
      });
    }
    return { ex, pa, pb };
  }

  it("says nothing of a bid before the closing, and after it names what is missing rather than that no bid was made", async () => {
    const s = await supplier();
    await link(open, s.supplierId, {});
    expect((await outcomeTab(db, s.actor, (await loadBidContext(db, s.actor, open.exerciseId))!)).standing.stage).toBe("NOT_CLOSED");
    const closed = await exercise({});
    await db.sourcingExercise.update({ where: { id: closed.exerciseId }, data: { closingAt: at(-3), status: "OPENED" } });
    await link(closed, s.supplierId, {});
    const o = await outcomeTab(db, s.actor, (await loadBidContext(db, s.actor, closed.exerciseId))!);
    expect(o.standing.stage).toBe("NOT_NAMED");
    expect(o.notice).toBeNull();
  });

  it("after the opening shows the stage of the exercise and never the price as read, the verdict or the other bidder", async () => {
    const a = await supplier();
    const b = await supplier();
    const { ex } = await opened(a, b);
    for (const who of [a, b]) {
      const o = await outcomeTab(db, who.actor, (await loadBidContext(db, who.actor, ex.exerciseId))!);
      expect(o.standing.stage).toBe("UNDER_EVALUATION");
      const shown = JSON.stringify(o);
      expect(shown).not.toMatch(/123456|REJECT|mandatory document is missing/i);
    }
  });

  it("tells whether the issued award is this supplier's, and only once issued", async () => {
    const a = await supplier();
    const b = await supplier();
    const { ex, pa } = await opened(a, b);
    const award = await db.award.create({ data: { organisationId, reference: `AW/${randomId()}`, exerciseId: ex.exerciseId, status: "DRAFT", instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Winner", awardeePartyId: pa.id, awardedValue: "1000.00", completionPeriod: 3, completionUnit: "MONTHS" } });
    const stage = async (x: { actor: SupplierActor }) => (await outcomeTab(db, x.actor, (await loadBidContext(db, x.actor, ex.exerciseId))!)).standing.stage;
    expect(await stage(a)).toBe("UNDER_EVALUATION");
    await db.award.update({ where: { id: award.id }, data: { status: "ISSUED" } });
    expect(await stage(a)).toBe("AWARDED_TO_YOU");
    expect(await stage(b)).toBe("AWARDED_ELSEWHERE");
  });
});

describe("the notice of non-award", () => {
  // Phase 4d review: the key is the AWARD and the tenderer (it was the exercise and the tenderer), so a notice under an award that was cancelled does not stop the next award issuing its own. Still one per tenderer under each award.
  it("is append-only, one per tenderer and award, and shows to the tenderer's supplier and to nobody else", async () => {
    const a = await supplier();
    const b = await supplier();
    const ex = await exercise({});
    const award = await db.award.create({
      data: {
        organisationId, reference: `AW/${randomId()}`, exerciseId: ex.exerciseId, status: "ISSUED", instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Winner", awardedValue: "1000.00", completionPeriod: 3, completionUnit: "MONTHS",
      },
    });
    const party = await link(ex, a.supplierId, { sale: true, receipt: "R-3" });
    const notice = await db.nonAwardNotice.create({
      data: { organisationId, exerciseId: ex.exerciseId, awardId: award.id, partyId: party.id, outcomeText: "Your bid was not successful.", reasonText: "Above the estimate.", policySnapshot: { nonAwardNotices: true }, issuedOn: D(new Date()), issuedAt: new Date(), issuedByPersonId: officerId },
    });
    await expect(db.nonAwardNotice.create({ data: { organisationId, exerciseId: ex.exerciseId, awardId: award.id, partyId: party.id, outcomeText: "again", policySnapshot: {}, issuedOn: D(new Date()), issuedAt: new Date(), issuedByPersonId: officerId } })).rejects.toThrow();
    // Under another award of the same exercise the same tenderer can be given its own.
    const second = await db.award.create({ data: { organisationId, reference: `AW/${randomId()}`, exerciseId: ex.exerciseId, status: "ISSUED", instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Winner", awardedValue: "1000.00", completionPeriod: 3, completionUnit: "MONTHS" } });
    await expect(db.nonAwardNotice.create({ data: { organisationId, exerciseId: ex.exerciseId, awardId: second.id, partyId: party.id, outcomeText: "under the second award", policySnapshot: {}, issuedOn: D(new Date()), issuedAt: new Date(Date.now() + 1000), issuedByPersonId: officerId } })).resolves.toBeDefined();
    await expect(db.nonAwardNotice.update({ where: { id: notice.id }, data: { reasonText: "Changed" } })).rejects.toThrow();
    await expect(db.nonAwardNotice.delete({ where: { id: notice.id } })).rejects.toThrow();
    const ctxA = (await loadBidContext(db, a.actor, ex.exerciseId))!;
    // The latest standing notice is the one the Outcome tab shows: here the second award's, which carries no reason. The list shows both.
    expect((await outcomeTab(db, a.actor, ctxA)).notice).toMatchObject({ outcomeText: "under the second award" });
    expect((await loadMyNotices(db, a.actor)).filter((n) => n.kind === "NON_AWARD").map((n) => n.body).join(" ")).toContain("Reason given: Above the estimate.");
    const ctxB = (await loadBidContext(db, b.actor, ex.exerciseId))!;
    expect((await outcomeTab(db, b.actor, ctxB)).notice).toBeNull();
    expect((await loadMyNotices(db, b.actor)).filter((n) => n.kind === "NON_AWARD")).toEqual([]);
  });
});

/// A closed exercise with a bid opened for each of the two suppliers' parties (linked, with the documents bought).
async function closedWithBids(parties: { a: { supplierId: string }; b: { supplierId: string } }, o: { restricted?: boolean; path?: "ADVERTISED" | "INVITED"; status?: "ADVERTISED" | "INVITED"; invitee?: boolean } = {}) {
  const ex = await exercise({ restricted: o.restricted, path: o.path, status: o.status });
  await db.sourcingExercise.update({ where: { id: ex.exerciseId }, data: { closingAt: at(-3), status: "UNDER_EVALUATION" } });
  const committee = await db.committee.create({ data: { organisationId, code: `BID_C_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "A test" } });
  const opening = await db.opening.create({ data: { organisationId, exerciseId: ex.exerciseId, kind: "MAIN", sequenceNo: 1, committeeId: committee.id, committeeNameSnapshot: "Opening committee", startedAt: at(-3), startedByPersonId: officerId, checklistSnapshot: [], policySnapshot: {} } });
  const how = o.invitee ? { source: "PROPOSED_INVITEE" as const, letter: true } : { sale: true, receipt: "R-X" };
  const pa = await link(ex, parties.a.supplierId, how);
  const pb = await link(ex, parties.b.supplierId, how);
  let n = 0;
  for (const party of [pa, pb]) {
    n += 1;
    const env = await db.bidEnvelope.create({ data: { organisationId, exerciseId: ex.exerciseId, sequence: n, kind: "BID", channel: "COUNTER", receivedAt: at(-4), receivedSource: "SERVER", receivedByPersonId: officerId, markings: "Sealed", partyId: party.id, late: false, closingAtJudged: at(-3), recordedAfterClosing: false } });
    await db.openedBid.create({ data: { organisationId, exerciseId: ex.exerciseId, openingId: opening.id, envelopeId: env.id, listingNo: n, partyId: party.id, openedAt: at(-3), bidderNameAsRead: party.name, priceAsRead: "100.00", saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED", verdict: null, verdictReason: "" } });
  }
  return { ex, pa, pb };
}

describe("an award cancelled and made again (Phase 4d review)", () => {
  it("a notice under the cancelled award is superseded everywhere the supplier reads it, and the next award can issue its own", async () => {
    const a = await supplier();
    const b = await supplier();
    const { ex, pa, pb } = await closedWithBids({ a, b });
    const award = (status: "ISSUED" | "CANCELLED") => db.award.create({ data: { organisationId, reference: `AW/${randomId()}`, exerciseId: ex.exerciseId, status, instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Winner", awardeePartyId: pa.id, awardedValue: "1000.00", completionPeriod: 3, completionUnit: "MONTHS" } });
    const first = await award("ISSUED");
    const issue = (awardId: string) => db.nonAwardNotice.create({ data: { organisationId, exerciseId: ex.exerciseId, awardId, partyId: pb.id, outcomeText: "Your bid was not successful.", reasonText: "Above the estimate.", policySnapshot: {}, issuedOn: D(new Date()), issuedAt: new Date(), issuedByPersonId: officerId } });
    await issue(first.id);
    const ctxB = async () => (await loadBidContext(db, b.actor, ex.exerciseId))!;
    const chips = async () => (await loadMyExercises(db, b.actor)).find((r) => r.id === ex.exerciseId)!.chips.map((c) => c.text);
    expect((await outcomeTab(db, b.actor, await ctxB())).notice).not.toBeNull();
    expect(await chips()).toContain("Notice of the outcome");

    // The first award is cancelled and the same bidder is awarded again.
    await db.award.update({ where: { id: first.id }, data: { status: "CANCELLED" } });
    const second = await award("ISSUED");
    const o = await outcomeTab(db, b.actor, await ctxB());
    expect(o.notice).toBeNull();
    expect(o.supersededNotice).not.toBeNull();
    expect(JSON.stringify(o)).not.toContain("Above the estimate");
    const mine = (await loadMyNotices(db, b.actor)).filter((x) => x.kind === "NON_AWARD");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ superseded: true, body: SUPERSEDED_NOTICE_WORDS, title: "Notice of the outcome (superseded)" });
    expect(await chips()).not.toContain("Notice of the outcome");

    // The officers' panel for the new award does not read the old award's notice as issued, and the new award can issue its own.
    const panelOf = () => loadNonAwardPanel(db, organisationId, { id: second.id, exerciseId: ex.exerciseId, status: second.status, awardeePartyId: pa.id });
    expect((await panelOf()).rows.find((r) => r.partyId === pb.id)?.notice).toBeNull();
    await issue(second.id);
    const again = await outcomeTab(db, b.actor, await ctxB());
    expect(again.notice).not.toBeNull();
    expect(again.supersededNotice).toBeNull();
    expect((await panelOf()).rows.find((r) => r.partyId === pb.id)?.notice).not.toBeNull();
  });
});

describe("a bidder on an invited exercise is not told it lost (Phase 4d review)", () => {
  it("the award is said to be issued, with no verdict and no pointer to Results, until a notice is issued", async () => {
    const a = await supplier();
    const b = await supplier();
    const { ex, pa } = await closedWithBids({ a, b }, { restricted: true, path: "INVITED", status: "INVITED", invitee: true });
    await db.award.create({ data: { organisationId, reference: `AW/${randomId()}`, exerciseId: ex.exerciseId, status: "ISSUED", instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Winner", awardeePartyId: pa.id, awardedValue: "1000.00", completionPeriod: 3, completionUnit: "MONTHS" } });
    const loser = await outcomeTab(db, b.actor, (await loadBidContext(db, b.actor, ex.exerciseId))!);
    expect(loser.standing.stage).toBe("AWARD_ISSUED");
    expect(loser.inResults).toBe(false);
    expect(JSON.stringify(loser.standing)).not.toMatch(/another company|Results/);
    expect((await outcomeTab(db, a.actor, (await loadBidContext(db, a.actor, ex.exerciseId))!)).standing.stage).toBe("AWARDED_TO_YOU");
    // A public exercise says where the award is published.
    const c = await supplier();
    const d = await supplier();
    const pub = await closedWithBids({ a: c, b: d });
    await db.award.create({ data: { organisationId, reference: `AW/${randomId()}`, exerciseId: pub.ex.exerciseId, status: "ISSUED", instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Winner", awardeePartyId: pub.pa.id, awardedValue: "1000.00", completionPeriod: 3, completionUnit: "MONTHS" } });
    const seen = await outcomeTab(db, d.actor, (await loadBidContext(db, d.actor, pub.ex.exerciseId))!);
    expect(seen.inResults).toBe(true);
    expect(seen.standing.stage).toBe("AWARDED_ELSEWHERE");
  });
});

describe("what a purchaser is told of a change (Phase 4d review)", () => {
  it("never reads out the officers' own reason, for a closing change or a cancellation", async () => {
    const s = await supplier();
    const ex = await exercise({});
    await link(ex, s.supplierId, { sale: true, receipt: "R-RS" });
    const secret = "All bids exceed the department estimate of RM 4.2m";
    await db.closingChange.create({ data: { organisationId, windowId: ex.windowId, kind: "EXTENSION", fromClosingAt: at(30), toClosingAt: at(40), reason: secret, requestedOn: D(new Date()), appliedAt: new Date() } });
    await db.windowCancellation.create({ data: { organisationId, windowId: ex.windowId, reason: secret, feeRefund: true, requestedOn: D(new Date()), appliedAt: new Date() } });
    const notices = (await loadMyNotices(db, s.actor)).filter((x) => x.exerciseId === ex.exerciseId);
    expect(notices.map((x) => x.kind).sort()).toEqual(expect.arrayContaining(["CLOSING_CHANGED", "EXERCISE_CANCELLED"]));
    const shown = JSON.stringify(notices);
    expect(shown).not.toContain("department estimate");
    expect(shown).not.toContain("4.2m");
    expect(notices.find((x) => x.kind === "EXERCISE_CANCELLED")!.body).toBe("This exercise was cancelled. The document fee is refunded.");
    expect(notices.find((x) => x.kind === "CLOSING_CHANGED")!.body).toMatch(/^The closing moved from .+ to .+\.$/);
    // The Addenda tab reads the same notices.
    const tab = await addendaTab(db, s.actor, (await loadBidContext(db, s.actor, ex.exerciseId))!);
    expect(JSON.stringify(tab)).not.toContain("department estimate");
  });
});

describe("an addendum after the closing (Phase 4d review)", () => {
  it("is no longer a thing to acknowledge, in the list, in the notices or in the exercise", async () => {
    const s = await supplier();
    const ex = await exercise({});
    await link(ex, s.supplierId, { copy: true, sale: true, receipt: "R-AC" });
    const chips = async () => (await loadMyExercises(db, s.actor)).find((r) => r.id === ex.exerciseId)!.chips.map((c) => c.text);
    expect(await chips()).toContain("1 addendum to acknowledge");
    expect((await loadMyNotices(db, s.actor)).find((x) => x.kind === "ADDENDUM")!.addendum).toMatchObject({ acknowledgedOn: null, canAcknowledge: true });
    await db.sourcingExercise.update({ where: { id: ex.exerciseId }, data: { closingAt: at(-1), status: "OPENED" } });
    expect((await chips()).join(" ")).not.toMatch(/to acknowledge/);
    const notice = (await loadMyNotices(db, s.actor)).find((x) => x.kind === "ADDENDUM")!;
    expect(notice.addendum).toMatchObject({ acknowledgedOn: null, canAcknowledge: false });
    const tab = (await addendaTab(db, s.actor, (await loadBidContext(db, s.actor, ex.exerciseId))!)).addenda[0]!;
    expect(tab).toMatchObject({ holdsCopy: true, canAcknowledge: false });
  });
});

describe("the list of a supplier's exercises", () => {
  it("holds only what it has taken part in, and never another supplier's part", async () => {
    const a = await supplier();
    const b = await supplier();
    expect(await loadMyExercises(db, a.actor)).toEqual([]);
    await signUp(a.actor, { exerciseId: open.exerciseId, eventId: open.eventId, representative: "A B" });
    const rowsA = await loadMyExercises(db, a.actor);
    expect(rowsA.map((r) => r.id)).toEqual([open.exerciseId]);
    expect(rowsA[0]!.chips.map((c) => c.text)).toContain("Signed up for 1 event");
    expect(await loadMyExercises(db, b.actor)).toEqual([]);
  });
});
