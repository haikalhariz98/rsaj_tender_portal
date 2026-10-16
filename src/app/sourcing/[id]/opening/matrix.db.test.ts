import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Wave 3c step 4 against the scratch database (SR-14, SR-15 online; rulings 22, 20c, 20cl, 20cm, 20cp, 20cv; plan §4): the checklist matrix's acts, the read model and the filed-file download, through the
 * real actions, the real route handlers and the triggers. Only the request is stood in for: who is signed in, the cookies and the cache. Online fixture: `online-opening.fixture.ts`.
 */

const mover = vi.hoisted(() => ({ skip: false }));

vi.mock("@/app/_auth/actor", async () => {
  const { who } = await import("@/lib/test-support/acting");
  const { actorModule } = await import("@/lib/test-support/staff");
  const { administrationConflict } = await import("@/lib/auth/administration-conflict");
  const { confirmStaffPassword } = await import("@/lib/auth/identity");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff,
    staffForAct: async (act: import("@/lib/auth/administration-conflict").AdministratorAct) => {
      const actor = who.actor as import("@/lib/auth/types").StaffActor;
      const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: actor.isAdministrator });
      return fault ? { ok: false as const, state: { ok: false as const, message: fault.en } } : { ok: true as const, actor };
    },
    stepUp: async (actor: import("@/lib/auth/types").StaffActor, password: string) => {
      const r = await confirmStaffPassword(actor, password, { sourceAddress: null, userAgent: "vitest" });
      return r.ok ? r : { ok: false as const, message: "That password is not right." };
    },
  };
});
vi.mock("@/app/_auth/cookies", () => ({ refuseForeignPost: async () => null, currentRequestFacts: async () => ({ sourceAddress: null, userAgent: "vitest" }) }));
vi.mock("@/app/_auth/act", async () => {
  const begin = await import("@/lib/auth/act-begin");
  const { attributeAct } = await import("@/lib/auth/attribution-store");
  const { confirmStaffPassword } = await import("@/lib/auth/identity");
  const deps: import("@/lib/auth/act-begin").ActDeps = {
    now: () => new Date(),
    // The organisation's switch for a paper act recorded for another: allowed here, so the matrix's own rule is what the online tests meet.
    paperSignatureRecording: async () => "ALLOWED",
    stepUp: async (actor, password) => {
      const r = await confirmStaffPassword(actor, password, { sourceAddress: null, userAgent: "vitest" });
      return r.ok ? r : { ok: false, message: r.kind };
    },
    attribute: attributeAct,
  };
  return {
    beginAct: (actor: import("@/lib/auth/types").StaffActor, data: FormData, key: string, o: Parameters<typeof begin.beginActWith>[4]) => begin.beginActWith(deps, actor, data, key, o),
    attributionRefusalState: begin.attributionRefusalState,
  };
});
vi.mock("@/app/_auth/route", async () => {
  const { who } = await import("@/lib/test-support/acting");
  return {
    refusalResponse: (code: string) => Response.json({ ok: false, code }, { status: 401 }),
    staffRoute: async () => (who.actor ? { ok: true as const, actor: who.actor as import("@/lib/auth/types").StaffActor } : { ok: false as const, response: Response.json({ ok: false, code: "NOT_SIGNED_IN" }, { status: 401 }) }),
  };
});
// The finalise's own call of the mover is skipped where a test files by hand through the route.
vi.mock("@/lib/sealing/online-file-mover", async (orig) => {
  const real = await orig<typeof import("@/lib/sealing/online-file-mover")>();
  return { ...real, moveReleasedFiles: (...a: Parameters<typeof real.moveReleasedFiles>) => (mover.skip ? Promise.resolve({ moved: 0, failed: [], remaining: -1 }) : real.moveReleasedFiles(...a)) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import type { NextRequest } from "next/server";

import { actFieldNames } from "@/lib/auth/act-field-names";
import type { StaffActor } from "@/lib/auth/types";
import { sulitGranted } from "@/lib/auth/sulit-access";
import { db } from "@/lib/db";
import { columnSeen } from "@/lib/test-db/column-seen";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { checklistFromSnapshot } from "@/lib/opening/checklist";
import { evaluationSet } from "@/lib/opening/carry";
import { classAsReadText, kelasText, ONLINE_CLASS_AS_READ, openingCsv } from "@/lib/opening/download";
import { FILED_FILE_WORDS } from "@/lib/opening/filed-file";
import { NAMES_AT_FINALISING, openingFindingText } from "@/lib/opening/labels";
import { MATRIX_FAULT_TEXT, REASON_HELD_TEXT } from "@/lib/opening/matrix";
import { openingMatrix } from "@/lib/opening/matrix-read";
import { scheduleSection } from "@/lib/opening/read";
import { loadOpenings } from "@/lib/opening/repo";

import { finaliseOpening, recordChecklistAnswer, recordInitial, recordScheduleDetails, recordVerdict } from "./actions";
import { POST as filedFile, HEAD as filedFileHead } from "../../../api/opening/filed-file/route";
import {
  ctx, ago, estimateFor, finalise, fixtureSetup, fixtureTeardown, form, lodgeAs, message, prepare, setFileClass, sign, signedIn, unsealed, who,
  type Ex, type Officer,
} from "./online-opening.fixture";

let org = "";
beforeAll(async () => {
  ({ org } = await fixtureSetup());
});
afterAll(fixtureTeardown);

const refusedWith = (r: { message?: string; errors?: Record<string, string> }, code: keyof typeof MATRIX_FAULT_TEXT) => {
  expect(r).toMatchObject({ ok: false });
  expect(message(r)).toContain(MATRIX_FAULT_TEXT[code]);
};
const answer = (ex: Ex, o: { actor: unknown }, bidId: string, itemKey: string, a: "PRESENT" | "ABSENT" | "NOT_APPLICABLE") => {
  who.actor = o.actor;
  return recordChecklistAnswer({ ok: false }, form({ exerciseId: ex.id, openedBidId: bidId, itemKey, answer: a }));
};
const decide = async (ex: Ex, o: { actor: unknown }, bidId: string, verdict: "PASS" | "REJECT", reason = "", seen?: Record<string, string>) => {
  who.actor = o.actor;
  return recordVerdict({ ok: false }, form({ ...(seen ?? (await columnSeen(bidId))), exerciseId: ex.id, openedBidId: bidId, verdict, verdictReason: reason }));
};
const confirm = async (ex: Ex, o: { actor: unknown }, bidId: string, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return recordInitial({ ok: false }, form({ ...(await columnSeen(bidId)), exerciseId: ex.id, openedBidId: bidId, ...over }));
};
/// A decision written the way the rows of an opening made before the revision existed were: with the revision left at 0. The decision trigger (migration 20261109000000) refuses that now, for every writer,
/// so the fixture stands the trigger down for this one write and puts it back, as the owner of a scratch database.
async function writtenBeforeTheRule<T>(write: () => Promise<T>): Promise<T> {
  await db.$executeRawUnsafe(`ALTER TABLE public."OpenedBid" DISABLE TRIGGER "OpenedBid_decision_moves_revision"`);
  try {
    return await write();
  } finally {
    await db.$executeRawUnsafe(`ALTER TABLE public."OpenedBid" ENABLE ALWAYS TRIGGER "OpenedBid_decision_moves_revision"`);
  }
}
const bidRow = (id: string) => db.openedBid.findUniqueOrThrow({ where: { id } });
const itemsOf = async (openingId: string) => checklistFromSnapshot((await db.opening.findUniqueOrThrow({ where: { id: openingId } })).checklistSnapshot).items;

describe("who may answer, decide and confirm (ruling 22, 20cp)", () => {
  it("an online answer, decision or confirmation by an administrator, by a person not named, or for another officer is refused, and nothing is written", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    const [item] = await itemsOf(opening.id);
    const bid = offers[0].id;
    const admin = await signedIn(true);
    const stranger = await signedIn();
    const before = await bidRow(bid);
    for (const actor of [admin, stranger]) {
      for (const r of [await answer(ex, actor, bid, item.key, "ABSENT"), await decide(ex, actor, bid, "REJECT", "No."), await confirm(ex, actor, bid)]) {
        expect(r.ok).toBe(false);
        // An administrator is stopped at the door of the act, a person not named by the matrix's words. Both are told why.
        if (actor === stranger) refusedWith(r, "NOT_A_NAMED_OFFICER");
        else expect(message(r).length).toBeGreaterThan(0);
      }
    }
    expect(await db.openingChecklistAnswer.count({ where: { openedBidId: bid } })).toBe(0);
    expect(await db.openedBidInitial.count({ where: { openedBidId: bid } })).toBe(0);
    const after = await bidRow(bid);
    expect(after.verdict).toBeNull();
    expect(after.columnRevision).toBe(before.columnRevision);
  }, 300_000);

  it("an online confirmation is never recorded for another officer, even with a paper reference: refused for that reason alone, on a column that is answered and decided", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    const bid = offers[0].id;
    // The column is complete and decided, so the only thing that can refuse the confirmation is that it is on behalf of another (NOT_OWN_ACT).
    for (const item of await itemsOf(opening.id)) expect((await answer(ex, ex.officers[0], bid, item.key, "PRESENT")).ok).toBe(true);
    expect((await decide(ex, ex.officers[0], bid, "PASS")).ok).toBe(true);
    const names = actFieldNames("personId");
    const onBehalfActor = { ...ex.officers[1].actor, permissions: new Set([...ex.officers[1].actor.permissions, "acts.recordOnBehalf" as const]) } as StaffActor;
    const other = await confirm(ex, { actor: onBehalfActor }, bid, { personId: ex.officers[0].person.id, [names.onBehalf]: "on", [names.paperReference]: "paper 1", [names.reason]: "confirmed on paper" });
    refusedWith(other, "NOT_OWN_ACT");
    expect(await db.openedBidInitial.count({ where: { openedBidId: bid, personId: ex.officers[0].person.id } })).toBe(0);
    // The officer's own confirmation of the same column goes through.
    expect((await confirm(ex, ex.officers[1], bid)).ok).toBe(true);
  }, 300_000);

  it("a confirmation or a decision posted from a screen that read an earlier column is refused with nothing written, and the trail names the revision (security audit)", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    const bid = offers[0].id;
    const items = await itemsOf(opening.id);
    for (const item of items) expect((await answer(ex, ex.officers[0], bid, item.key, "PRESENT")).ok).toBe(true);
    expect((await decide(ex, ex.officers[0], bid, "PASS")).ok).toBe(true);
    // Officer 1 opened the column here.
    const read = await columnSeen(bid);
    // Then officer 0 changes an answer (which clears the decision) and records a different one.
    expect((await answer(ex, ex.officers[0], bid, items[0].key, "ABSENT")).ok).toBe(true);
    expect((await decide(ex, ex.officers[0], bid, "REJECT", "Form of tender absent.")).ok).toBe(true);
    const moved = await bidRow(bid);
    const stale = await confirm(ex, ex.officers[1], bid, read);
    refusedWith(stale, "COLUMN_CHANGED");
    expect(await db.openedBidInitial.count({ where: { openedBidId: bid } })).toBe(0);
    const stalePass = await decide(ex, ex.officers[0], bid, "PASS", "", read);
    refusedWith(stalePass, "COLUMN_CHANGED");
    const unchanged = await bidRow(bid);
    expect([unchanged.verdict, unchanged.columnRevision]).toEqual([moved.verdict, moved.columnRevision]);
    // A post that carries no column at all is refused too, in the field's words.
    const bare = await recordInitial({ ok: false }, form({ exerciseId: ex.id, openedBidId: bid }));
    expect(bare).toMatchObject({ ok: false });
    // Read again, it goes through, and the trail says which revision and which decision was confirmed.
    expect((await confirm(ex, ex.officers[1], bid)).ok).toBe(true);
    const row = await db.openedBidInitial.findFirstOrThrow({ where: { openedBidId: bid, personId: ex.officers[1].person.id } });
    expect(row.columnRevision).toBe(moved.columnRevision);
    const created = await db.auditEntry.findFirstOrThrow({ where: { entity: "OpenedBidInitial", entityId: row.id, action: "CREATE" } });
    expect(JSON.stringify(created.changes)).toContain(String(moved.columnRevision));
    expect(JSON.stringify(created.changes)).toContain("Not carried");
    // A renewal names its cause: here the column changed again, no as-read correction was made.
    expect((await answer(ex, ex.officers[0], bid, items[1].key, "ABSENT")).ok).toBe(true);
    expect((await decide(ex, ex.officers[0], bid, "REJECT", "Priced bill absent.")).ok).toBe(true);
    expect((await confirm(ex, ex.officers[1], bid)).ok).toBe(true);
    const renewed = await db.auditEntry.findFirstOrThrow({ where: { entity: "OpenedBidInitial", entityId: row.id, action: "UPDATE" } });
    expect(JSON.stringify(renewed.changes)).toContain("Before a change of answers or decision");
    expect(JSON.stringify(renewed.changes)).not.toContain("Before the correction");
  }, 300_000);

  it("Present on a part no file was received for is refused, and Absent is the officers' judgement", async () => {
    const { ex, opening, offers } = await unsealed(2, 1, undefined, { skipPartBOnFirst: true });
    const items = await itemsOf(opening.id);
    const form1 = items.find((i) => i.label === "Form of Tender")!;
    const bill = items.find((i) => i.label === "Priced Bill")!;
    const bid = offers[0].id;
    const refused = await answer(ex, ex.officers[0], bid, bill.key, "PRESENT");
    refusedWith(refused, "NO_FILE_RECEIVED");
    expect(await db.openingChecklistAnswer.count({ where: { openedBidId: bid } })).toBe(0);
    expect((await bidRow(bid)).columnRevision).toBe(0);
    expect((await answer(ex, ex.officers[0], bid, bill.key, "ABSENT")).ok).toBe(true);
    expect((await answer(ex, ex.officers[0], bid, form1.key, "PRESENT")).ok).toBe(true);
    // The revision is raised once per changed answer, and only by an answer that changed.
    expect((await answer(ex, ex.officers[0], bid, form1.key, "PRESENT")).ok).toBe(true);
    expect((await bidRow(bid)).columnRevision).toBe(2);
  }, 300_000);

  it("a confirmation before the column is complete and decided is refused, in words", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    const items = await itemsOf(opening.id);
    const bid = offers[0].id;
    expect((await answer(ex, ex.officers[0], bid, items[0].key, "PRESENT")).ok).toBe(true);
    const early = await confirm(ex, ex.officers[1], bid);
    refusedWith(early, "COLUMN_NOT_ANSWERED");
    refusedWith(early, "DECISION_NOT_RECORDED");
    for (const it of items.slice(1)) expect((await answer(ex, ex.officers[0], bid, it.key, "PRESENT")).ok).toBe(true);
    const undecided = await confirm(ex, ex.officers[1], bid);
    refusedWith(undecided, "DECISION_NOT_RECORDED");
    expect(await db.openedBidInitial.count({ where: { openedBidId: bid } })).toBe(0);
    expect((await decide(ex, ex.officers[0], bid, "PASS")).ok).toBe(true);
    expect((await confirm(ex, ex.officers[1], bid)).ok).toBe(true);
    const row = await db.openedBidInitial.findFirstOrThrow({ where: { openedBidId: bid } });
    expect(row.columnRevision).toBe((await bidRow(bid)).columnRevision);
  }, 300_000);

  it("a changed answer after both confirmations clears the decision and asks for both again: the finalise refuses, and the way through is decide, then confirm", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    const bid = offers[0].id;
    const [item] = await itemsOf(opening.id);
    const revision = (await bidRow(bid)).columnRevision;
    const changed = await answer(ex, ex.officers[0], bid, item.key, "ABSENT");
    expect(changed.ok, message(changed)).toBe(true);
    expect(message(changed)).toMatch(/verdict is cleared/);
    const cleared = await bidRow(bid);
    expect(cleared.verdict).toBeNull();
    // One answer changed and the decision it cleared: one raise, not two.
    expect(cleared.columnRevision).toBe(revision + 1);
    const refused = await finalise(ex, opening.id, ex.officers[0]);
    expect(refused.ok).toBe(false);
    expect(message(refused)).toContain(openingFindingText({ code: "VERDICT_UNSET", level: "block", data: { listingNo: 1 } }));
    expect(message(refused)).toContain("initial");
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
    // Decide again (Present again, so Pass is open), then each officer confirms again.
    expect((await answer(ex, ex.officers[0], bid, item.key, "PRESENT")).ok).toBe(true);
    expect((await decide(ex, ex.officers[0], bid, "PASS")).ok).toBe(true);
    const stillRefused = await finalise(ex, opening.id, ex.officers[0]);
    expect(stillRefused.ok).toBe(false);
    for (const o of ex.officers) expect((await confirm(ex, o, bid)).ok).toBe(true);
    const done = await finalise(ex, opening.id, ex.officers[0]);
    expect(done.ok, message(done)).toBe(true);
  }, 300_000);
});

