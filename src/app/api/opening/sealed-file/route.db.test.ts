import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Wave 3b step 14 against the scratch database: the officer's download of a sealed file at the opening check (ADR 0036 D4, D10; rulings 20n, 20t, 20w), through the real route handler, the real
 * keys, grants and triggers. Only the request is stood in for: who is signed in, the cookies and the cache. Fixture as `unseal.db.test.ts` (an ONLINE exercise in DEMONSTRATION mode with real
 * shares), then the unseal, then the downloads.
 */

const who = vi.hoisted(() => ({ actor: null as unknown }));
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
    beginActFrom: (actor: import("@/lib/auth/types").StaffActor, form: import("@/lib/auth/act-input").ActForm, key: string, o: Parameters<typeof begin.beginActFromWith>[4]) => begin.beginActFromWith(deps, actor, form, key, o),
    actFormFromJson: begin.actFormFromJson,
    attributionRefusalState: begin.attributionRefusalState,
  };
});
vi.mock("@/app/_auth/route", () => ({
  refusalResponse: (code: string) => Response.json({ ok: false, code }, { status: 401 }),
  staffRoute: async () => (who.actor ? { ok: true as const, actor: who.actor } : { ok: false as const, response: Response.json({ ok: false, code: "NOT_SIGNED_IN" }, { status: 401 }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import type { NextRequest } from "next/server";

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
import { RATE_LIMITS } from "@/lib/portal/bids/limits";
import { ensureAdministrator, facts, makeAccount, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { setOfficerShare } from "../../../sourcing/[id]/scope/key-actions";
import { authoriseOnlineUnseal } from "../../../sourcing/[id]/opening/unseal-actions";
import { startOpening } from "../../../sourcing/[id]/opening/actions";
import { POST } from "./route";

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
async function exercise(n: number): Promise<Ex> {
  const reference = `UNS/EX/${randomId()}`;
  const requisitionId = (
    await db.requisition.create({
      data: { organisationId: org, reference: `UNS/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: namer, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") },
    })
  ).id;
  const committee = await db.committee.create({ data: { organisationId: org, code: `UNS_C_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "Test", panelSize: n, panelSizeProvenance: "ASSUMED", panelExclusionRule: false, panelExclusionProvenance: "ASSUMED" } });
  const methodCode = `UNS_M_${randomId()}`;
  await db.sourcingMethod.create({ data: { organisationId: org, code: methodCode, nameEn: "Online tender", openingCommitteeCode: committee.code, openingCommitteeProvenance: "ASSUMED", requiresCompanyEstimate: false, requiresCompanyEstimateProvenance: "ASSUMED" } });
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

const call = async (as: unknown, body: unknown, extra: { raw?: string } = {}) => {
  who.actor = as;
  const res = await POST(new Request("http://localhost/api/opening/sealed-file", { method: "POST", headers: { "content-type": "application/json" }, body: extra.raw ?? JSON.stringify(body) }) as unknown as NextRequest);
  const type = res.headers.get("content-type") ?? "";
  return { res, json: type.includes("json") ? ((await res.clone().json()) as { ok: boolean; code?: string; message?: string; fields?: Record<string, string> }) : null, bytes: type.includes("json") ? null : Buffer.from(await res.arrayBuffer()) };
};
const ask = (o: Officer, openingId: string, fileId: string, over: Record<string, unknown> = {}) => call(o.actor, { openingId, fileId, password: o.password, passphrase: o.passphrase, ...over });
const downloadsOf = (exerciseId: string) => db.sealedAccessEvent.findMany({ where: { exerciseId, kind: "DOWNLOAD" }, orderBy: { at: "asc" } });
const fileOf = async (onlineBidId: string, packPartId: string) => (await db.onlineBidPart.findFirstOrThrow({ where: { onlineBidId, file: { packPartId } }, select: { fileId: true } })).fileId;
const keyOf = (ex: Ex, o: Officer) => db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: o.person.id, retiredAt: null } });

/// An exercise with two named officers and two standing bidders, started and not yet unsealed. `first2` is a bid its supplier replaced.
async function started() {
  const ex = await exercise(2);
  const s1 = await bidder(ex);
  const s2 = await bidder(ex);
  const bid1 = await submit(s1, ex);
  const first2 = await submit(s2, ex);
  await submit(s2, ex, { replaces: first2 });
  await setClosing(ex.id, ago(40));
  who.actor = ex.officers[0].actor;
  const r = await startOpening({ ok: false }, form({ exerciseId: ex.id }));
  expect(r.ok, JSON.stringify(r)).toBe(true);
  const opening = await db.opening.findFirstOrThrow({ where: { exerciseId: ex.id, kind: "MAIN" } });
  return { ex, opening, bid1, first2 };
}
async function authoriseAll(ex: Ex, openingId: string) {
  for (const o of ex.officers) {
    who.actor = o.actor;
    const r = await authoriseOnlineUnseal({ ok: false }, form({ exerciseId: ex.id, openingId, passphrase: o.passphrase, [PASSWORD_FIELD]: o.password }));
    expect(r.ok, JSON.stringify(r)).toBe(true);
  }
}

describe("the officer's download of a sealed file (step 14)", () => {
  it("serves an opening-check file to a named officer, with the headers of the other downloads, and logs it; refuses everything else, each refusal logged", async () => {
    const { ex, opening, bid1, first2 } = await started();
    const [o1, o2] = ex.officers;
    const checkFile = await fileOf(bid1, ex.partA);
    const finaliseFile = await fileOf(bid1, ex.partB);
    const replacedFile = await fileOf(first2, ex.partA);

    // Before the unseal: refused, in words, and logged.
    const early = await ask(o1, opening.id, checkFile);
    expect([early.res.status, early.json?.code]).toEqual([403, "NOT_UNSEALED"]);

    await authoriseAll(ex, opening.id);

    // The happy path: both officers, each with their own grant.
    for (const o of [o1, o2]) {
      const ok = await ask(o, opening.id, checkFile);
      expect(ok.res.status).toBe(200);
      expect(ok.bytes!.equals(PLAIN)).toBe(true);
      expect(ok.res.headers.get("content-disposition")).toMatch(/^attachment; filename="tender\.pdf"/);
      expect(ok.res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(ok.res.headers.get("cache-control")).toBe("private, no-store");
      expect(ok.res.headers.get("content-security-policy")).toMatch(/default-src 'none'/);
      expect(ok.res.headers.get("content-type")).toBe("application/pdf");
    }
    const granted = (await downloadsOf(ex.id)).filter((e) => e.outcome === "GRANTED");
    expect(granted).toHaveLength(2);
    expect(granted.map((e) => e.staffPersonId).sort()).toEqual([o1.person.id, o2.person.id].sort());
    expect(granted.every((e) => e.recordId === checkFile)).toBe(true);

    // A FINALISE grant is never served here.
    const fin = await ask(o1, opening.id, finaliseFile);
    expect([fin.res.status, fin.json?.code]).toEqual([403, "NOT_OPENING_CHECK_PART"]);
    // A replaced bid was never opened.
    const rep = await ask(o1, opening.id, replacedFile);
    expect([rep.res.status, rep.json?.code]).toEqual([403, "NOT_OPENED"]);
    // A file that is not there, and an opening that is not there.
    expect((await ask(o1, opening.id, "no_such_file")).res.status).toBe(404);
    expect((await ask(o1, "no_such_opening", checkFile)).res.status).toBe(404);

    // Not a named officer, and an administrator.
    const stranger = await signedIn();
    const notNamed = await call(stranger.actor, { openingId: opening.id, fileId: checkFile, password: stranger.password, passphrase: "whatever passphrase" });
    expect([notNamed.res.status, notNamed.json?.code]).toEqual([403, "NOT_NAMED_OFFICER"]);
    const admin = await signedIn(true);
    const adm = await call(admin.actor, { openingId: opening.id, fileId: checkFile, password: admin.password, passphrase: "whatever passphrase" });
    expect([adm.res.status, adm.json?.code]).toEqual([403, "ADMINISTRATOR"]);

    // Every refusal wrote exactly one DOWNLOAD row, naming the actor; none holds a password or a passphrase.
    const log = (await downloadsOf(ex.id)).filter((e) => e.outcome === "REFUSED");
    expect(log.map((e) => e.reasonCode)).toEqual(["NOT_UNSEALED", "NOT_OPENING_CHECK_PART", "NOT_OPENED", "NOT_FOUND", "NOT_NAMED_OFFICER", "ADMINISTRATOR"]);
    expect(log.slice(-2).map((e) => e.staffPersonId)).toEqual([stranger.person.id, admin.person.id]);
    const text = JSON.stringify(log);
    for (const secret of [o1.passphrase, o1.password, stranger.password, admin.password]) expect(text).not.toContain(secret);
  }, 240_000);

  it("a wrong password and a wrong passphrase each count, on their own counters; five wrong passphrases lock the key and a locked key is not tried", async () => {
    const { ex, opening, bid1 } = await started();
    await authoriseAll(ex, opening.id);
    const [o1, o2] = ex.officers;
    const file = await fileOf(bid1, ex.partA);

    const keyBefore = await keyOf(ex, o1);
    const wrongPassword = await ask(o1, opening.id, file, { password: "not my sign-in password" });
    expect([wrongPassword.res.status, wrongPassword.json?.code]).toEqual([403, "STEP_UP_REFUSED"]);
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: o1.account.id } })).failedAttempts).toBe(1);
    expect((await keyOf(ex, o1)).failedAttempts).toBe(keyBefore.failedAttempts);

    for (let i = 1; i <= 4; i++) {
      const bad = await ask(o1, opening.id, file, { passphrase: `a wrong passphrase number ${i}` });
      expect([bad.res.status, bad.json?.code]).toEqual([403, "WRONG_PASSPHRASE"]);
      expect((await keyOf(ex, o1)).failedAttempts).toBe(keyBefore.failedAttempts + i);
    }
    const fifth = await ask(o1, opening.id, file, { passphrase: "a wrong passphrase number 5" });
    expect(fifth.json?.message).toMatch(/now locked/);
    const locked = await ask(o1, opening.id, file);
    expect([locked.res.status, locked.json?.code]).toEqual([423, "LOCKED"]);
    expect((await keyOf(ex, o1)).failedAttempts).toBe(keyBefore.failedAttempts + 5);
    // The other officer is unaffected.
    expect((await ask(o2, opening.id, file)).res.status).toBe(200);

    const log = (await downloadsOf(ex.id)).filter((e) => e.staffPersonId === o1.person.id);
    expect(log.map((e) => e.reasonCode)).toEqual(["STEP_UP_REFUSED", "WRONG_PASSPHRASE", "WRONG_PASSPHRASE", "WRONG_PASSPHRASE", "WRONG_PASSPHRASE", "WRONG_PASSPHRASE", "LOCKED"]);
    expect(log.every((e) => e.outcome === "REFUSED")).toBe(true);
    expect(JSON.stringify(log)).not.toContain(o1.passphrase);
  }, 300_000);

  it("is refused once the opening is finalised: the files are documents then", async () => {
    const { ex, opening, bid1 } = await started();
    await authoriseAll(ex, opening.id);
    const file = await fileOf(bid1, ex.partA);
    expect((await ask(ex.officers[0], opening.id, file)).res.status).toBe(200);
    // The finalise itself is step 15. Here only its mark is set, as the database allows it, to judge the route's reading of it.
    await db.$executeRawUnsafe(`UPDATE "OpenedBid" SET "priceAsRead" = 1 WHERE "openingId" = $1`, opening.id);
    await db.$executeRawUnsafe(`UPDATE "Opening" SET "finalisedAt" = now() WHERE "id" = $1`, opening.id);
    const after = await ask(ex.officers[0], opening.id, file);
    expect([after.res.status, after.json?.code]).toEqual([403, "FINALISED_USE_DOCUMENTS"]);
  }, 240_000);

  it("refuses a malformed request in words with the fields at fault, and writes nothing; a signed-out request writes nothing", async () => {
    const { ex, opening, bid1 } = await started();
    const o1 = ex.officers[0];
    const file = await fileOf(bid1, ex.partA);
    const rows = async () => (await downloadsOf(ex.id)).length;
    const n0 = await rows();
    const unknown = await ask(o1, opening.id, file, { extra: "x", passphrase: 5 });
    expect(unknown.res.status).toBe(400);
    expect(Object.keys(unknown.json!.fields!).sort()).toEqual(["extra", "passphrase"]);
    expect((await call(o1.actor, null, { raw: "{not json" })).res.status).toBe(400);
    expect((await call(o1.actor, null, { raw: JSON.stringify({ openingId: opening.id, fileId: "x".repeat(70_000) }) })).res.status).toBe(413);
    expect((await call(null, { openingId: opening.id, fileId: file, password: "x", passphrase: "y" })).res.status).toBe(401);
    expect(await rows()).toBe(n0);
  }, 240_000);

  it("limits an account's requests a minute, and writes only the first refusal in the window (20w)", async () => {
    const { ex, opening, bid1 } = await started();
    const file = await fileOf(bid1, ex.partA);
    const admin = await signedIn(true);
    const limit = RATE_LIMITS["officer-sealed-download"].limit;
    const seen: number[] = [];
    for (let i = 0; i < limit + 3; i++) seen.push((await call(admin.actor, { openingId: opening.id, fileId: file, password: "x", passphrase: "y" })).res.status);
    expect(seen.slice(0, limit).every((s) => s === 403)).toBe(true);
    expect(seen.slice(limit)).toEqual([429, 429, 429]);
    const mine = (await downloadsOf(ex.id)).filter((e) => e.staffPersonId === admin.person.id);
    expect(mine.filter((e) => e.reasonCode === "ADMINISTRATOR")).toHaveLength(limit);
    expect(mine.filter((e) => e.reasonCode === "RATE_LIMITED")).toHaveLength(1);
  }, 240_000);
});
