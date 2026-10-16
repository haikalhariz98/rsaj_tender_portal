import { randomBytes } from "node:crypto";

import { expect, vi } from "vitest";

/**
 * The online opening, built through the real actions, for the database tests of wave 3b and 3c (ADR 0036 D10; wave 3c plan §4, "the shared test helper"). Moved out of `online-finalise.db.test.ts` with its
 * assertions unchanged (20cl allows the reuse). Two things differ, both ruling 22: `prepare` records every answer, then the decision, then each officer's confirmation (an officer confirms a complete, decided column),
 * and `unsealed` takes an `alternatives` option that lets that many bidders also submit an alternative to their own bid.
 *
 * The test file that imports this one supplies the `vi.mock` calls (the signed-in actor, the cookies, the act, the cache): `who` is the one object the mocked actor module reads, so it is shared.
 */

import { actFieldNames } from "@/lib/auth/act-field-names";
import { authenticateSupplier, confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { submitBid, takeStamp } from "@/lib/bids/online/submit-store";
import { loadUploadFacts, storePart } from "@/lib/bids/online/upload-store";
import { SEALED_BIDS_DEMONSTRATION_ENV } from "@/lib/integration/sealing-deployment";
import type { BidPartRule } from "@/lib/bids/online/types";
import { checklistFromSnapshot } from "@/lib/opening/checklist";
import { who } from "@/lib/test-support/acting";
import { ensureAdministrator, facts, makeAccount, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { lodgeEstimate } from "../scope/actions";
import { setOfficerShare } from "../scope/key-actions";
import { authoriseOnlineUnseal } from "./unseal-actions";
import { finaliseOnline, signOnlineFinalise } from "./online-finalise-actions";
import { recordChecklistAnswer, recordInitial, recordScheduleDetails, recordVerdict, startOpening } from "./actions";

export { who };
const ENV_BEFORE = process.env[SEALED_BIDS_DEMONSTRATION_ENV];
export const PEPPER_ENV = ["SEALING_PEPPER", "SEALING_PEPPER_ID"] as const;
const SAVED = Object.fromEntries(PEPPER_ENV.map((k) => [k, process.env[k]]));

/// The scratch organisation, its namer and the class a filed bid takes: set by `fixtureSetup`.
export const ctx = { org: "", namer: "", bidFileClassId: "" };

export const DAY = 24 * 60 * 60 * 1000;
export const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
export const PLAIN = Buffer.from("%PDF-1.7\nTHE-PLAIN-MARKER-FOR-THE-UNSEAL-TEST\n");
export const DECLARATION = { price: "123456.78", completionPeriod: 9, completionUnit: "MONTHS" as const };
export const PASSWORD_FIELD = actFieldNames("personId").password;
export const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
export const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);
export const setClosing = (exerciseId: string, closing: Date) => db.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "closingAt" = $2 WHERE "id" = $1`, exerciseId, closing);
export type Officer = { person: { id: string }; account: { id: string }; password: string; actor: StaffActor; rosterId: string; passphrase: string };
export interface Ex { id: string; reference: string; windowId: string; partA: string; partB: string; officers: Officer[]; keyId: string; fingerprint: string }
export interface Session { actor: SupplierActor; supplierId: string; password: string }

export async function signedIn(admin = false): Promise<Omit<Officer, "rosterId" | "passphrase">> {
  const made = await makeAccount(ctx.org, { admin });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId: ctx.org, accountId: made.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { person: made.person, account: made.account, password: made.password, actor: read.actor as StaffActor };
}
export const rulesOf = (a: string, b: string): { v: 1; frozenAt: string; parts: BidPartRule[] } => ({
  v: 1,
  frozenAt: new Date().toISOString(),
  parts: [
    { packPartId: a, label: "Form of Tender", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000000", openingCheck: true },
    { packPartId: b, label: "Priced Bill", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000000", openingCheck: false },
  ],
});

/// A published ONLINE exercise in DEMONSTRATION mode with `n` named officers who have each set a real share (so the exercise key is real and split n-of-n), a committee of n whose
/// seats they hold, two returned parts, and a closing a day away.
export async function exercise(n: number, o: { requiresEstimate?: boolean } = {}): Promise<Ex> {
  const reference = `UNS/EX/${randomId()}`;
  const requisitionId = (
    await db.requisition.create({
      data: { organisationId: ctx.org, reference: `UNS/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: ctx.namer, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") },
    })
  ).id;
  const committee = await db.committee.create({ data: { organisationId: ctx.org, code: `UNS_C_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "Test", panelSize: n, panelSizeProvenance: "ASSUMED", panelExclusionRule: false, panelExclusionProvenance: "ASSUMED" } });
  const methodCode = `UNS_M_${randomId()}`;
  await db.sourcingMethod.create({ data: { organisationId: ctx.org, code: methodCode, nameEn: "Online tender", openingCommitteeCode: committee.code, openingCommitteeProvenance: "ASSUMED", requiresCompanyEstimate: o.requiresEstimate ?? false, requiresCompanyEstimateProvenance: "ASSUMED" } });
  const ex = await db.sourcingExercise.create({
    data: { organisationId: ctx.org, reference, requisitionId, title: "Unseal test", estimatedValue: "1000.00", sourcingMethodCode: methodCode, status: "DOCUMENTS_IN_PREPARATION", closingAt: new Date(Date.now() + DAY), submissionChannel: "ONLINE", onlineSubmissionMode: "DEMONSTRATION", openingRosterRequired: true, packKindSnapshot: "TENDER", restrictedTender: false },
  });
  const window = await db.exerciseWindow.create({
    data: {
      organisationId: ctx.org, exerciseId: ex.id, path: "ADVERTISED", publishedAt: new Date(Date.now() - 2 * DAY), advertisementDay: D(new Date(Date.now() - 2 * DAY)),
      policySnapshot: { attendance: { mandatoryPermitted: true }, bidRules: { lateAdmissionCommitteeCode: committee.code, lateAdmissionProvenance: "ASSUMED", minimumBids: null, completenessEliminates: true, completenessProvenance: "ASSUMED" } },
      purchaseFromDay: D(new Date(Date.now() - DAY)), purchaseCloseDay: D(new Date(Date.now() + 10 * DAY)), feeAmount: "50.00", alternativesPermitted: true,
    },
  });
  const pack = await db.tenderPack.create({ data: { organisationId: ctx.org, exerciseId: ex.id, versionNo: 1, packKind: "TENDER", status: "APPROVED", approvedStartOn: D(new Date(Date.now() - DAY)), approvedClosingAt: new Date(Date.now() + DAY), approvedAt: new Date(Date.now() - DAY), frozenAt: new Date(), submittedAt: new Date(), contractBasisCode: "X", compositionSnapshot: {} } });
  const partA = (await db.tenderPackPart.create({ data: { organisationId: ctx.org, packId: pack.id, partCode: "FORM", printedNumber: "1", sortOrder: 1, labelSnapshot: "Form of Tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", returnedByBidder: true, mandatory: true } })).id;
  const partB = (await db.tenderPackPart.create({ data: { organisationId: ctx.org, packId: pack.id, partCode: "BQ", printedNumber: "2", sortOrder: 2, labelSnapshot: "Priced Bill", role: "BILL_OF_QUANTITIES", content: "STANDARD", source: "TEMPLATE", returnedByBidder: true, mandatory: true } })).id;

  const officers: Officer[] = [];
  for (let i = 0; i < n; i++) {
    const o = await signedIn();
    const row = await db.exerciseOpeningOfficer.create({ data: { organisationId: ctx.org, exerciseId: ex.id, personId: o.person.id, seatLabelSnapshot: `Member ${i + 1}`, namedAt: new Date(), namedByPersonId: ctx.namer } });
    await db.committeeMember.create({ data: { committeeId: committee.id, personId: o.person.id, seatLabel: `Member ${i + 1}`, position: "MEMBER", effectiveFrom: new Date("2026-01-01") } });
    officers.push({ ...o, rosterId: row.id, passphrase: `unseal passphrase number ${i + 1} ${randomId()}` });
  }
  for (const o of officers) {
    who.actor = o.actor;
    const r = await setOfficerShare({ ok: false }, form({ exerciseId: ex.id, passphrase: o.passphrase, repeat: o.passphrase, [PASSWORD_FIELD]: o.password }));
    if (!r.ok) throw new Error(`share not set: ${JSON.stringify(r)}`);
  }
  const key = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
  await db.sourcingExercise.update({ where: { id: ex.id }, data: { onlineBidRules: rulesOf(partA, partB) as never, publishedKeyFingerprint: key.fingerprint } });
  await db.sourcingExercise.update({ where: { id: ex.id }, data: { status: "ADVERTISED" } });
  return { id: ex.id, reference, windowId: window.id, partA, partB, officers, keyId: key.id, fingerprint: key.fingerprint };
}

export async function bidder(ex: Ex): Promise<Session> {
  const made = await makeSupplierAccount(ctx.org);
  await db.supplier.update({ where: { id: made.supplier.id }, data: { status: "REGISTERED", registeredOn: D(new Date(Date.now() - 100 * DAY)) } });
  const party = await db.exerciseParty.create({ data: { organisationId: ctx.org, exerciseId: ex.id, source: "PURCHASER", name: `Bidder ${randomId()}`, registrationNo: `RN-${randomId()}`, vendorId: made.supplier.id } });
  await db.documentSale.create({ data: { organisationId: ctx.org, windowId: ex.windowId, partyId: party.id, soldOn: D(new Date()), collectedBy: "A collector", authoritySighted: true, amount: "50.00", paymentMethod: "Cash", issuedByPersonId: ctx.namer, annotation: { v: 1, purchaser: party.name } } });
  const out = await authenticateSupplier({ loginName: made.loginName, password: made.password }, facts(), null);
  if (!out.ok) throw new Error(`sign-in failed: ${JSON.stringify(out)}`);
  const real = await vi.importActual<typeof import("@/lib/auth/supplier-session-store")>("@/lib/auth/supplier-session-store");
  const read = await real.readSupplierSession(out.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session read failed");
  return { actor: read.actor, supplierId: made.supplier.id, password: made.password };
}

export async function upload(s: Session, ex: Ex, packPartId: string): Promise<string> {
  const f = await loadUploadFacts(db, s.actor, { exerciseId: ex.id, packPartId });
  if (!f) throw new Error("the supplier cannot see the exercise");
  return (await storePart(s.actor, { facts: f, packPartId, plain: new Uint8Array(PLAIN), filename: "tender.pdf", mediaType: "application/pdf", scan: "NOT_SCANNED", scannerConfigured: false })).fileId;
}

export async function submit(s: Session, ex: Ex, o: { kind?: "BID" | "ALTERNATIVE"; parent?: string | null; replaces?: string | null; skipPartB?: boolean } = {}) {
  // `skipPartB` returns the bid without its second part (the mandatory part is then recorded as missing at the opening).
  const fileIds = [await upload(s, ex, ex.partA), ...(o.skipPartB ? [] : [await upload(s, ex, ex.partB)])];
  const stamp = await takeStamp();
  const asked = await confirmSupplierPassword(s.actor, s.password, facts());
  if (!asked.ok) throw new Error("password refused");
  const r = await submitBid(s.actor, { exerciseId: ex.id, kind: o.kind ?? "BID", parentOnlineBidId: o.parent ?? null, replacesOnlineBidId: o.replaces ?? null, fileIds, declaration: DECLARATION, stamp, stepUpAt: asked.at });
  if (!r.ok) throw new Error(`submit refused: ${JSON.stringify(r)}`);
  return r.onlineBidId;
}

export const start = async (ex: Ex, by: Officer = ex.officers[0]) => {
  who.actor = by.actor;
  return startOpening({ ok: false }, form({ exerciseId: ex.id }));
};
export const authorise = async (ex: Ex, openingId: string, o: Officer, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return authoriseOnlineUnseal({ ok: false }, form({ exerciseId: ex.id, openingId, passphrase: o.passphrase, [PASSWORD_FIELD]: o.password, ...over }));
};
export const openingOf = (ex: Ex) => db.opening.findFirstOrThrow({ where: { exerciseId: ex.id, kind: "MAIN" } });
export const message = (r: { message?: string; errors?: Record<string, string> }) => r.message ?? JSON.stringify(r.errors);
/// The class a filed bid takes, set once for the scratch organisation (the setting the finalise needs and the mover reads).
export async function setFileClass(id: string | null) {
  await db.documentStorePolicy.upsert({ where: { organisationId: ctx.org }, create: { organisationId: ctx.org, allowedMediaTypes: [], maxBytes: null, onlineBidFileClassId: id, provenance: "ASSUMED" }, update: { onlineBidFileClassId: id } });
}
/// An unsealed online opening with `bids` bidders, each with a bid of two files, every named officer having authorised. Ready for the checklist, the verdicts and the signatures.
export async function unsealed(n: number, bids: number, beforeStart?: (ex: Ex) => Promise<void>, o: { alternatives?: number; skipPartBOnFirst?: boolean } = {}) {
  const ex = await exercise(n);
  const sessions: Session[] = [];
  for (let i = 0; i < bids; i++) {
    const s = await bidder(ex);
    sessions.push(s);
    const main = await submit(s, ex, { skipPartB: i === 0 && o.skipPartBOnFirst });
    // Wave 3c: the first `alternatives` bidders also submit an alternative to their own bid.
    if (i < (o.alternatives ?? 0)) await submit(s, ex, { kind: "ALTERNATIVE", parent: main });
  }
  if (beforeStart) await beforeStart(ex);
  await setClosing(ex.id, ago(40));
  const started = await start(ex);
  expect(started.ok, message(started)).toBe(true);
  const opening = await openingOf(ex);
  for (const o of ex.officers) {
    const r = await authorise(ex, opening.id, o);
    expect(r.ok, message(r)).toBe(true);
  }
  const offers = await db.openedBid.findMany({ where: { openingId: opening.id }, orderBy: { listingNo: "asc" } });
  expect(offers).toHaveLength(bids + (o.alternatives ?? 0));
  return { ex, opening, offers };
}

/// What the finalise's faults need before any finalise, in the order ruling 22 asks for: every checklist item answered, a decision on each offer, then every officer's confirmation of the column as it stands, and the pages.
export async function prepare(ex: Ex, openingId: string, offers: { id: string }[]) {
  const opening = await db.opening.findUniqueOrThrow({ where: { id: openingId } });
  const items = checklistFromSnapshot(opening.checklistSnapshot).items;
  for (const offer of offers) {
    who.actor = ex.officers[0].actor;
    for (const item of items) {
      const r = await recordChecklistAnswer({ ok: false }, form({ exerciseId: ex.id, openedBidId: offer.id, itemKey: item.key, answer: "PRESENT" }));
      expect(r.ok, message(r)).toBe(true);
    }
    who.actor = ex.officers[0].actor;
    const v = await recordVerdict({ ok: false }, form({ exerciseId: ex.id, openedBidId: offer.id, verdict: "PASS" }));
    expect(v.ok, message(v)).toBe(true);
    for (const o of ex.officers) {
      who.actor = o.actor;
      const r = await recordInitial({ ok: false }, form({ exerciseId: ex.id, openedBidId: offer.id }));
      expect(r.ok, message(r)).toBe(true);
    }
  }
  who.actor = ex.officers[0].actor;
  const p = await recordScheduleDetails({ ok: false }, form({ exerciseId: ex.id, openingId, schedulePages: "3", minutes: "" }));
  expect(p.ok, message(p)).toBe(true);
}

export const sign = (ex: Ex, openingId: string, o: Officer, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return signOnlineFinalise({ ok: false }, form({ exerciseId: ex.id, openingId, [PASSWORD_FIELD]: o.password, ...over }));
};
export const finalise = (ex: Ex, openingId: string, o: Officer, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return finaliseOnline({ ok: false }, form({ exerciseId: ex.id, openingId, passphrase: o.passphrase, [PASSWORD_FIELD]: o.password, ...over }));
};
export const filesOf = (exerciseId: string) => db.onlineBidFile.findMany({ where: { exerciseId, state: "SUBMITTED" }, include: { attachment: true } });
export const FIGURE_TEXT = "55000.00";
export async function estimateFor(ex: Ex) {
  const preparer = ex.officers[0].person.id;
  const est = await db.companyEstimate.create({ data: { organisationId: ctx.org, exerciseId: ex.id, preparerPersonId: preparer, currentVersionNo: 1, state: "DRAFT" } });
  await db.companyEstimateVersion.create({ data: { organisationId: ctx.org, estimateId: est.id, versionNo: 1, value: FIGURE_TEXT, preparedOn: new Date("2026-09-01"), preparerPersonId: preparer } });
  return est.id;
}
export const lodgeAs = (ex: Ex, o: Officer, estimateId: string, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return lodgeEstimate({ ok: false }, form({ exerciseId: ex.id, estimateId, capacity: "Head of department", [PASSWORD_FIELD]: o.password, ...over }));
};

/// The demonstration deployment, the scratch organisation with its policies, a person to name officers, and the SULIT class a filed bid takes (the setting the finalise needs and the mover reads).
export async function fixtureSetup() {
  process.env[SEALED_BIDS_DEMONSTRATION_ENV] = "true";
  for (const k of PEPPER_ENV) delete process.env[k];
  // The suppliers' sign-in finds its organisation by ORGANISATION_CODE, read once when the module loads: the shared test organisation, as the other sealed tests use. Its policy is set here.
  ctx.org = (await testOrganisation()).id;
  await setPolicy(ctx.org, { ...SUPPLIER_SETTINGS, sealingPassphraseMinLength: 12 });
  await ensureAdministrator(ctx.org);
  await db.bidSealingPolicy.upsert({ where: { organisationId: ctx.org }, create: { organisationId: ctx.org, onlineSubmission: "DEMONSTRATION" }, update: { onlineSubmission: "DEMONSTRATION" } });
  await db.openingPolicy.upsert({ where: { organisationId: ctx.org }, create: { organisationId: ctx.org, invitedCountReading: "PURCHASERS", invitedCountProvenance: "ASSUMED" }, update: { invitedCountReading: "PURCHASERS", invitedCountProvenance: "ASSUMED" } });
  ctx.namer = (await db.person.create({ data: { organisationId: ctx.org, name: `Namer ${randomId()}` } })).id;
  ctx.bidFileClassId = (await db.documentClass.create({ data: { organisationId: ctx.org, code: `BIDF_${randomId()}`, nameEn: "Online bid files", classification: "SULIT" } })).id;
  await setFileClass(ctx.bidFileClassId);
  return ctx;
}

/// Puts the environment back as it was and lets go of the connection.
export async function fixtureTeardown() {
  for (const k of PEPPER_ENV) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  if (ENV_BEFORE === undefined) delete process.env[SEALED_BIDS_DEMONSTRATION_ENV];
  else process.env[SEALED_BIDS_DEMONSTRATION_ENV] = ENV_BEFORE;
  await db.$disconnect();
}