describe("an alternative through the matrix (ruling 22)", () => {
  it("goes through to the finalise like a main offer and is carried to evaluation only if it passes", async () => {
    const { ex, opening, offers } = await unsealed(2, 1, undefined, { alternatives: 1 });
    expect(offers).toHaveLength(2);
    const [main, alt] = offers;
    expect(alt.isAlternative).toBe(true);
    expect(alt.alternativeStatus).not.toBeNull();
    const items = await itemsOf(opening.id);
    // The main offer passes.
    await prepare(ex, opening.id, [main]);
    // The alternative lacks a part (Absent, so the completeness switch gives a ground) and is rejected, then confirmed by both.
    expect((await answer(ex, ex.officers[0], alt.id, items[0].key, "ABSENT")).ok).toBe(true);
    for (const it of items.slice(1)) expect((await answer(ex, ex.officers[0], alt.id, it.key, "PRESENT")).ok).toBe(true);
    const rejected = await decide(ex, ex.officers[0], alt.id, "REJECT", "A required part is missing.");
    expect(rejected.ok, message(rejected)).toBe(true);
    for (const o of ex.officers) expect((await confirm(ex, o, alt.id)).ok).toBe(true);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    const done = await finalise(ex, opening.id, ex.officers[0]);
    expect(done.ok, message(done)).toBe(true);
    const view = await loadOpenings(ex.id);
    const carried = evaluationSet(view.map((o) => ({ kind: o.kind, finalised: o.finalisedAt != null, bids: o.bids })));
    expect(carried.map((b) => b.id)).toEqual([main.id]);
    expect((await bidRow(alt.id)).verdict).toBe("REJECT");
  }, 300_000);
});

