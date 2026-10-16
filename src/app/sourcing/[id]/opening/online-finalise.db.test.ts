import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Wave 3b step 15 against the scratch database, through the real actions, keys, mover and triggers (ADR 0036 D10, rulings 20, 20t, 20y; build plan step 15): every named officer signs, any one finalises
 * with their own passphrase, the declared figures are written only then and the snapshots carry them, every file is verified before the commit, the data keys are released and the mover files the files
 * in the document store without duplicates. Only the request is stood in for: who is signed in, the cookies and the cache.
 */

const who = vi.hoisted(() => ({ actor: null as unknown }));
const opened = vi.hoisted(() => ({ calls: [] as { fn: string; purpose: string; recordId: string }[] }));
const mover = vi.hoisted(() => ({ skip: false }));

vi.mock("@/app/_auth/actor", async () => {
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
    paperSignatureRecording: async () => null,
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
// The finalise's own call of the mover is skipped where a test drives the mover by hand.
vi.mock("@/lib/sealing/online-file-mover", async (orig) => {
  const real = await orig<typeof import("@/lib/sealing/online-file-mover")>();
  return { ...real, moveReleasedFiles: (...a: Parameters<typeof real.moveReleasedFiles>) => (mover.skip ? Promise.resolve({ moved: 0, failed: [], remaining: -1 }) : real.moveReleasedFiles(...a)) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
// The one way out of a seal, recorded: which records were ever decrypted, and for what.
vi.mock("@/lib/sealing/open", async (orig) => {
  const real = await orig<typeof import("@/lib/sealing/open")>();
  return {
    hpkeOpen: (k: Uint8Array, s: Parameters<typeof real.hpkeOpen>[1], aad: Parameters<typeof real.hpkeOpen>[2]) => (opened.calls.push({ fn: "hpkeOpen", purpose: aad.purpose, recordId: aad.recordId }), real.hpkeOpen(k, s, aad)),
    gcmOpen: (k: Uint8Array, s: Parameters<typeof real.gcmOpen>[1], aad: Parameters<typeof real.gcmOpen>[2]) => (opened.calls.push({ fn: "gcmOpen", purpose: aad.purpose, recordId: aad.recordId }), real.gcmOpen(k, s, aad)),
  };
});

import { actFieldNames } from "@/lib/auth/act-field-names";
import { authenticateSupplier, confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { submitBid, takeStamp } from "@/lib/bids/online/submit-store";
import { loadUploadFacts, storePart } from "@/lib/bids/online/upload-store";
import { RATE_LIMITS } from "@/lib/portal/bids/limits";
import { SEALED_BIDS_DEMONSTRATION_ENV } from "@/lib/integration/sealing-deployment";
import type { BidPartRule } from "@/lib/bids/online/types";
import { ensureAdministrator, facts, makeAccount, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { lodgeEstimate } from "../scope/actions";
import { checkUnlock, rekeyExercise, setOfficerShare } from "../scope/key-actions";
import { authoriseOnlineUnseal } from "./unseal-actions";
import { finaliseOnline, signOnlineFinalise } from "./online-finalise-actions";
import { ensureFileMoved, moveReleasedFiles } from "@/lib/sealing/online-file-mover";
import { checklistFromSnapshot } from "@/lib/opening/checklist";
import { sulitGranted } from "@/lib/auth/sulit-access";
import { openingSection } from "@/lib/opening/read";
import { loadOpeningCheckFiles } from "@/lib/opening/sealed-file-store";
import { loadPepperList } from "@/lib/sealing/pepper-store";
import { finaliseOpening, recordChecklistAnswer, recordInitial, recordScheduleDetails, recordVerdict, startOpening } from "./actions";

const DAY = 24 * 60 * 60 * 1000;
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const PLAIN = Buffer.from("%PDF-1.7\nTHE-PLAIN-MARKER-FOR-THE-UNSEAL-TEST\n");
const DECLARATION = { price: "123456.78", completionPeriod: 9, completionUnit: "MONTHS" as const };
const ENV_BEFORE = process.env[SEALED_BIDS_DEMONSTRATION_ENV];
const PEPPER_ENV = ["SEALING_PEPPER", "SEALING_PEPPER_ID"] as const;
const SAVED = Object.fromEntries(PEPPER_ENV.map((k) => [k, process.env[k]]));
const PASSWORD_FIELD = actFieldNames("personId").password;

let org = "";
let namer = "";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);
const setClosing = (exerciseId: string, closing: Date) => db.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "closingAt" = $2 WHERE "id" = $1`, exerciseId, closing);

type Officer = { person: { id: string }; account: { id: string }; password: string; actor: StaffActor; rosterId: string; passphrase: string };
interface Ex { id: string; reference: string; windowId: string; partA: string; partB: string; officers: Officer[]; keyId: string; fingerprint: string }
interface Session { actor: SupplierActor; supplierId: string; password: string }

async function signedIn(admin = false): Promise<Omit<Officer, "rosterId" | "passphrase">> {
  const made = await makeAccount(org, { admin });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId: org, accountId: made.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { person: made.person, account: made.account, password: made.password, actor: read.actor as StaffActor };
}

const rulesOf = (a: string, b: string): { v: 1; frozenAt: string; parts: BidPartRule[] } => ({
  v: 1,
  frozenAt: new Date().toISOString(),
  parts: [
    { packPartId: a, label: "Form of Tender", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000000", openingCheck: true },
    { packPartId: b, label: "Priced Bill", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000000", openingCheck: false },
  ],
});

/// A published ONLINE exercise in DEMONSTRATION mode with `n` named officers who have each set a real share (so the exercise key is real and split n-of-n), a committee of n whose
/// seats they hold, two returned parts, and a closing a day away.
async function exercise(n: number, o: { requiresEstimate?: boolean } = {}): Promise<Ex> {
  const reference = `UNS/EX/${randomId()}`;
  const requisitionId = (
    await db.requisition.create({
      data: { organisationId: org, reference: `UNS/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: namer, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") },
    })
  ).id;
  const committee = await db.committee.create({ data: { organisationId: org, code: `UNS_C_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "Test", panelSize: n, panelSizeProvenance: "ASSUMED", panelExclusionRule: false, panelExclusionProvenance: "ASSUMED" } });
  const methodCode = `UNS_M_${randomId()}`;
  await db.sourcingMethod.create({ data: { organisationId: org, code: methodCode, nameEn: "Online tender", openingCommitteeCode: committee.code, openingCommitteeProvenance: "ASSUMED", requiresCompanyEstimate: o.requiresEstimate ?? false, requiresCompanyEstimateProvenance: "ASSUMED" } });
  const ex = await db.sourcingExercise.create({
    data: { organisationId: org, reference, requisitionId, title: "Unseal test", estimatedValue: "1000.00", sourcingMethodCode: methodCode, status: "DOCUMENTS_IN_PREPARATION", closingAt: new Date(Date.now() + DAY), submissionChannel: "ONLINE", onlineSubmissionMode: "DEMONSTRATION", openingRosterRequired: true, packKindSnapshot: "TENDER", restrictedTender: false },
  });
  const window = await db.exerciseWindow.create({
    data: {
      organisationId: org, exerciseId: ex.id, path: "ADVERTISED", publishedAt: new Date(Date.now() - 2 * DAY), advertisementDay: D(new Date(Date.now() - 2 * DAY)),
      policySnapshot: { attendance: { mandatoryPermitted: true }, bidRules: { lateAdmissionCommitteeCode: committee.code, lateAdmissionProvenance: "ASSUMED", minimumBids: null, completenessEliminates: true, completenessProvenance: "ASSUMED" } },
      purchaseFromDay: D(new Date(Date.now() - DAY)), purchaseCloseDay: D(new Date(Date.now() + 10 * DAY)), feeAmount: "50.00", alternativesPermitted: true,
    },
  });
  const pack = await db.tenderPack.create({ data: { organisationId: org, exerciseId: ex.id, versionNo: 1, packKind: "TENDER", status: "APPROVED", approvedStartOn: D(new Date(Date.now() - DAY)), approvedClosingAt: new Date(Date.now() + DAY), approvedAt: new Date(Date.now() - DAY), frozenAt: new Date(), submittedAt: new Date(), contractBasisCode: "X", compositionSnapshot: {} } });
  const partA = (await db.tenderPackPart.create({ data: { organisationId: org, packId: pack.id, partCode: "FORM", printedNumber: "1", sortOrder: 1, labelSnapshot: "Form of Tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", returnedByBidder: true, mandatory: true } })).id;
  const partB = (await db.tenderPackPart.create({ data: { organisationId: org, packId: pack.id, partCode: "BQ", printedNumber: "2", sortOrder: 2, labelSnapshot: "Priced Bill", role: "BILL_OF_QUANTITIES", content: "STANDARD", source: "TEMPLATE", returnedByBidder: true, mandatory: true } })).id;

  const officers: Officer[] = [];
  for (let i = 0; i < n; i++) {
    const o = await signedIn();
    const row = await db.exerciseOpeningOfficer.create({ data: { organisationId: org, exerciseId: ex.id, personId: o.person.id, seatLabelSnapshot: `Member ${i + 1}`, namedAt: new Date(), namedByPersonId: namer } });
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

async function bidder(ex: Ex): Promise<Session> {
  const made = await makeSupplierAccount(org);
  await db.supplier.update({ where: { id: made.supplier.id }, data: { status: "REGISTERED", registeredOn: D(new Date(Date.now() - 100 * DAY)) } });
  const party = await db.exerciseParty.create({ data: { organisationId: org, exerciseId: ex.id, source: "PURCHASER", name: `Bidder ${randomId()}`, registrationNo: `RN-${randomId()}`, vendorId: made.supplier.id } });
  await db.documentSale.create({ data: { organisationId: org, windowId: ex.windowId, partyId: party.id, soldOn: D(new Date()), collectedBy: "A collector", authoritySighted: true, amount: "50.00", paymentMethod: "Cash", issuedByPersonId: namer, annotation: { v: 1, purchaser: party.name } } });
  const out = await authenticateSupplier({ loginName: made.loginName, password: made.password }, facts(), null);
  if (!out.ok) throw new Error(`sign-in failed: ${JSON.stringify(out)}`);
  const real = await vi.importActual<typeof import("@/lib/auth/supplier-session-store")>("@/lib/auth/supplier-session-store");
  const read = await real.readSupplierSession(out.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session read failed");
  return { actor: read.actor, supplierId: made.supplier.id, password: made.password };
}

async function upload(s: Session, ex: Ex, packPartId: string): Promise<string> {
  const f = await loadUploadFacts(db, s.actor, { exerciseId: ex.id, packPartId });
  if (!f) throw new Error("the supplier cannot see the exercise");
  return (await storePart(s.actor, { facts: f, packPartId, plain: new Uint8Array(PLAIN), filename: "tender.pdf", mediaType: "application/pdf", scan: "NOT_SCANNED", scannerConfigured: false })).fileId;
}

async function submit(s: Session, ex: Ex, o: { kind?: "BID" | "ALTERNATIVE"; parent?: string | null; replaces?: string | null } = {}) {
  const fileIds = [await upload(s, ex, ex.partA), await upload(s, ex, ex.partB)];
  const stamp = await takeStamp();
  const asked = await confirmSupplierPassword(s.actor, s.password, facts());
  if (!asked.ok) throw new Error("password refused");
  const r = await submitBid(s.actor, { exerciseId: ex.id, kind: o.kind ?? "BID", parentOnlineBidId: o.parent ?? null, replacesOnlineBidId: o.replaces ?? null, fileIds, declaration: DECLARATION, stamp, stepUpAt: asked.at });
  if (!r.ok) throw new Error(`submit refused: ${JSON.stringify(r)}`);
  return r.onlineBidId;
}

const start = async (ex: Ex, by: Officer = ex.officers[0]) => {
  who.actor = by.actor;
  return startOpening({ ok: false }, form({ exerciseId: ex.id }));
};
const authorise = async (ex: Ex, openingId: string, o: Officer, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return authoriseOnlineUnseal({ ok: false }, form({ exerciseId: ex.id, openingId, passphrase: o.passphrase, [PASSWORD_FIELD]: o.password, ...over }));
};
const openingOf = (ex: Ex) => db.opening.findFirstOrThrow({ where: { exerciseId: ex.id, kind: "MAIN" } });
const events = (exerciseId: string) => db.sealedAccessEvent.findMany({ where: { exerciseId }, orderBy: { at: "asc" } });
const message = (r: { message?: string; errors?: Record<string, string> }) => r.message ?? JSON.stringify(r.errors);

beforeAll(async () => {
  process.env[SEALED_BIDS_DEMONSTRATION_ENV] = "true";
  for (const k of PEPPER_ENV) delete process.env[k];
  // The suppliers' sign-in finds its organisation by ORGANISATION_CODE, read once when the module loads: the shared test organisation, as the other sealed tests use. Its policy is set here.
  org = (await testOrganisation()).id;
  await setPolicy(org, { ...SUPPLIER_SETTINGS, sealingPassphraseMinLength: 12 });
  await ensureAdministrator(org);
  await db.bidSealingPolicy.upsert({ where: { organisationId: org }, create: { organisationId: org, onlineSubmission: "DEMONSTRATION" }, update: { onlineSubmission: "DEMONSTRATION" } });
  await db.openingPolicy.upsert({ where: { organisationId: org }, create: { organisationId: org, invitedCountReading: "PURCHASERS", invitedCountProvenance: "ASSUMED" }, update: { invitedCountReading: "PURCHASERS", invitedCountProvenance: "ASSUMED" } });
  namer = (await db.person.create({ data: { organisationId: org, name: `Namer ${randomId()}` } })).id;
});

afterAll(async () => {
  for (const k of PEPPER_ENV) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  if (ENV_BEFORE === undefined) delete process.env[SEALED_BIDS_DEMONSTRATION_ENV];
  else process.env[SEALED_BIDS_DEMONSTRATION_ENV] = ENV_BEFORE;
  await db.$disconnect();
});

let bidFileClassId = "";
const sha256Of = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/// The class a filed bid takes, set once for the scratch organisation (the setting the finalise needs and the mover reads).
async function setFileClass(id: string | null) {
  await db.documentStorePolicy.upsert({ where: { organisationId: org }, create: { organisationId: org, allowedMediaTypes: [], maxBytes: null, onlineBidFileClassId: id, provenance: "ASSUMED" }, update: { onlineBidFileClassId: id } });
}

beforeAll(async () => {
  bidFileClassId = (await db.documentClass.create({ data: { organisationId: org, code: `BIDF_${randomId()}`, nameEn: "Online bid files", classification: "SULIT" } })).id;
  await setFileClass(bidFileClassId);
});

/// An unsealed online opening with `bids` bidders, each with a bid of two files, every named officer having authorised. Ready for the checklist, the verdicts and the signatures.
async function unsealed(n: number, bids: number, beforeStart?: (ex: Ex) => Promise<void>) {
  const ex = await exercise(n);
  const sessions: Session[] = [];
  for (let i = 0; i < bids; i++) {
    const s = await bidder(ex);
    sessions.push(s);
    await submit(s, ex);
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
  expect(offers).toHaveLength(bids);
  return { ex, opening, offers };
}

/// What the paper finalise's faults need before any finalise: every checklist item answered, every officer's initial, a verdict on each offer, and the pages.
async function prepare(ex: Ex, openingId: string, offers: { id: string }[]) {
  const opening = await db.opening.findUniqueOrThrow({ where: { id: openingId } });
  const items = checklistFromSnapshot(opening.checklistSnapshot).items;
  for (const offer of offers) {
    who.actor = ex.officers[0].actor;
    for (const item of items) {
      const r = await recordChecklistAnswer({ ok: false }, form({ exerciseId: ex.id, openedBidId: offer.id, itemKey: item.key, answer: "PRESENT" }));
      expect(r.ok, message(r)).toBe(true);
    }
    for (const o of ex.officers) {
      who.actor = o.actor;
      const r = await recordInitial({ ok: false }, form({ exerciseId: ex.id, openedBidId: offer.id }));
      expect(r.ok, message(r)).toBe(true);
    }
    who.actor = ex.officers[0].actor;
    const v = await recordVerdict({ ok: false }, form({ exerciseId: ex.id, openedBidId: offer.id, verdict: "PASS" }));
    expect(v.ok, message(v)).toBe(true);
  }
  who.actor = ex.officers[0].actor;
  const p = await recordScheduleDetails({ ok: false }, form({ exerciseId: ex.id, openingId, schedulePages: "3", minutes: "" }));
  expect(p.ok, message(p)).toBe(true);
}

const sign = (ex: Ex, openingId: string, o: Officer, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return signOnlineFinalise({ ok: false }, form({ exerciseId: ex.id, openingId, [PASSWORD_FIELD]: o.password, ...over }));
};
const finalise = (ex: Ex, openingId: string, o: Officer, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return finaliseOnline({ ok: false }, form({ exerciseId: ex.id, openingId, passphrase: o.passphrase, [PASSWORD_FIELD]: o.password, ...over }));
};
const filesOf = (exerciseId: string) => db.onlineBidFile.findMany({ where: { exerciseId, state: "SUBMITTED" }, include: { attachment: true } });

/// Tampers with a stored ciphertext as someone with the owner's login could: the immutability triggers are switched off for the one transaction and put back as they were.
async function tamperCipher(fileId: string, keepDigest: boolean) {
  const file = await db.onlineBidFile.findUniqueOrThrow({ where: { id: fileId } });
  const blob = await db.blobContent.findUniqueOrThrow({ where: { organisationId_sha256: { organisationId: org, sha256: file.cipherSha256 } } });
  const flipped = new Uint8Array(blob.bytes);
  flipped[0] ^= 0xff;
  const tables = ["BlobContent", "OnlineBidFile"];
  await db.$transaction(async (tx) => {
    const saved = await tx.$queryRawUnsafe<{ tbl: string; name: string; mode: string }[]>(
      `SELECT c.relname::text AS tbl, t.tgname::text AS name, t.tgenabled::text AS mode FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('BlobContent','OnlineBidFile')`,
    );
    for (const t of tables) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
    if (keepDigest) await tx.$executeRawUnsafe(`UPDATE "BlobContent" SET "bytes" = $3 WHERE "organisationId" = $1 AND "sha256" = $2`, org, file.cipherSha256, Buffer.from(flipped));
    else await tx.$executeRawUnsafe(`UPDATE "BlobContent" SET "bytes" = $3, "sha256" = $4 WHERE "organisationId" = $1 AND "sha256" = $2`, org, file.cipherSha256, Buffer.from(flipped), sha256Of(flipped));
    for (const t of saved) await tx.$executeRawUnsafe(`ALTER TABLE "${t.tbl}" ${t.mode === "A" ? "ENABLE ALWAYS" : t.mode === "R" ? "ENABLE REPLICA" : "ENABLE"} TRIGGER "${t.name}"`);
  });
}

describe("the online finalise, n = 2 (D10, ruling 20t)", () => {
  it("finalises with one officer's passphrase after both signatures: the prices are written only then, the snapshots carry them, the keys are released and shredded as the files are filed", async () => {
    const { ex, opening, offers } = await unsealed(2, 2);
    await prepare(ex, opening.id, offers);
    const [o1, o2] = ex.officers;

    // No price exists before the finalise.
    for (const o of await db.openedBid.findMany({ where: { openingId: opening.id } })) expect(o).toMatchObject({ priceAsRead: null, completionPeriod: null, completionUnit: null });
    // The paper finalise refuses an online opening in words and never throws.
    who.actor = o1.actor;
    const paper = await finaliseOpening({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, [PASSWORD_FIELD]: o1.password }));
    expect(paper.ok).toBe(false);
    expect(message(paper)).toMatch(/takes bids online/);
    expect(message(paper)).toMatch(/Finalising section of this exercise/);

    // Nobody has signed: refused by name, and nothing was written.
    const none = await finalise(ex, opening.id, o1);
    expect(none.ok).toBe(false);
    expect(message(none)).toMatch(/signature on the schedule is not recorded/);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
    expect((await db.openedBid.findMany({ where: { openingId: opening.id } })).every((o) => o.priceAsRead === null)).toBe(true);

    // One signature of two is not enough.
    const s1 = await sign(ex, opening.id, o1);
    expect(s1.ok, message(s1)).toBe(true);
    expect(message(s1)).toMatch(/1 named officer has still to sign/);
    const one = await finalise(ex, opening.id, o2);
    expect(one.ok).toBe(false);
    expect(message(one)).toMatch(/signature on the schedule is not recorded/);
    // A signature is the officer's own, once.
    expect((await sign(ex, opening.id, o1)).ok).toBe(false);
    const s2 = await sign(ex, opening.id, o2);
    expect(s2.ok, message(s2)).toBe(true);
    expect(await db.openingSignature.count({ where: { openingId: opening.id } })).toBe(2);

    // A wrong passphrase is refused, counted on the key, and nothing is written.
    const wrong = await finalise(ex, opening.id, o2, { passphrase: "not the passphrase at all" });
    expect(wrong.ok).toBe(false);
    expect(message(wrong)).toMatch(/passphrase/i);
    expect((await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: o2.person.id, retiredAt: null } })).failedAttempts).toBe(1);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();

    // Any one of the two finalises, with only their own passphrase.
    const done = await finalise(ex, opening.id, o2);
    expect(done.ok, message(done)).toBe(true);
    expect(message(done)).toMatch(/4 files are being filed/);
    const after = await db.opening.findUniqueOrThrow({ where: { id: opening.id } });
    expect(after.finalisedAt).not.toBeNull();
    const priced = await db.openedBid.findMany({ where: { openingId: opening.id } });
    for (const p of priced) expect(p).toMatchObject({ completionPeriod: 9, completionUnit: "MONTHS" });
    expect(priced.map((p) => p.priceAsRead?.toString())).toEqual(["123456.78", "123456.78"]);
    // The snapshots were built from the prices written in the same transaction: every online price is in the schedule and in the Grand Summary.
    expect(JSON.stringify(after.scheduleSnapshot).match(/123,?456\.78/g)?.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(after.grandSummarySnapshot).match(/123,?456\.78/g)?.length).toBeGreaterThanOrEqual(2);
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).status).toBe("OPENED");

    // Every data key was released, the mover filed each file, and every key reads NULL once all are moved.
    const files = await filesOf(ex.id);
    expect(files).toHaveLength(4);
    expect(files.every((f) => f.releasedDek === null && f.attachment !== null)).toBe(true);
    const docs = await db.documentAttachment.findMany({ where: { onlineBidFileId: { in: files.map((f) => f.id) } }, include: { version: { include: { document: true } } } });
    expect(docs).toHaveLength(4);
    for (const d of docs) {
      expect(d.purpose).toBe("ONLINE_BID_FILE");
      expect(d.version.sha256).toBe(sha256Of(new Uint8Array(PLAIN)));
      expect(d.version.document).toMatchObject({ status: "FILED", classificationSnapshot: "SULIT", documentClassId: bidFileClassId });
      expect(d.version.recordedBySupplierAccountId).not.toBeNull();
    }
    // The finalise is in the trail and the access log; the trail holds the price under the SULIT key and nowhere else in words.
    expect((await events(ex.id)).filter((e) => e.kind === "FINALISE" && e.outcome === "GRANTED")).toHaveLength(1);
    const trail = await db.auditEntry.findMany({ where: { organisationId: org, entityId: { in: [opening.id, ...priced.map((p) => p.id)] } } });
    expect(trail.some((a) => a.entityId === opening.id && JSON.stringify(a.changes).match(/filesReleasedToTheStore/))).toBe(true);
    expect(trail.filter((a) => priced.some((p) => p.id === a.entityId) && JSON.stringify(a.changes).match(/openingPrice/)).length).toBe(2);
    // Finalised twice is refused in words.
    const again = await finalise(ex, opening.id, o1);
    expect(again.ok).toBe(false);
    expect(message(again)).toMatch(/already finalised/);
  }, 300_000);

  it("a file that does not open whole blocks the finalise in words, before it commits: nothing is written, no key is released", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    const files = await filesOf(ex.id);
    await tamperCipher(files[0].id, false);
    const blocked = await finalise(ex, opening.id, ex.officers[0]);
    expect(blocked.ok).toBe(false);
    expect(message(blocked)).toMatch(/did not open whole/);
    expect(message(blocked)).toMatch(/Nothing was finalised/);
    expect(message(blocked)).not.toMatch(/ONLINE_|FILE_UNREADABLE/);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
    expect((await db.openedBid.findMany({ where: { openingId: opening.id } })).every((o) => o.priceAsRead === null)).toBe(true);
    expect((await filesOf(ex.id)).every((f) => f.releasedDek === null)).toBe(true);
    expect((await events(ex.id)).filter((e) => e.kind === "FINALISE" && e.outcome === "REFUSED" && e.reasonCode === "ONLINE_FILE_UNREADABLE")).toHaveLength(1);
  }, 300_000);

  it("a stored body that no longer matches its digest blocks the finalise too", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    await tamperCipher((await filesOf(ex.id))[1].id, true);
    const blocked = await finalise(ex, opening.id, ex.officers[1]);
    expect(blocked.ok).toBe(false);
    expect(message(blocked)).toMatch(/no longer matches the digest/);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
  }, 300_000);

  it("is refused for an administrator, someone not named on the exercise, and an opening not unsealed, and each is logged after the session check", async () => {
    const { ex, opening } = await unsealed(2, 1);
    const stranger = await signedIn();
    const strangerAsOfficer = { ...stranger, rosterId: "", passphrase: "does not matter" } as Officer;
    const named = await finalise(ex, opening.id, strangerAsOfficer);
    expect(named.ok).toBe(false);
    expect(message(named)).toMatch(/Only an opening officer named/);
    const admin = await signedIn(true);
    who.actor = admin.actor;
    const refusedAdmin = await finaliseOnline({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, passphrase: "x".repeat(14), [PASSWORD_FIELD]: admin.password }));
    expect(refusedAdmin.ok).toBe(false);
    expect(message(refusedAdmin)).toMatch(/administrator/i);
    const unsigned = await sign(ex, opening.id, strangerAsOfficer);
    expect(unsigned.ok).toBe(false);
    const reasons = (await events(ex.id)).filter((e) => e.kind === "FINALISE" && e.outcome === "REFUSED").map((e) => e.reasonCode);
    expect(reasons).toEqual(expect.arrayContaining(["NOT_NAMED_OFFICER", "ADMINISTRATOR"]));

    // Not unsealed: an opening that has only started.
    const exB = await exercise(2);
    const sB = await bidder(exB);
    await submit(sB, exB);
    await setClosing(exB.id, ago(40));
    expect((await start(exB)).ok).toBe(true);
    const openingB = await openingOf(exB);
    const early = await finalise(exB, openingB.id, exB.officers[0]);
    expect(early.ok).toBe(false);
    expect(message(early)).toMatch(/not unsealed yet|bids are not unsealed/i);
  }, 300_000);

  it("is refused in words, before any passphrase is tried, while the class a filed bid takes is not set", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    await setFileClass(null);
    try {
      const r = await finalise(ex, opening.id, ex.officers[0]);
      expect(r.ok).toBe(false);
      expect(message(r)).toMatch(/class that an online bid's files take/);
      expect((await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: ex.officers[0].person.id, retiredAt: null } })).failedAttempts).toBe(0);
      expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
    } finally {
      await setFileClass(bidFileClassId);
    }
  }, 300_000);
});

describe("the officer's screen of the online finalise and the files to check (20at)", () => {
  it("offers a named officer only the opening-check files, never another reader, and never after finalising; and says who has still to sign", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    const granted = sulitGranted(true as const, "ORGANISATION_PERMISSION");
    const rules = (await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).onlineBidRules as unknown as { v: 1; frozenAt: string; parts: BidPartRule[] };
    // Only the part the rules mark as checked at the opening: the priced bill stays sealed until the finalise.
    const list = await loadOpeningCheckFiles({ organisationId: org, exerciseId: ex.id, openingId: opening.id, rules });
    expect(list).toHaveLength(1);
    expect(list[0].files.map((f) => f.partLabel)).toEqual(["Form of Tender"]);

    const named = await openingSection(org, ex.id, granted, ex.officers[0].person.id);
    expect(named!.openings[0].checkFiles?.[0].files).toHaveLength(1);
    const stranger = await signedIn();
    const other = await openingSection(org, ex.id, granted, stranger.person.id);
    expect(other!.openings[0].checkFiles).toBeNull();
    expect((await openingSection(org, ex.id, granted, null))!.openings[0].checkFiles).toBeNull();

    // The finalise is not offered as the paper one: it names who is still to sign, and the paper refusal is no outstanding item.
    const view = named!.openings[0];
    expect(view.finalise.online).toMatchObject({ signed: 0, of: 2 });
    expect(view.finalise.outstanding.join(" ")).not.toMatch(/takes bids online/);
    expect(view.signFor.map((p) => p.personId).sort()).toEqual(ex.officers.map((o) => o.person.id).sort());

    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    const ready = (await openingSection(org, ex.id, granted, ex.officers[0].person.id))!.openings[0];
    expect(ready.finalise.online).toMatchObject({ signed: 2, of: 2 });
    expect(ready.finalise.outstanding).toEqual([]);
    expect(ready.finalise.allowed.allowed).toBe(true);
    expect((await finalise(ex, opening.id, ex.officers[1])).ok).toBe(true);
    expect((await openingSection(org, ex.id, granted, ex.officers[0].person.id))!.openings[0].checkFiles).toBeNull();
  }, 300_000);
});

describe("the mover (D10, M5)", () => {
  async function finalisedWithoutMover(bids: number) {
    const { ex, opening, offers } = await unsealed(2, bids);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    mover.skip = true;
    try {
      const done = await finalise(ex, opening.id, ex.officers[0]);
      expect(done.ok, message(done)).toBe(true);
    } finally {
      mover.skip = false;
    }
    return { ex, opening };
  }

  it("an interrupted mover resumes without duplicates, and every released key reads NULL once all are moved", async () => {
    const { ex } = await finalisedWithoutMover(1);
    const files = await filesOf(ex.id);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.releasedDek !== null && f.attachment === null)).toBe(true);
    // A crash after the link and the shred were written, before the commit: the whole transaction is gone.
    await expect(ensureFileMoved(org, files[0].id, { beforeCommit: () => { throw new Error("the mover was interrupted"); } })).rejects.toThrow(/interrupted/);
    const stillThere = await filesOf(ex.id);
    expect(stillThere.every((f) => f.releasedDek !== null && f.attachment === null)).toBe(true);
    expect(await db.documentAttachment.count({ where: { onlineBidFileId: { in: files.map((f) => f.id) } } })).toBe(0);
    // Resumed.
    const first = await moveReleasedFiles({ organisationId: org, exerciseId: ex.id });
    expect(first).toMatchObject({ moved: 2, failed: [], remaining: 0 });
    const again = await moveReleasedFiles({ organisationId: org, exerciseId: ex.id });
    expect(again).toMatchObject({ moved: 0, failed: [], remaining: 0 });
    const done = await filesOf(ex.id);
    expect(done.every((f) => f.releasedDek === null && f.attachment !== null)).toBe(true);
    expect(await db.documentAttachment.count({ where: { onlineBidFileId: { in: files.map((f) => f.id) } } })).toBe(2);
  }, 300_000);

  it("two movers do not double-store", async () => {
    const { ex } = await finalisedWithoutMover(2);
    const files = await filesOf(ex.id);
    expect(files).toHaveLength(4);
    const before = await db.document.count({ where: { organisationId: org } });
    const results = await Promise.all([moveReleasedFiles({ organisationId: org, exerciseId: ex.id }), moveReleasedFiles({ organisationId: org, exerciseId: ex.id }), ensureFileMoved(org, files[0].id)]);
    expect(results[0].failed).toEqual([]);
    expect(results[1].failed).toEqual([]);
    expect(await db.document.count({ where: { organisationId: org } })).toBe(before + 4);
    const attachments = await db.documentAttachment.findMany({ where: { onlineBidFileId: { in: files.map((f) => f.id) } } });
    expect(attachments).toHaveLength(4);
    expect(new Set(attachments.map((a) => a.onlineBidFileId)).size).toBe(4);
    expect((await filesOf(ex.id)).every((f) => f.releasedDek === null)).toBe(true);
  }, 300_000);

  it("a file with no released key has nothing to move, and one that is not an id of this organisation is not found", async () => {
    const { ex } = await unsealed(2, 1);
    const f = (await filesOf(ex.id))[0];
    expect(await ensureFileMoved(org, f.id)).toEqual({ status: "NOTHING_TO_MOVE" });
    expect(await ensureFileMoved(org, "no_such_file")).toMatchObject({ status: "FAILED", code: "FILE_NOT_FOUND" });
  }, 300_000);
});

describe("the officer's passphrase acts take a per-account rate (20bb)", () => {
  it("counts before anything is tried: past the limit the act is refused in words and only the first refusal in the window is written", async () => {
    const ex = await exercise(2);
    const limit = RATE_LIMITS["officer-passphrase-act"].limit;
    const stranger = await signedIn();
    who.actor = stranger.actor;
    const call = (n: number) => finaliseOnline({ ok: false }, form({ exerciseId: ex.id, openingId: `no_opening_${n}`, passphrase: "", [PASSWORD_FIELD]: stranger.password }));
    for (let i = 0; i < limit; i++) expect(message(await call(i))).not.toMatch(/too many times/);
    const over = await call(limit);
    expect(over.ok).toBe(false);
    expect(message(over)).toMatch(/tried too many times/);
    for (let i = 1; i < 4; i++) expect(message(await call(limit + i))).toMatch(/tried too many times/);
    expect((await events(ex.id)).filter((e) => e.staffPersonId === stranger.person.id && e.reasonCode === "RATE_LIMITED")).toHaveLength(1);
    // The authorisation, the passphrase check and the signature share the one per-account count: the same account is refused at each.
    const authorised = await authoriseOnlineUnseal({ ok: false }, form({ exerciseId: ex.id, openingId: "x", passphrase: "", [PASSWORD_FIELD]: stranger.password }));
    expect(message(authorised)).toMatch(/tried too many times/);
    const checked = await checkUnlock({ ok: false }, form({ exerciseId: ex.id, passphrase: "", [PASSWORD_FIELD]: stranger.password }));
    expect(message(checked)).toMatch(/tried too many times/);
    const signed = await signOnlineFinalise({ ok: false }, form({ exerciseId: ex.id, openingId: "x", [PASSWORD_FIELD]: stranger.password }));
    expect(message(signed)).toMatch(/tried too many times/);
    expect((await events(ex.id)).filter((e) => e.staffPersonId === stranger.person.id && e.reasonCode === "RATE_LIMITED")).toHaveLength(1);
  }, 300_000);
});

describe("the exercises that still need the pepper (20y), read from the database", () => {
  it("lists an exercise wrapped under the held pepper's full id until its main opening is finalised, never reads a missing pepper as none, and leaves a cancelled one out", async () => {
    const keyA = randomBytes(32).toString("base64");
    process.env.SEALING_PEPPER = keyA;
    process.env.SEALING_PEPPER_ID = "ptest-a";
    try {
      const { ex, opening, offers } = await unsealed(2, 1);
      const ids = async () => (await loadPepperList(org)).rows.map((r) => r.id);
      const list = await loadPepperList(org);
      expect(list.state).toBe("SOME");
      expect(list.rows.find((r) => r.id === ex.id)).toMatchObject({ reference: ex.reference, title: "Unseal test" });
      // The same name with another key has another check value: it is not the pepper these officers wrapped under.
      process.env.SEALING_PEPPER = randomBytes(32).toString("base64");
      expect(await ids()).not.toContain(ex.id);
      // No pepper held, and one that is not usable: the list says so and never reads as nothing needing it.
      delete process.env.SEALING_PEPPER;
      delete process.env.SEALING_PEPPER_ID;
      expect(await loadPepperList(org)).toMatchObject({ state: "NOT_HELD", rows: [] });
      process.env.SEALING_PEPPER = "not base64 at all!";
      process.env.SEALING_PEPPER_ID = "ptest-a";
      expect(await loadPepperList(org)).toMatchObject({ state: "INVALID", rows: [] });

      // Held again: finalised, and with no late bid in the roll, the exercise no longer needs it.
      process.env.SEALING_PEPPER = keyA;
      expect(await ids()).toContain(ex.id);
      await prepare(ex, opening.id, offers);
      for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
      expect((await finalise(ex, opening.id, ex.officers[0])).ok).toBe(true);
      expect(await ids()).not.toContain(ex.id);

      // A cancelled exercise needs it no more (the status is set as the owner: the cancellation's own path is not under test).
      const other = await unsealed(2, 1);
      expect(await ids()).toContain(other.ex.id);
      await db.sourcingExercise.update({ where: { id: other.ex.id }, data: { status: "CANCELLED" } });
      expect(await ids()).not.toContain(other.ex.id);
    } finally {
      for (const k of PEPPER_ENV) delete process.env[k];
    }
  }, 300_000);
});

const FIGURE_TEXT = "55000.00";
async function estimateFor(ex: Ex) {
  const preparer = ex.officers[0].person.id;
  const est = await db.companyEstimate.create({ data: { organisationId: org, exerciseId: ex.id, preparerPersonId: preparer, currentVersionNo: 1, state: "DRAFT" } });
  await db.companyEstimateVersion.create({ data: { organisationId: org, estimateId: est.id, versionNo: 1, value: FIGURE_TEXT, preparedOn: new Date("2026-09-01"), preparerPersonId: preparer } });
  return est.id;
}
const lodgeAs = (ex: Ex, o: Officer, estimateId: string, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return lodgeEstimate({ ok: false }, form({ exerciseId: ex.id, estimateId, capacity: "Head of department", [PASSWORD_FIELD]: o.password, ...over }));
};
const granted = sulitGranted(true as const, "ORGANISATION_PERMISSION");
const standing = (exerciseId: string) => db.sealedEstimateLodgement.findMany({ where: { exerciseId, supersededAt: null } });

describe("the sealed company estimate lodgement (step 16, ruling 20g)", () => {
  it("seals the figure under the live key through the real lodge act, is lodged once, and the figure reaches the opening only at the finalise", async () => {
    const lodged = { estimateId: "" };
    const { ex, opening, offers } = await unsealed(2, 1, async (e) => {
      lodged.estimateId = await estimateFor(e);
      const r = await lodgeAs(e, e.officers[0], lodged.estimateId);
      expect(r.ok, message(r)).toBe(true);
      // Lodged under this key already: lodging it again is refused as before.
      const dup = await lodgeAs(e, e.officers[0], lodged.estimateId);
      expect(dup.ok).toBe(false);
      expect(message(dup)).toMatch(/lodged/i);
      // No plain figure is stored in the lodgement, the trail or the access log.
      const [row] = await standing(e.id);
      expect(Buffer.concat([row.sealedEstimate, row.estimateDek]).includes(Buffer.from("55000"))).toBe(false);
      expect(row.keyId).toBe(e.keyId);
      const trail = await db.auditEntry.findMany({ where: { organisationId: org, entityId: row.id } });
      expect(trail).toHaveLength(1);
      expect(JSON.stringify(trail)).not.toMatch(/55000/);
      expect(JSON.stringify(await events(e.id))).not.toMatch(/55000/);
      expect((await events(e.id)).filter((x) => x.kind === "ESTIMATE_LODGED" && x.outcome === "GRANTED")).toHaveLength(1);
      // No paper-box envelope is made online.
      expect(await db.bidEnvelope.count({ where: { exerciseId: e.id, kind: "COMPANY_ESTIMATE" } })).toBe(0);
    });
    // Before the finalise no figure of the estimate is on the opening.
    const before = await db.opening.findUniqueOrThrow({ where: { id: opening.id } });
    expect(before.estimateLodgedAmount).toBeNull();
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    const done = await finalise(ex, opening.id, ex.officers[1]);
    expect(done.ok, message(done)).toBe(true);
    const after = await db.opening.findUniqueOrThrow({ where: { id: opening.id } });
    expect(after.estimateLodgedAmount?.toFixed(2)).toBe(FIGURE_TEXT);
  }, 300_000);

  it("after a re-key the lodging officer lodges the same version again with a reason, nobody else does, and the start reads it as not lodged until then", async () => {
    const ex = await exercise(2, { requiresEstimate: true });
    const estimateId = await estimateFor(ex);
    const [o1, o2] = ex.officers;
    expect((await lodgeAs(ex, o1, estimateId)).ok).toBe(true);
    const first = (await standing(ex.id))[0];

    who.actor = o1.actor;
    const rekey = await rekeyExercise({ ok: false }, form({ exerciseId: ex.id, reason: "A passphrase was shared", [PASSWORD_FIELD]: o1.password }));
    expect(rekey.ok, message(rekey)).toBe(true);
    const liveKey = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    expect(liveKey.id).not.toBe(first.keyId);

    // ESTIMATE_NOT_LODGED reads the online channel: the copy under the retired key no longer counts, though the estimate's state still says lodged.
    const notLodged = /none is lodged/;
    const gateAfterRekey = (await openingSection(org, ex.id, granted, null))!.start.allowed;
    expect(gateAfterRekey.allowed).toBe(false);
    expect(JSON.stringify(gateAfterRekey)).toMatch(notLodged);

    // Without a reason, and by another officer, it is refused and nothing changes.
    const noReason = await lodgeAs(ex, o1, estimateId);
    expect(noReason.ok).toBe(false);
    expect(message(noReason)).toMatch(/Say why/);
    const other = await lodgeAs(ex, o2, estimateId, { reason: "Because the key changed" });
    expect(other.ok).toBe(false);
    expect(message(other)).toMatch(/same officer/);
    expect((await standing(ex.id)).map((r) => r.id)).toEqual([first.id]);
    expect((await events(ex.id)).filter((e) => e.kind === "ESTIMATE_LODGED" && e.outcome === "REFUSED").length).toBe(2);

    const again = await lodgeAs(ex, o1, estimateId, { reason: "The key was changed" });
    expect(again.ok, message(again)).toBe(true);
    const now = await standing(ex.id);
    expect(now).toHaveLength(1);
    expect(now[0]).toMatchObject({ keyId: liveKey.id });
    const old = await db.sealedEstimateLodgement.findUniqueOrThrow({ where: { id: first.id } });
    expect(old.supersededReason).toBe("The key was changed");
    // The same version: no new version row, and the start no longer reads the estimate as not lodged.
    expect(await db.companyEstimateVersion.count({ where: { estimateId } })).toBe(1);
    expect(JSON.stringify((await openingSection(org, ex.id, granted, null))!.start.allowed)).not.toMatch(notLodged);
    const trail = await db.auditEntry.findMany({ where: { organisationId: org, entityId: now[0].id } });
    expect(trail.map((t) => t.reason)).toContain("The key was changed");
    expect(JSON.stringify(trail)).not.toMatch(/55000/);
  }, 300_000);

  it("is refused after the closing, and refused for an administrator, each in words", async () => {
    const ex = await exercise(2);
    const estimateId = await estimateFor(ex);
    await setClosing(ex.id, ago(5));
    const late = await lodgeAs(ex, ex.officers[0], estimateId);
    expect(late.ok).toBe(false);
    expect(message(late)).toMatch(/closing has passed/);
    expect(await standing(ex.id)).toHaveLength(0);
    expect((await events(ex.id)).some((e) => e.kind === "ESTIMATE_LODGED" && e.outcome === "REFUSED" && e.reasonCode === "LODGEMENT_CLOSED")).toBe(true);

    const admin = await signedIn(true);
    who.actor = admin.actor;
    const refused = await lodgeEstimate({ ok: false }, form({ exerciseId: ex.id, estimateId, [PASSWORD_FIELD]: admin.password }));
    expect(refused.ok).toBe(false);
    expect((await events(ex.id)).some((e) => e.kind === "ESTIMATE_LODGED" && e.reasonCode === "ADMINISTRATOR")).toBe(true);
    expect(await standing(ex.id)).toHaveLength(0);
  }, 300_000);
});