// ------------------------------------------------------------------ paper (a new exercise can still pin PAPER)

async function paperOpening() {
  const requester = await db.person.create({ data: { organisationId: org, name: `Requester ${randomId()}` } });
  const requisition = await db.requisition.create({ data: { organisationId: org, reference: `PAP/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: requester.id, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") } });
  const committee = await db.committee.create({ data: { organisationId: org, code: `PAP_C_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "Test" } });
  const method = await db.sourcingMethod.create({ data: { organisationId: org, code: `PAP_M_${randomId()}`, nameEn: "Paper tender" } });
  const ex = await db.sourcingExercise.create({ data: { organisationId: org, reference: `PAP/EX/${randomId()}`, requisitionId: requisition.id, title: "Paper matrix", estimatedValue: "1000.00", sourcingMethodCode: method.code, status: "OPENING_IN_PROGRESS", closingAt: ago(3600) } });
  await db.exerciseWindow.create({ data: { organisationId: org, exerciseId: ex.id, path: "ADVERTISED", publishedAt: ago(86400 * 2), advertisementDay: new Date(`${new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)}T00:00:00.000Z`), policySnapshot: {}, alternativesPermitted: false } });
  const a = await signedIn();
  const b = await signedIn();
  const outsider = await signedIn();
  const opening = await db.opening.create({
    data: {
      organisationId: org, exerciseId: ex.id, kind: "MAIN", sequenceNo: 1, committeeId: committee.id, committeeNameSnapshot: "Opening committee", startedAt: new Date(), startedByPersonId: a.person.id, unsealedAt: new Date(),
      checklistSnapshot: { items: [{ key: "T1", label: "Form of Tender", source: "PART" }, { key: "T2", label: "Priced Bill", source: "PART" }], notJudged: [], notReturned: [] },
      policySnapshot: { completeness: { eliminates: true, provenance: "STATED", source: "TEST" }, unpurchased: { consequence: "REPORT", provenance: "STATED" }, minimumBids: { value: null, provenance: null }, alternativesPermitted: false, invited: { reading: "PURCHASERS", provenance: "ASSUMED" }, panel: {}, committee: { code: null, name: null, provenance: null }, estimate: { requires: false, provenance: "STATED" }, restrictedTender: false, path: "ADVERTISED" },
    },
  });
  await db.openingSitting.create({ data: { organisationId: org, openingId: opening.id, sittingNo: 1, startedAt: new Date(), recordedByPersonId: a.person.id } });
  for (const p of [a, b]) {
    const seat = await db.openingPanelMember.create({ data: { organisationId: org, openingId: opening.id, personId: p.person.id, seatLabelSnapshot: "Member", present: true } });
    await db.openingAuthorisation.create({ data: { organisationId: org, openingId: opening.id, personId: p.person.id, panelMemberId: seat.id, sittingNo: 1, recordedAt: new Date() } });
    await db.openingSignature.create({ data: { organisationId: org, openingId: opening.id, personId: p.person.id, panelMemberId: seat.id, signedOn: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`), recordedAt: new Date() } });
  }
  const bids: string[] = [];
  for (let n = 1; n <= 2; n++) {
    const party = await db.exerciseParty.create({ data: { organisationId: org, exerciseId: ex.id, source: "BIDDER_AT_OPENING", name: `Paper bidder ${n} ${randomId()}`, registrationNo: `PR-${randomId()}` } });
    const envelope = await db.bidEnvelope.create({ data: { organisationId: org, exerciseId: ex.id, sequence: n, kind: "BID", channel: "COUNTER", receivedAt: ago(7200), receivedSource: "SERVER", receivedByPersonId: a.person.id, markings: `Envelope ${n}`, late: false, closingAtJudged: ago(3600), recordedAfterClosing: false, status: "OPENED" } });
    const bid = await db.openedBid.create({ data: { organisationId: org, exerciseId: ex.id, openingId: opening.id, envelopeId: envelope.id, listingNo: n, partyId: party.id, openedAt: new Date(), bidderNameAsRead: party.name, priceAsRead: "1000.00", saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED" } });
    bids.push(bid.id);
  }
  await db.sourcingExercise.update({ where: { id: ex.id }, data: { status: "OPENING_IN_PROGRESS" } });
  return { ex: { id: ex.id } as Ex, opening, bids, a, b, outsider };
}

describe("a paper opening through the matrix's rules (ruling 22, 20cp)", () => {
  it("answers by a present panel member, then the decision, then the confirmations (one recorded for the other) finalise; a person off the panel is refused", async () => {
    const { ex, opening, bids, a, b, outsider } = await paperOpening();
    const [bid] = bids;
    refusedWith(await answer(ex, outsider, bid, "T1", "PRESENT"), "NOT_A_NAMED_OFFICER");
    refusedWith(await decide(ex, outsider, bid, "PASS"), "NOT_A_NAMED_OFFICER");
    expect(await db.openingChecklistAnswer.count({ where: { openedBidId: bid } })).toBe(0);
    expect((await bidRow(bid)).verdict).toBeNull();
    // The decision cannot be recorded for another officer, on paper either.
    for (const id of bids) {
      for (const k of ["T1", "T2"]) expect((await answer(ex, a, id, k, "PRESENT")).ok).toBe(true);
      expect((await decide(ex, a, id, "PASS")).ok).toBe(true);
    }
    // A confirmation before it is taken on the current revision cannot be recorded by a person off the panel; a present member records the other's, naming both.
    refusedWith(await confirm(ex, outsider, bids[0]), "NOT_A_NAMED_OFFICER");
    for (const id of bids) {
      expect((await confirm(ex, a, id)).ok).toBe(true);
      const names = actFieldNames("personId");
      const onBehalf = { ...a.actor, permissions: new Set([...a.actor.permissions, "acts.recordOnBehalf" as const]) } as StaffActor;
      const forB = await confirm(ex, { actor: onBehalf }, id, { personId: b.person.id, [names.onBehalf]: "on", [names.paperReference]: "paper 7", [names.reason]: "b initialled on the schedule" });
      expect(forB.ok, message(forB)).toBe(true);
      expect(await db.openedBidInitial.count({ where: { openedBidId: id } })).toBe(2);
    }
    who.actor = a.actor;
    expect((await recordScheduleDetails({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, schedulePages: "2", minutes: "" }))).ok).toBe(true);
    const done = await finaliseOpening({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, paperCopy: "notInBox" }));
    expect(done.ok, message(done)).toBe(true);
  }, 300_000);

  it("a paper opening whose rows predate the migration (revision 0 throughout) still finalises", async () => {
    const { ex, opening, bids, a, b } = await paperOpening();
    // Written directly, as the rows of an opening made before the revision existed: every column reads revision 0.
    for (const id of bids) {
      for (const k of ["T1", "T2"]) await db.openingChecklistAnswer.create({ data: { organisationId: org, openedBidId: id, itemKey: k, itemLabelSnapshot: k, answer: "PRESENT", recordedAt: new Date() } });
      await writtenBeforeTheRule(() => db.openedBid.update({ where: { id }, data: { verdict: "PASS", verdictAt: new Date(), completeness: { missing: [] } } }));
      for (const p of [a, b]) await db.openedBidInitial.create({ data: { organisationId: org, openedBidId: id, personId: p.person.id, recordedAt: new Date(), correctionNo: 0 } });
      expect((await bidRow(id)).columnRevision).toBe(0);
    }
    who.actor = a.actor;
    expect((await recordScheduleDetails({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, schedulePages: "2", minutes: "" }))).ok).toBe(true);
    const done = await finaliseOpening({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, paperCopy: "notInBox" }));
    expect(done.ok, message(done)).toBe(true);
  }, 300_000);
});

// ------------------------------------------------------------------ the filed download

const callFiled = (as: unknown, fields: Record<string, string>, headers: Record<string, string> = {}) => {
  who.actor = as;
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return filedFile(new Request("http://localhost/api/opening/filed-file", { method: "POST", body, headers }) as unknown as NextRequest);
};
const jsonOf = async (res: Response) => (await res.json()) as { ok: boolean; code?: string; message?: string; fields?: Record<string, string> };

/// An unsealed exercise with one bid, decided and signed, finalised with the mover held back so no file is filed yet.
async function finalisedUnfiled() {
  const u = await unsealed(2, 1);
  await prepare(u.ex, u.opening.id, u.offers);
  for (const o of u.ex.officers) expect((await sign(u.ex, u.opening.id, o)).ok).toBe(true);
  mover.skip = true;
  try {
    const done = await finalise(u.ex, u.opening.id, u.ex.officers[0]);
    expect(done.ok, message(done)).toBe(true);
  } finally {
    mover.skip = false;
  }
  const check = await db.onlineBidFile.findFirstOrThrow({ where: { exerciseId: u.ex.id, packPartId: u.ex.partA } });
  const other = await db.onlineBidFile.findFirstOrThrow({ where: { exerciseId: u.ex.id, packPartId: u.ex.partB } });
  return { ...u, check: check.id, other: other.id, req: { exerciseId: u.ex.id, openingId: u.opening.id } };
}

describe("POST /api/opening/filed-file (20cl)", () => {
  it("is refused before finalising, files the file on the first call after and not again on the second, and sends the reader to the filed version", async () => {
    const u = await unsealed(2, 1);
    const check = await db.onlineBidFile.findFirstOrThrow({ where: { exerciseId: u.ex.id, packPartId: u.ex.partA } });
    const req = { exerciseId: u.ex.id, openingId: u.opening.id, fileId: check.id };
    const early = await callFiled(u.ex.officers[0].actor, req);
    expect(early.status).toBe(409);
    expect((await jsonOf(early)).message).toBe(FILED_FILE_WORDS.NOT_FINALISED);
    await prepare(u.ex, u.opening.id, u.offers);
    for (const o of u.ex.officers) expect((await sign(u.ex, u.opening.id, o)).ok).toBe(true);
    mover.skip = true;
    try {
      expect((await finalise(u.ex, u.opening.id, u.ex.officers[0])).ok).toBe(true);
    } finally {
      mover.skip = false;
    }
    expect(await db.documentAttachment.count({ where: { onlineBidFileId: check.id } })).toBe(0);
    const first = await callFiled(u.ex.officers[0].actor, req);
    expect(first.status).toBe(303);
    const attachment = await db.documentAttachment.findFirstOrThrow({ where: { onlineBidFileId: check.id } });
    expect(first.headers.get("location")).toBe(`/api/documents/versions/${attachment.versionId}`);
    const documents = await db.document.count({ where: { organisationId: org } });
    const second = await callFiled(u.ex.officers[1].actor, req);
    expect(second.status).toBe(303);
    expect(second.headers.get("location")).toBe(first.headers.get("location"));
    expect(await db.document.count({ where: { organisationId: org } })).toBe(documents);
    expect(await db.documentAttachment.count({ where: { onlineBidFileId: check.id } })).toBe(1);
    // The matrix asks in JSON (a fetch cannot read a redirect's address): the same answer, as the document's address.
    const asked = await callFiled(u.ex.officers[0].actor, req, { accept: "application/json" });
    expect(asked.status).toBe(200);
    expect((await jsonOf(asked)) as unknown).toEqual({ ok: true, location: first.headers.get("location") });
  }, 300_000);

  it("refuses an administrator (403), a request another site started (nothing is filed), a part the officers do not open, a file of no bid here, and an invalid form", async () => {
    const u = await finalisedUnfiled();
    const req = { ...u.req, fileId: u.check };
    const admin = await signedIn(true);
    const denied = await callFiled(admin.actor, req);
    expect(denied.status).toBe(403);
    expect((await jsonOf(denied)).message).toBe(FILED_FILE_WORDS.ADMINISTRATOR);
    // The refusal is written to the sealed access log, with its reason and the file.
    expect(await db.sealedAccessEvent.count({ where: { exerciseId: u.ex.id, kind: "DOWNLOAD", outcome: "REFUSED", reasonCode: "ADMINISTRATOR", recordId: u.check } })).toBe(1);
    const cross = await callFiled(u.ex.officers[0].actor, req, { "sec-fetch-site": "cross-site" });
    expect(cross.status).toBe(403);
    // Nothing was filed by either.
    expect(await db.documentAttachment.count({ where: { onlineBidFileId: u.check } })).toBe(0);
    const notChecked = await callFiled(u.ex.officers[0].actor, { ...u.req, fileId: u.other });
    expect(notChecked.status).toBe(409);
    expect((await jsonOf(notChecked)).message).toBe(FILED_FILE_WORDS.NOT_AN_OPENING_CHECK_FILE);
    const elsewhere = await callFiled(u.ex.officers[0].actor, { ...u.req, fileId: "no_such_file" });
    expect(elsewhere.status).toBe(404);
    const noOpening = await callFiled(u.ex.officers[0].actor, { ...req, openingId: "no_such_opening" });
    expect(noOpening.status).toBe(404);
    const bad = await callFiled(u.ex.officers[0].actor, { ...req, extra: "x", fileId: "not valid!" });
    expect(bad.status).toBe(400);
    const badBody = await jsonOf(bad);
    expect(badBody.code).toBe("VALIDATION");
    expect(Object.keys(badBody.fields ?? {}).sort()).toEqual(["extra", "fileId"]);
    expect((await filedFileHead()).status).toBe(405);
    expect(await db.documentAttachment.count({ where: { onlineBidFileId: u.check } })).toBe(0);
  }, 300_000);

  it("answers 409 in words while the class a filed bid takes is not set, files nothing, and files it once the class is set again", async () => {
    const u = await finalisedUnfiled();
    const req = { ...u.req, fileId: u.check };
    await setFileClass(null);
    try {
      const res = await callFiled(u.ex.officers[0].actor, req);
      expect(res.status).toBe(409);
      expect((await jsonOf(res)).message).toBe(FILED_FILE_WORDS.CLASS_NOT_SET);
      expect(await db.documentAttachment.count({ where: { onlineBidFileId: u.check } })).toBe(0);
    } finally {
      await setFileClass(ctx.bidFileClassId);
    }
    expect((await callFiled(u.ex.officers[0].actor, req)).status).toBe(303);
  }, 300_000);
});

// ------------------------------------------------------------------ SR-15 online, end to end

const granted = sulitGranted(true as const, "ORGANISATION_PERMISSION");
const csvLines = (csv: string) => csv.split("\r\n");

describe("SR-15 online: the schedule CSV matches the screen (ruling 24, 20cu)", () => {
  it("runs in opening order with the declared price and period, the register Kelas, 'Not typed: an online bid', and the estimate row last; and is refused before finalising", async () => {
    const holder = { id: "" };
    const { ex, opening, offers } = await unsealed(2, 2, async (e) => {
      holder.id = await estimateFor(e);
      expect((await lodgeAs(e, e.officers[0], holder.id)).ok).toBe(true);
    }, { alternatives: 1 });
    expect(offers).toHaveLength(3);
    const officer0: Officer = ex.officers[0];
    // Before finalising: the schedule is a draft, the CSV is refused (the route answers 409 on the same refusal).
    const draft = await scheduleSection(officer0.actor, ex.id, granted);
    expect(draft!.openings[0].finalised).toBe(false);
    expect(openingCsv("schedule", draft!.openings[0])).toEqual({ refusal: "NOT_FINALISED" });
    expect(openingCsv("summary", draft!.openings[0])).toEqual({ refusal: "NOT_FINALISED" });

    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    const done = await finalise(ex, opening.id, officer0);
    expect(done.ok, message(done)).toBe(true);

    const d = (await scheduleSection(officer0.actor, ex.id, granted))!;
    const o = d.openings[0];
    expect(o.online).toBe(true);
    expect(o.rows.map((r) => r.listingNo)).toEqual([1, 2, 3]);
    expect(o.rows.filter((r) => r.alternative).length).toBe(1);
    const built = openingCsv("schedule", o);
    if ("refusal" in built) throw new Error(built.refusal);
    const lines = csvLines(built.csv);
    const head = lines.findIndex((l) => l.includes("Class as read"));
    const data = lines.slice(head + 1, head + 1 + o.rows.length);
    expect(data).toHaveLength(3);
    o.rows.forEach((r, i) => {
      expect(data[i]).toContain(r.bidderName);
      // The declared price and period were written at the finalise and are the snapshot's.
      expect(data[i]).toContain("123,456.78");
      expect(r.period).toMatch(/9/);
      expect(data[i]).toContain(r.period);
      expect(data[i]).toContain(kelasText(r.registerClass));
      expect(data[i]).toContain(ONLINE_CLASS_AS_READ);
      expect(classAsReadText(r.registrationClass, o.online)).toBe(ONLINE_CLASS_AS_READ);
    });
    // The estimate row is last, with the disclosed figure.
    const last = lines.filter((l) => l !== "").at(-1)!;
    expect(last).toContain("Company estimate");
    expect(last).toMatch(/55,000/);
    expect(lines.indexOf(last)).toBeGreaterThan(head + o.rows.length);
    // The Grand Summary follows the screen's summary and the decisions.
    const sum = openingCsv("summary", o);
    if ("refusal" in sum) throw new Error(sum.refusal);
    for (const r of o.summary!.rows) expect(sum.csv).toContain(r.label);
    expect(o.summary!.rows.map((r) => r.listingNo)).toEqual(o.rows.map((r) => r.listingNo));
    const decisions = await db.openedBid.findMany({ where: { openingId: opening.id }, orderBy: { listingNo: "asc" }, select: { verdict: true } });
    expect(decisions.every((x) => x.verdict === "PASS")).toBe(true);
  }, 300_000);
});

// ------------------------------------------------------------------ names held (20c, 20cm)

describe("names are held from a reader who is not a named officer (20c, 20cm)", () => {
  it("returns no bidder's name, no acknowledgement day and no file to such a reader between the unseal and finalising; a named officer is given them; after finalising both are", async () => {
    const { ex, opening, offers } = await unsealed(2, 1, async (e) => {
      const window = await db.exerciseWindow.findFirstOrThrow({ where: { exerciseId: e.id } });
      const addendum = await db.addendum.create({ data: { organisationId: org, windowId: window.id, number: 1, title: "Clarification", whatChanged: "A clarification.", status: "ISSUED", renderedText: "A clarification.", frozenAt: new Date(), issuedOn: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) } });
      const party = await db.exerciseParty.findFirstOrThrow({ where: { exerciseId: e.id, vendorId: { not: null } } });
      const account = await db.supplierAccount.findFirstOrThrow({ where: { supplierId: party.vendorId! } });
      await db.addendumAcknowledgement.create({ data: { organisationId: org, addendumId: addendum.id, supplierId: party.vendorId!, acknowledgedBySupplierAccountId: account.id, acknowledgedOn: new Date("2026-10-12T00:00:00.000Z"), acknowledgedAt: new Date("2026-10-12T03:00:00.000Z") } });
    });
    const name = (await bidRow(offers[0].id)).bidderNameAsRead;
    const stranger = await signedIn();
    const named = ex.officers[0];

    const held = (await openingMatrix(org, ex.id, opening.id, { personId: stranger.person.id, administrator: false }))!;
    expect(held.phase).toBe("CHECKING");
    expect(held.viewerIsNamedOfficer).toBe(false);
    expect(held.columns.map((c) => c.bidder)).toEqual([NAMES_AT_FINALISING]);
    expect(JSON.stringify(held)).not.toContain(name);
    for (const col of held.columns) for (const cell of col.cells) {
      expect(cell.acknowledgedOn).toBeNull();
      expect(cell.fileIds).toEqual([]);
    }
    expect(held.columns[0].answer).toMatchObject({ allowed: false });

    const seen = (await openingMatrix(org, ex.id, opening.id, { personId: named.person.id, administrator: false }))!;
    expect(seen.viewerIsNamedOfficer).toBe(true);
    expect(seen.columns[0].bidder).toBe(name);
    const addendumCell = seen.columns[0].cells.find((c) => c.kind === "ADDENDUM")!;
    expect(addendumCell.acknowledgedOn).toBe("2026-10-12");
    expect(seen.columns[0].cells.find((c) => c.kind === "CHECK_FILES")!.fileIds).toHaveLength(1);
    expect(seen.rows.filter((r) => r.opened).map((r) => r.label)).toEqual(["Form of Tender"]);
    expect(seen.columns[0].answer).toEqual({ allowed: true });

    const admin = await signedIn(true);
    const asAdmin = (await openingMatrix(org, ex.id, opening.id, { personId: admin.person.id, administrator: true }))!;
    expect(asAdmin.columns[0].bidder).toBe(NAMES_AT_FINALISING);
    expect(asAdmin.columns[0].answer).toMatchObject({ allowed: false });

    // Plan 1.4, 20cm: the receipt digest (a supplier holds the same one on its receipt) and an officer's free-text reason are held from this reader as well, and given to the named officer.
    expect(held.columns[0].receiptDigest).toBeNull();
    const items = await itemsOf(opening.id);
    for (const [i, item] of items.entries()) expect((await answer(ex, named, offers[0].id, item.key, i === 0 ? "ABSENT" : "PRESENT")).ok).toBe(true);
    const rejected = await decide(ex, named, offers[0].id, "REJECT", `${name} did not return the form.`);
    expect(rejected.ok, message(rejected)).toBe(true);
    const heldAfter = (await openingMatrix(org, ex.id, opening.id, { personId: stranger.person.id, administrator: false }))!;
    expect(heldAfter.columns[0].decision).toMatchObject({ label: expect.any(String), reason: REASON_HELD_TEXT });
    expect(JSON.stringify(heldAfter)).not.toContain(name);
    const adminAfter = (await openingMatrix(org, ex.id, opening.id, { personId: admin.person.id, administrator: true }))!;
    expect(adminAfter.columns[0].decision?.reason).toBe(REASON_HELD_TEXT);
    expect(adminAfter.columns[0].receiptDigest).toBeNull();
    const namedAfter = (await openingMatrix(org, ex.id, opening.id, { personId: named.person.id, administrator: false }))!;
    expect(namedAfter.columns[0].decision?.reason).toBe(`${name} did not return the form.`);
    // The column carries what a confirmation or a decision posted from it is bound to.
    expect(namedAfter.columns[0].columnRevision).toBe((await bidRow(offers[0].id)).columnRevision);

    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    expect((await finalise(ex, opening.id, named)).ok).toBe(true);
    for (const who2 of [stranger, named]) {
      const after = (await openingMatrix(org, ex.id, opening.id, { personId: who2.person.id, administrator: false }))!;
      expect(after.phase).toBe("FINALISED");
      expect(after.columns[0].bidder).toBe(name);
      expect(after.columns[0].cells.find((c) => c.kind === "ADDENDUM")!.acknowledgedOn).toBe("2026-10-12");
    }
  }, 300_000);
});
