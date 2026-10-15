import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The submit and the withdraw against a real database (SR-13, ADR 0036 D5, D7, D8; rulings 17c, 20b, 20h, 20aa; build plan step 10): the stamp at the closing second, the late
 * bid, the alternative, the parent, the replace and its re-pointing, the withdrawal and the links it clears, the receipt digest, what the audit row holds, concurrent submits by
 * one supplier, a rival that commits first, a stale stamp from a real lock wait, READ COMMITTED, the lockout counter, the 20w rate rule through the route, and the void register.
 * The suppliers are real: they sign in, and the password is asked again before every act as the route asks it.
 */

// The routes read the cookie by the supplier session store; this test stands in for it with the real actor of a real session.
const session = vi.hoisted(() => ({ actor: null as unknown }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/supplier-session-store")>()),
  readSupplierSession: vi.fn(async () => (session.actor ? { ok: true, actor: session.actor, session: {} } : { ok: false })),
}));

import { FORM_SECRET_MIN_LENGTH, signFormToken, FORM_TOKEN_FIELD } from "@/lib/auth/form-token";
import type { SupplierActor } from "@/lib/auth/types";
import { authenticateSupplier, confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { db } from "@/lib/db";
import { SEALED_BIDS_DEMONSTRATION_ENV } from "@/lib/integration/sealing-deployment";
import { lockExerciseSide } from "@/lib/portal/bids/lock";
import { MAX_STAMP_SKEW_SECONDS, RATE_LIMITS } from "@/lib/portal/bids/limits";
import { fingerprint, generateX25519 } from "@/lib/sealing/x25519";
import { ensureAdministrator, facts, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";
import { voidSaleFault, voidRefusalNote } from "@/lib/window/sale";
import { windowFindingText } from "@/lib/window/labels";

import { KEY_CHANGE_ORDER, loadKeyHistory } from "@/lib/sealing/key-history";
import { rekeyKey } from "@/lib/sealing/store";

import { loadBidScreen } from "./my-bids-store";
import { receiptDigest, submissionNumbers } from "./receipt";
import { submitBid, takeStamp, withdrawBid, type SubmitInput } from "./submit-store";
import type { BidPartRule, OnlineBidKind } from "./types";
import { loadUploadFacts, storePart } from "./upload-store";

import { POST as submitRoute } from "@/app/supplier/bids/submit/route";

const DAY = 24 * 60 * 60 * 1000;
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const hex = (n: number) => randomBytes(n).toString("hex");
const newId = (p: string) => `${p}_${randomId()}${randomId()}`;
const PLAIN = Buffer.from("%PDF-1.7\nTHE-PLAIN-MARKER-FOR-THE-SUBMIT-TEST\n");
const FILENAME = "secret-tender-name.pdf";
const PRICE = "987654.32";
const DECLARATION = { price: PRICE, completionPeriod: 9, completionUnit: "MONTHS" as const };
const ENV_BEFORE = process.env[SEALED_BIDS_DEMONSTRATION_ENV];
const FORM_KEY = "s".repeat(FORM_SECRET_MIN_LENGTH);

let org = "";
let issuer = "";
let committeeId = "";
const pair = generateX25519();

interface Ex { id: string; reference: string; keyId: string; windowId: string; partId: string; fingerprint: string }
interface Identity { supplierId: string; loginName: string; password: string }
interface Session { actor: SupplierActor; identity: Identity }

const rules = (partId: string): { v: 1; frozenAt: string; parts: BidPartRule[] } => ({
  v: 1, frozenAt: new Date().toISOString(), parts: [{ packPartId: partId, label: "Form of Tender", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000000", openingCheck: true }],
});

/// An ONLINE exercise in DEMONSTRATION mode, published, with its roster of two, their keys, the exercise key, and one returned part. Its closing is a day away.
async function exercise(o: { alternativesPermitted?: boolean | null } = {}): Promise<Ex> {
  const reference = `SUB/EX/${randomId()}`;
  const requisitionId = (
    await db.requisition.create({
      data: { organisationId: org, reference: `SUB/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: issuer, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") },
    })
  ).id;
  const ex = await db.sourcingExercise.create({
    data: { organisationId: org, reference, requisitionId, title: "Submit test", estimatedValue: "1000.00", sourcingMethodCode: "SUB_METHOD", status: "DOCUMENTS_IN_PREPARATION", closingAt: new Date(Date.now() + DAY), submissionChannel: "ONLINE", onlineSubmissionMode: "DEMONSTRATION" },
  });
  const windowId = (
    await db.exerciseWindow.create({
      data: {
        organisationId: org, exerciseId: ex.id, path: "ADVERTISED", publishedAt: new Date(Date.now() - 2 * DAY), advertisementDay: D(new Date(Date.now() - 2 * DAY)), policySnapshot: { attendance: { mandatoryPermitted: true } },
        purchaseFromDay: D(new Date(Date.now() - DAY)), purchaseCloseDay: D(new Date(Date.now() + 10 * DAY)), feeAmount: "50.00", alternativesPermitted: o.alternativesPermitted === undefined ? true : o.alternativesPermitted,
      },
    })
  ).id;
  const pack = await db.tenderPack.create({ data: { organisationId: org, exerciseId: ex.id, versionNo: 1, packKind: "TENDER", contractBasisCode: "X", compositionSnapshot: {} } });
  const partId = (await db.tenderPackPart.create({ data: { organisationId: org, packId: pack.id, partCode: "FORM", printedNumber: "1", sortOrder: 1, labelSnapshot: "Form of Tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE" } })).id;
  const people = [(await db.person.create({ data: { organisationId: org, name: `Officer A ${randomId()}` } })).id, (await db.person.create({ data: { organisationId: org, name: `Officer B ${randomId()}` } })).id];
  const roster: string[] = [];
  for (const personId of people) roster.push((await db.exerciseOpeningOfficer.create({ data: { organisationId: org, exerciseId: ex.id, personId, seatLabelSnapshot: "Member", namedAt: new Date(), namedByPersonId: issuer } })).id);
  const keyId = newId("key");
  await db.$transaction(async (tx) => {
    const officerKeys: string[] = [];
    for (let i = 0; i < people.length; i++) {
      const id = newId("ok");
      officerKeys.push(id);
      await tx.$executeRawUnsafe(
        `INSERT INTO "OfficerExerciseKey" ("id","organisationId","exerciseId","openingOfficerId","personId","publicKey","wrappedPrivateKey","kdfLog2N","kdfR","kdfP","kdfSalt","createdAt") VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),decode($7,'hex'),17,8,1,decode($8,'hex'),"sealed_clock"())`,
        id, org, ex.id, roster[i], people[i], hex(32), hex(60), hex(16),
      );
    }
    await tx.$executeRawUnsafe(
      `INSERT INTO "ExerciseSealingKey" ("id","organisationId","exerciseId","publicKey","fingerprint","officerCount","createdAt") VALUES ($1,$2,$3,decode($4,'hex'),$5,2,"sealed_clock"())`,
      keyId, org, ex.id, Buffer.from(pair.publicKey).toString("hex"), fingerprint(pair.publicKey),
    );
    for (let i = 0; i < people.length; i++) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "ExerciseKeyShare" ("id","organisationId","keyId","openingOfficerId","officerKeyId","sealedShare","createdAt") VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),"sealed_clock"())`,
        newId("sh"), org, keyId, roster[i], officerKeys[i], hex(80),
      );
    }
  });
  await db.sourcingExercise.update({ where: { id: ex.id }, data: { onlineBidRules: rules(partId) as never, publishedKeyFingerprint: fingerprint(pair.publicKey) } });
  await db.sourcingExercise.update({ where: { id: ex.id }, data: { status: "ADVERTISED" } });
  return { id: ex.id, reference, keyId, windowId, partId, fingerprint: fingerprint(pair.publicKey) };
}

/// A supplier with an account and a signed-in session. `enrol` gives it a party and a standing sale on an exercise.
async function identity(): Promise<Identity> {
  const s = await makeSupplierAccount(org);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(new Date(Date.now() - 100 * DAY)) } });
  return { supplierId: s.supplier.id, loginName: s.loginName, password: s.password };
}
async function signIn(who: Identity): Promise<Session> {
  const out = await authenticateSupplier({ loginName: who.loginName, password: who.password }, facts(), null);
  if (!out.ok) throw new Error(`sign-in failed: ${JSON.stringify(out)}`);
  const real = await vi.importActual<typeof import("@/lib/auth/supplier-session-store")>("@/lib/auth/supplier-session-store");
  const read = await real.readSupplierSession(out.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session read failed");
  return { actor: read.actor, identity: who };
}
async function enrol(ex: Ex, who: Identity): Promise<void> {
  const party = await db.exerciseParty.create({ data: { organisationId: org, exerciseId: ex.id, source: "PURCHASER", name: `Party ${randomId()}`, registrationNo: `RN-${randomId()}`, vendorId: who.supplierId } });
  await db.documentSale.create({ data: { organisationId: org, windowId: ex.windowId, partyId: party.id, soldOn: D(new Date()), collectedBy: "A collector", authoritySighted: true, amount: "50.00", paymentMethod: "Cash", issuedByPersonId: issuer, annotation: { v: 1, purchaser: party.name } } });
}
async function bidder(ex: Ex): Promise<Session> {
  const who = await identity();
  await enrol(ex, who);
  return signIn(who);
}

async function upload(s: Session, ex: Ex): Promise<string> {
  const f = await loadUploadFacts(db, s.actor, { exerciseId: ex.id, packPartId: ex.partId });
  if (!f) throw new Error("the supplier cannot see the exercise");
  return (await storePart(s.actor, { facts: f, packPartId: ex.partId, plain: new Uint8Array(PLAIN), filename: FILENAME, mediaType: "application/pdf", scan: "NOT_SCANNED", scannerConfigured: false })).fileId;
}

/// The act as the route makes it: the stamp, then the password asked again, then the store.
async function submit(s: Session, ex: Ex, o: Partial<Omit<SubmitInput, "exerciseId" | "stamp" | "stepUpAt">> & { stamp?: Date; files?: string[]; hooks?: Parameters<typeof submitBid>[2] } = {}) {
  const fileIds = o.files ?? o.fileIds ?? [await upload(s, ex)];
  const stamp = o.stamp ?? (await takeStamp());
  const asked = await confirmSupplierPassword(s.actor, s.identity.password, facts());
  if (!asked.ok) throw new Error("password refused");
  return submitBid(s.actor, { exerciseId: ex.id, kind: o.kind ?? "BID", parentOnlineBidId: o.parentOnlineBidId ?? null, replacesOnlineBidId: o.replacesOnlineBidId ?? null, fileIds, declaration: o.declaration ?? DECLARATION, stamp, stepUpAt: asked.at }, o.hooks);
}
const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(`expected the act to be taken: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};
const faultsOf = (r: { ok: boolean }) => ((r as { faults?: string[] }).faults ?? []) as string[];

async function withdraw(s: Session, onlineBidId: string, alsoWithdraw: string[] = [], stamp?: Date, hooks?: Parameters<typeof withdrawBid>[2]) {
  const at = stamp ?? (await takeStamp());
  const asked = await confirmSupplierPassword(s.actor, s.identity.password, facts());
  if (!asked.ok) throw new Error("password refused");
  return withdrawBid(s.actor, { onlineBidId, alsoWithdraw, stamp: at, stepUpAt: asked.at }, hooks);
}

const one = async <T>(sql: string, ...values: unknown[]) => (await db.$queryRawUnsafe<T[]>(sql, ...values))[0];
const setClosing = (ex: Ex, closing: Date) => db.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "closingAt" = $2 WHERE "id" = $1`, ex.id, closing);
const events = (exerciseId: string) => db.sealedAccessEvent.findMany({ where: { exerciseId }, orderBy: { at: "asc" } });
const bidRow = (id: string) => db.onlineBid.findUniqueOrThrow({ where: { id }, include: { envelope: true } });

beforeAll(async () => {
  process.env[SEALED_BIDS_DEMONSTRATION_ENV] = "true";
  process.env.PORTAL_SURFACE = "public";
  process.env.PORTAL_FORM_SECRET = FORM_KEY;
  org = (await testOrganisation()).id;
  await setPolicy(org, SUPPLIER_SETTINGS);
  await ensureAdministrator(org);
  issuer = (await db.person.create({ data: { organisationId: org, name: `Namer ${randomId()}` } })).id;
  committeeId = (await db.committee.create({ data: { organisationId: org, code: `SUB_OC_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "Test" } })).id;
});

afterAll(async () => {
  if (ENV_BEFORE === undefined) delete process.env[SEALED_BIDS_DEMONSTRATION_ENV];
  else process.env[SEALED_BIDS_DEMONSTRATION_ENV] = ENV_BEFORE;
  await db.$disconnect();
});

describe("the stamp", () => {
  it("is the database clock to the second, on the basis the triggers read", async () => {
    const before = Date.now();
    const stamp = await takeStamp();
    const after = Date.now();
    expect(stamp.getTime() % 1000).toBe(0);
    expect(stamp.getTime()).toBeGreaterThanOrEqual(before - 3000);
    expect(stamp.getTime()).toBeLessThanOrEqual(after + 3000);
    const db2 = await one<{ same: boolean }>(`SELECT abs(extract(epoch FROM (date_trunc('second', "sealed_clock"()) - $1::timestamp))) < 3 AS same`, stamp);
    expect(db2.same).toBe(true);
  });
});

describe("a submission", () => {
  it("is taken, sealed, recorded in one transaction, and its receipt digest recomputes", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const file = await upload(s, ex);
    const stamp = await takeStamp();
    const out = must(await submit(s, ex, { files: [file], stamp }));
    expect(out.receipt).toMatchObject({ exerciseId: ex.id, submissionNumber: 1, late: false, keyFingerprint: ex.fingerprint, demonstration: true, alternativeNotConsidered: false });
    expect(out.receipt.receivedAt).toBe(stamp.toISOString());

    const bid = await bidRow(out.onlineBidId);
    expect(bid.status).toBe("SUBMITTED");
    expect(bid.envelope).toMatchObject({ channel: "ONLINE", receivedSource: "PORTAL", status: "RECEIVED", sequence: 1, late: false, partyId: null, receivedByPersonId: null });
    expect(bid.envelope.receivedAt).toEqual(stamp);
    const parts = await db.onlineBidPart.findMany({ where: { onlineBidId: bid.id } });
    expect(parts.map((p) => p.fileId)).toEqual([file]);
    const fileRow = await db.onlineBidFile.findUniqueOrThrow({ where: { id: file } });
    expect(fileRow.state).toBe("SUBMITTED");

    // The receipt digest is the SHA-256 over what the portal stored: it recomputes from the rows.
    expect(
      receiptDigest({ exerciseId: ex.id, submissionNumber: 1, receivedAt: stamp, keyFingerprint: ex.fingerprint, manifestCipherSha256: bid.manifestCipherSha256, declarationCipherSha256: bid.declarationCipherSha256, fileCipherSha256s: [fileRow.cipherSha256] }),
    ).toBe(bid.receiptDigest);
    expect(out.receipt.receiptDigest).toBe(bid.receiptDigest);

    // Signed by the account, in the same transaction.
    const attribution = await db.actAttribution.findFirst({ where: { entity: "OnlineBid", entityId: bid.id, slot: "submittedBy" } });
    expect(attribution).not.toBeNull();
    // One access event, granted.
    expect((await events(ex.id)).filter((e) => e.kind === "SUBMIT")).toMatchObject([{ outcome: "GRANTED", recordId: bid.id, supplierAccountId: s.actor.accountId }]);
  });

  it("a receipt carries nothing derived from a rival's submissions: the second supplier's number is its own, not the exercise-wide sequence (security audit, 20u)", async () => {
    const ex = await exercise();
    const first = await bidder(ex);
    const second = await bidder(ex);
    const one = must(await submit(first, ex));
    const again = must(await submit(first, ex, { replacesOnlineBidId: one.onlineBidId }));
    expect([one.receipt.submissionNumber, again.receipt.submissionNumber]).toEqual([1, 2]);
    const mine = must(await submit(second, ex));
    // The exercise-wide sequence has moved on, and the receipt shows none of it.
    expect((await bidRow(mine.onlineBidId)).envelope.sequence).toBeGreaterThan(1);
    expect(mine.receipt.submissionNumber).toBe(1);
    expect(Object.keys(mine.receipt)).not.toContain("sequence");
    const bid = await bidRow(mine.onlineBidId);
    // The number is derived again from the supplier's own rows alone (nothing is stored for it), so a receipt digest recomputes from the rows.
    const ownRows = await db.onlineBid.findMany({ where: { exerciseId: ex.id, supplierId: second.actor.supplierId }, select: { id: true, envelope: { select: { sequence: true } } } });
    expect(submissionNumbers(ownRows.map((r) => ({ id: r.id, sequence: r.envelope.sequence }))).get(mine.onlineBidId)).toBe(mine.receipt.submissionNumber);
    const fileRow = await db.onlineBidFile.findFirstOrThrow({ where: { supplierId: second.actor.supplierId, exerciseId: ex.id } });
    expect(receiptDigest({ exerciseId: ex.id, submissionNumber: 1, receivedAt: new Date(mine.receipt.receivedAt), keyFingerprint: ex.fingerprint, manifestCipherSha256: bid.manifestCipherSha256, declarationCipherSha256: bid.declarationCipherSha256, fileCipherSha256s: [fileRow.cipherSha256] })).toBe(mine.receipt.receiptDigest);
  });

  it("writes an audit row that holds no declaration, filename or plain hash", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const file = await upload(s, ex);
    const fileRow = await db.onlineBidFile.findUniqueOrThrow({ where: { id: file } });
    const out = must(await submit(s, ex, { files: [file] }));
    const rows = await db.auditEntry.findMany({ where: { entity: "OnlineBid", entityId: out.onlineBidId } });
    expect(rows).toHaveLength(1);
    const json = JSON.stringify(rows);
    for (const secret of [PRICE, "MONTHS", FILENAME, "secret-tender-name", "THE-PLAIN-MARKER", "application/pdf"]) expect(json, secret).not.toContain(secret);
    const plainSha = createHash("sha256").update(PLAIN).digest("hex");
    expect(json).not.toContain(plainSha);
    // It names ids, the stamp in words and the digests.
    expect(json).toContain(out.receipt.receiptDigest);
    expect(json).not.toContain(Buffer.from(fileRow.sealedDek).toString("hex"));
  });

  it("stands at the closing second in time, and one second after it is late", async () => {
    const ex = await exercise();
    const a = await bidder(ex);
    const b = await bidder(ex);
    const closing = new Date((await takeStamp()).getTime() - 5000);
    await setClosing(ex, closing);
    const atClosing = must(await submit(a, ex, { stamp: closing }));
    expect(atClosing.receipt.late).toBe(false);
    const after = must(await submit(b, ex, { stamp: new Date(closing.getTime() + 1000) }));
    expect(after.receipt.late).toBe(true);
    expect((await bidRow(after.onlineBidId)).envelope).toMatchObject({ late: true, recordedAfterClosing: true });
    expect((await bidRow(atClosing.onlineBidId)).envelope.closingAtJudged).toEqual(closing);
  });

  it("refuses a late bid once the main opening has started (LATE_CLOSED), and records the refusal once", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const file = await upload(s, ex);
    await setClosing(ex, new Date((await takeStamp()).getTime() - 5000));
    await db.$executeRawUnsafe(
      `INSERT INTO "Opening" ("id","organisationId","exerciseId","kind","sequenceNo","committeeId","committeeNameSnapshot","startedAt","startedByPersonId","checklistSnapshot","policySnapshot") VALUES ($1,$2,$3,'MAIN',1,$4,'Opening committee',"sealed_clock"(),$5,'{}'::jsonb,'{}'::jsonb)`,
      newId("op"), org, ex.id, committeeId, issuer,
    );
    const out = await submit(s, ex, { files: [file] });
    expect(out).toMatchObject({ ok: false, reason: "REFUSED" });
    expect(faultsOf(out)).toContain("LATE_CLOSED");
    expect(await db.onlineBid.count({ where: { exerciseId: ex.id } })).toBe(0);
    expect((await events(ex.id)).filter((e) => e.kind === "SUBMIT")).toMatchObject([{ outcome: "REFUSED", reasonCode: "LATE_CLOSED" }]);
  });

  it("records an alternative where alternatives are not permitted, with the warning and the flag on the receipt", async () => {
    const ex = await exercise({ alternativesPermitted: false });
    const s = await bidder(ex);
    const out = must(await submit(s, ex, { kind: "ALTERNATIVE" }));
    expect(out.receipt.alternativeNotConsidered).toBe(true);
    expect(out.warnings.map((w) => w.code)).toContain("ALTERNATIVE_NOT_CONSIDERED");
    expect((await bidRow(out.onlineBidId)).kind).toBe("ALTERNATIVE");
  });

  it("refuses an alternative where it is not stated whether they are permitted", async () => {
    const ex = await exercise({ alternativesPermitted: null });
    const s = await bidder(ex);
    expect(faultsOf(await submit(s, ex, { kind: "ALTERNATIVE" }))).toContain("ALTERNATIVES_NOT_STATED");
  });

  it("refuses a named parent that is not the supplier's own live bid: another supplier's, a replaced one, an alternative, one that is not there", async () => {
    const ex = await exercise();
    const a = await bidder(ex);
    const b = await bidder(ex);
    const theirs = must(await submit(b, ex));
    const mine = must(await submit(a, ex));
    const replacement = must(await submit(a, ex, { replacesOnlineBidId: mine.onlineBidId }));
    const alt = must(await submit(a, ex, { kind: "ALTERNATIVE", parentOnlineBidId: replacement.onlineBidId }));
    for (const parent of [theirs.onlineBidId, mine.onlineBidId, "nothing_here_01"]) {
      expect(faultsOf(await submit(a, ex, { kind: "ALTERNATIVE", parentOnlineBidId: parent })), parent).toEqual(["PARENT_NOT_YOUR_LIVE_BID"]);
    }
    expect(faultsOf(await submit(a, ex, { kind: "ALTERNATIVE", parentOnlineBidId: alt.onlineBidId }))).toEqual(["PARENT_NOT_A_BID"]);
    expect(await db.onlineBid.count({ where: { exerciseId: ex.id, supplierId: a.identity.supplierId } })).toBe(3);
  });

  it("refuses a file that is another supplier's, one already taken, one not there, and an exercise the supplier cannot see", async () => {
    const ex = await exercise();
    const a = await bidder(ex);
    const b = await bidder(ex);
    const theirFile = await upload(b, ex);
    expect(faultsOf(await submit(a, ex, { files: [theirFile] }))).toContain("FILE_NOT_YOURS");
    expect(faultsOf(await submit(a, ex, { files: ["nothing_here_02"] }))).toContain("FILE_NOT_YOURS");
    const mine = await upload(a, ex);
    must(await submit(a, ex, { files: [mine] }));
    const again = await submit(a, ex, { files: [mine], replacesOnlineBidId: undefined });
    expect(faultsOf(again).some((f) => f === "FILE_NOT_DRAFT" || f === "LIVE_BID_HELD")).toBe(true);
    const outsider = await signIn(await identity());
    // The exercise is a public opportunity, so a supplier with no sale sees it, and is refused in words (the sale is the door).
    expect(faultsOf(await submit(outsider, ex, { files: ["nothing_here_03"] }))).toEqual(expect.arrayContaining(["NO_LIVE_SALE", "FILE_NOT_YOURS"]));
    expect(await submitBid(a.actor, { exerciseId: "no_such_exercise", kind: "BID", parentOnlineBidId: null, replacesOnlineBidId: null, fileIds: [mine], declaration: DECLARATION, stamp: await takeStamp(), stepUpAt: null })).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("a replace", () => {
  it("moves the old one to REPLACED with the new stamp, its envelope to SUPERSEDED, and re-points its live alternatives, in one act", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const first = must(await submit(s, ex));
    const alt = must(await submit(s, ex, { kind: "ALTERNATIVE", parentOnlineBidId: first.onlineBidId }));
    const next = must(await submit(s, ex, { replacesOnlineBidId: first.onlineBidId }));
    expect(next.warnings.map((w) => w.code)).toContain("REPLACE_REUPLOADS_ALL");
    const old = await bidRow(first.onlineBidId);
    const fresh = await bidRow(next.onlineBidId);
    expect(old.status).toBe("REPLACED");
    expect(old.statusAt).toEqual(fresh.envelope.receivedAt);
    expect(old.envelope.status).toBe("SUPERSEDED");
    expect(fresh.replacesOnlineBidId).toBe(first.onlineBidId);
    expect((await bidRow(alt.onlineBidId)).parentOnlineBidId).toBe(next.onlineBidId);
    expect(await db.onlineBid.count({ where: { exerciseId: ex.id, kind: "BID", status: "SUBMITTED" } })).toBe(1);
    expect(await db.auditEntry.count({ where: { entity: "OnlineBid", entityId: first.onlineBidId } })).toBe(2);
  });

  it("is refused after the closing (REPLACE_AFTER_CLOSING), and a second bid beside a standing one is refused (LIVE_BID_HELD)", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const first = must(await submit(s, ex));
    expect(faultsOf(await submit(s, ex))).toEqual(["LIVE_BID_HELD"]);
    const closing = new Date((await takeStamp()).getTime() - 5000);
    await setClosing(ex, closing);
    expect(faultsOf(await submit(s, ex, { replacesOnlineBidId: first.onlineBidId, stamp: new Date(closing.getTime() + 1000) }))).toEqual(["REPLACE_AFTER_CLOSING"]);
    expect((await bidRow(first.onlineBidId)).status).toBe("SUBMITTED");
  });

  it("an alternative replaces an alternative and a bid a bid, never across", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const bid = must(await submit(s, ex));
    const alt = must(await submit(s, ex, { kind: "ALTERNATIVE" }));
    expect(faultsOf(await submit(s, ex, { kind: "ALTERNATIVE", replacesOnlineBidId: bid.onlineBidId }))).toEqual(["REPLACE_KIND_CHANGED"]);
    expect(faultsOf(await submit(s, ex, { kind: "BID", replacesOnlineBidId: alt.onlineBidId }))).toEqual(["REPLACE_KIND_CHANGED"]);
    must(await submit(s, ex, { kind: "ALTERNATIVE", replacesOnlineBidId: alt.onlineBidId }));
  });
});

describe("a withdrawal", () => {
  it("withdraws the bid and the alternatives named, clears the link of the others, and the envelopes follow", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const bid = must(await submit(s, ex));
    const kept = must(await submit(s, ex, { kind: "ALTERNATIVE", parentOnlineBidId: bid.onlineBidId }));
    const gone = must(await submit(s, ex, { kind: "ALTERNATIVE", parentOnlineBidId: bid.onlineBidId }));
    const stamp = await takeStamp();
    const out = must(await withdraw(s, bid.onlineBidId, [gone.onlineBidId], stamp));
    expect(out.withdrawn).toEqual([bid.onlineBidId, gone.onlineBidId]);
    expect(out.linksCleared).toEqual([kept.onlineBidId]);
    for (const id of out.withdrawn) {
      const row = await bidRow(id);
      expect([row.status, row.envelope.status, row.statusAt]).toEqual(["WITHDRAWN", "WITHDRAWN", stamp]);
      // Ruling 20ak: the account that withdrew is on the row, on the alternative withdrawn in the same act too.
      expect(row.withdrawnBySupplierAccountId).toBe(s.actor.accountId);
    }
    const keptRow = await bidRow(kept.onlineBidId);
    expect([keptRow.status, keptRow.parentOnlineBidId, keptRow.withdrawnBySupplierAccountId]).toEqual(["SUBMITTED", null, null]);
    // One signed attribution, on the submission withdrawn (one password entry signs one act).
    const signed = await db.actAttribution.findMany({ where: { entity: "OnlineBid", slot: "withdrawnBy", entityId: { in: [bid.onlineBidId, gone.onlineBidId, kept.onlineBidId] } } });
    expect(signed.map((a) => [a.entityId, a.mode, a.subjectSupplierAccountId])).toEqual([[bid.onlineBidId, "SIGNED", s.actor.accountId]]);
    expect((await events(ex.id)).filter((e) => e.kind === "WITHDRAW")).toMatchObject([{ outcome: "GRANTED", recordId: bid.onlineBidId }]);
  });

  it("is refused after the closing, for a name that is not linked, for one already withdrawn; another supplier's bid is not found", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const other = await bidder(ex);
    const bid = must(await submit(s, ex));
    const theirs = must(await submit(other, ex, { kind: "ALTERNATIVE" }));
    expect(faultsOf(await withdraw(s, bid.onlineBidId, [theirs.onlineBidId]))).toEqual(["ALTERNATIVE_NOT_LINKED"]);
    expect(await withdraw(s, theirs.onlineBidId)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await withdraw(s, "nothing_here_04")).toEqual({ ok: false, reason: "NOT_FOUND" });
    must(await withdraw(s, bid.onlineBidId));
    expect(faultsOf(await withdraw(s, bid.onlineBidId))).toEqual(["NOT_LIVE"]);
    const late = await bidder(ex);
    const lateBid = must(await submit(late, ex));
    const closing = new Date((await takeStamp()).getTime() - 5000);
    await setClosing(ex, closing);
    expect(faultsOf(await withdraw(late, lateBid.onlineBidId, [], new Date(closing.getTime() + 1000)))).toEqual(["AFTER_CLOSING"]);
    must(await withdraw(late, lateBid.onlineBidId, [], closing));
  });
});

describe("two acts on one record", () => {
  it("concurrent submits by one supplier from two sessions leave one live bid", async () => {
    const ex = await exercise();
    const who = await identity();
    await enrol(ex, who);
    const one = await signIn(who);
    const two = await signIn(who);
    const [f1, f2] = [await upload(one, ex), await upload(two, ex)];
    const results = await Promise.all([submit(one, ex, { files: [f1] }), submit(two, ex, { files: [f2] })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.find((r) => !r.ok)!;
    expect(faultsOf(refused)).toEqual(["LIVE_BID_HELD"]);
    expect(await db.onlineBid.count({ where: { exerciseId: ex.id, supplierId: who.supplierId, kind: "BID", status: "SUBMITTED" } })).toBe(1);
  });

  it("a submit carrying a password entry the session has since replaced (a second tab confirmed again) is refused in words (NOT_TAKEN), never thrown, and writes nothing; the fresh entry is taken", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const [f1, f2] = [await upload(s, ex), await upload(s, ex)];
    const stamp = await takeStamp();
    const first = await confirmSupplierPassword(s.actor, s.identity.password, facts());
    const second = await confirmSupplierPassword(s.actor, s.identity.password, facts());
    if (!first.ok || !second.ok) throw new Error("password refused");
    const input = (fileId: string, at: Date): SubmitInput => ({ exerciseId: ex.id, kind: "BID", parentOnlineBidId: null, replacesOnlineBidId: null, fileIds: [fileId], declaration: DECLARATION, stamp, stepUpAt: at });
    // The first request's entry is stale: the second overwrote the session's.
    expect(await submitBid(s.actor, input(f1, first.at))).toEqual({ ok: false, reason: "REFUSED", faults: ["NOT_TAKEN"] });
    expect(await db.onlineBid.count({ where: { exerciseId: ex.id } })).toBe(0);
    expect((await db.onlineBidFile.findUniqueOrThrow({ where: { id: f1 } })).state).toBe("DRAFT");
    expect((await events(ex.id)).filter((e) => e.kind === "SUBMIT")).toMatchObject([{ outcome: "REFUSED", reasonCode: "NOT_TAKEN" }]);
    expect(must(await submitBid(s.actor, input(f2, second.at))).receipt.submissionNumber).toBe(1);
  });

  it("a transaction that runs out of time (P2028) is NOT_TAKEN in words for a submit and for a withdrawal, with one refused event each", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const timedOut = { afterDoors: async () => { throw Object.assign(new Error("Transaction API error"), { code: "P2028" }); } };
    expect(await submit(s, ex, { hooks: timedOut })).toEqual({ ok: false, reason: "REFUSED", faults: ["NOT_TAKEN"] });
    expect(await db.onlineBid.count({ where: { exerciseId: ex.id } })).toBe(0);
    const taken = must(await submit(s, ex));
    expect(await withdraw(s, taken.onlineBidId, [], undefined, timedOut)).toEqual({ ok: false, reason: "REFUSED", faults: ["NOT_TAKEN"] });
    expect((await db.onlineBid.findUniqueOrThrow({ where: { id: taken.onlineBidId } })).status).toBe("SUBMITTED");
    expect((await events(ex.id)).filter((e) => e.outcome === "REFUSED").map((e) => [e.kind, e.reasonCode])).toEqual([["SUBMIT", "NOT_TAKEN"], ["WITHDRAW", "NOT_TAKEN"]]);
  });

  it("a second standing bid that gets past the door is refused at the commit as LIVE_BID_HELD, in words, not thrown, and nothing of the act remains", async () => {
    // A rival cannot commit on another connection while the act holds the exercise's lock: its foreign keys wait on it. So the rival that bypassed the lock is written inside the act's
    // own transaction, after the door has passed, which the one-standing-bid trigger reads at the commit just the same.
    const ex = await exercise();
    const s = await bidder(ex);
    const file = await upload(s, ex);
    const out = await submit(s, ex, {
      files: [file],
      hooks: {
        afterDoors: async (tx) => {
          const envelopeId = newId("env");
          await tx.$executeRawUnsafe(
            `INSERT INTO "BidEnvelope" ("id","organisationId","exerciseId","sequence","kind","channel","receivedAt","receivedSource","markings","late","recordedAfterClosing") VALUES ($1,$2,$3,9000,'BID','ONLINE',date_trunc('second',"sealed_clock"()),'PORTAL','',false,false)`,
            envelopeId, org, ex.id,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "OnlineBid" ("id","organisationId","exerciseId","keyId","envelopeId","supplierId","submittedBySupplierAccountId","kind","sealedManifest","manifestDek","manifestCipherSha256","sealedDeclaration","declarationDek","declarationCipherSha256","receiptDigest")
             VALUES ($1,$2,$3,$4,$5,$6,$7,'BID',decode($8,'hex'),decode($9,'hex'),$10,decode($11,'hex'),decode($12,'hex'),$13,$14)`,
            newId("bid"), org, ex.id, ex.keyId, envelopeId, s.actor.supplierId, s.actor.accountId, hex(200), hex(80), hex(32), hex(60), hex(80), hex(32), hex(32),
          );
        },
      },
    });
    expect(out).toEqual({ ok: false, reason: "REFUSED", faults: ["LIVE_BID_HELD"] });
    expect(await db.onlineBid.count({ where: { exerciseId: ex.id } })).toBe(0);
    expect((await db.onlineBidFile.findUniqueOrThrow({ where: { id: file } })).state).toBe("DRAFT");
    expect((await events(ex.id)).filter((e) => e.kind === "SUBMIT")).toMatchObject([{ outcome: "REFUSED", reasonCode: "LIVE_BID_HELD" }]);
  });

  it("a refusal at the write that the door had passed is NOT_TAKEN, in words, with nothing recorded", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const file = await upload(s, ex);
    const out = await submit(s, ex, {
      files: [file],
      hooks: { afterDoors: async (tx) => { await tx.onlineBidFile.update({ where: { id: file }, data: { state: "DISCARDED" } }); } },
    });
    expect(out).toEqual({ ok: false, reason: "REFUSED", faults: ["NOT_TAKEN"] });
    expect(await db.onlineBid.count({ where: { exerciseId: ex.id } })).toBe(0);
    expect(await db.bidEnvelope.count({ where: { exerciseId: ex.id } })).toBe(0);
    expect((await events(ex.id)).filter((e) => e.kind === "SUBMIT")).toMatchObject([{ outcome: "REFUSED", reasonCode: "NOT_TAKEN" }]);
  });
});

describe("READ COMMITTED (the one-standing-bid trigger refuses any other isolation)", () => {
  it("the act's transaction options set no isolation, and the default reads read committed", async () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/bids/online/submit-store.ts"), "utf8");
    expect(src).not.toMatch(/isolationLevel/);
    expect(src).toMatch(/const ACT_TX = \{ timeout: 90_000, maxWait: 20_000 \} as const;/);
    const level = await db.$transaction(async (tx) => (await tx.$queryRaw<{ level: string }[]>`SELECT current_setting('transaction_isolation') AS level`)[0].level, { timeout: 90_000, maxWait: 20_000 });
    expect(level).toBe("read committed");
  });

  it("the act's transaction timeout is longer than the stamp skew, so a long lock wait ends at the database's refusal of the stamp", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/bids/online/submit-store.ts"), "utf8");
    const timeout = Number(/timeout: ([0-9_]+)/.exec(src)![1].replace(/_/g, ""));
    expect(timeout).toBeGreaterThan((MAX_STAMP_SKEW_SECONDS + 10) * 1000);
  });
});

describe("a stale stamp (ruling 20aa): an act held on the locks past the skew", () => {
  it("a submit and a withdrawal held on the exercise's lock for longer than the skew are refused as STAMP_STALE, write one access event each, and leave the lockout counter unchanged", async () => {
    const exA = await exercise();
    const exB = await exercise();
    const sa = await bidder(exA);
    const sb = await bidder(exB);
    const standing = must(await submit(sb, exB));
    const file = await upload(sa, exA);
    const failedBefore = (a: Session) => db.supplierAccount.findUniqueOrThrow({ where: { id: a.actor.accountId }, select: { failedAttempts: true } });
    const countsBefore = [(await failedBefore(sa)).failedAttempts, (await failedBefore(sb)).failedAttempts];

    // A second connection holds each exercise's lock past the skew.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked = 0;
    let bothLocked!: () => void;
    const ready = new Promise<void>((resolve) => (bothLocked = resolve));
    const hold = (exerciseId: string) =>
      db.$transaction(async (tx) => {
        await lockExerciseSide(tx, org, exerciseId);
        if (++locked === 2) bothLocked();
        await held;
      }, { timeout: 120_000, maxWait: 20_000 });
    const holders = [hold(exA.id), hold(exB.id)];
    await ready;
    const submitting = submit(sa, exA, { files: [file] });
    const withdrawing = withdraw(sb, standing.onlineBidId);
    await new Promise((resolve) => setTimeout(resolve, (MAX_STAMP_SKEW_SECONDS + 3) * 1000));
    release();
    await Promise.all(holders);
    const [submitted, withdrawn] = await Promise.all([submitting, withdrawing]);

    expect(submitted).toEqual({ ok: false, reason: "REFUSED", faults: ["STAMP_STALE"] });
    expect(withdrawn).toEqual({ ok: false, reason: "REFUSED", faults: ["STAMP_STALE"] });
    expect(await db.onlineBid.count({ where: { exerciseId: exA.id } })).toBe(0);
    expect((await bidRow(standing.onlineBidId)).status).toBe("SUBMITTED");
    expect((await events(exA.id)).filter((e) => e.kind === "SUBMIT")).toMatchObject([{ outcome: "REFUSED", reasonCode: "STAMP_STALE" }]);
    expect((await events(exB.id)).filter((e) => e.kind === "WITHDRAW")).toMatchObject([{ outcome: "REFUSED", reasonCode: "STAMP_STALE" }]);
    expect([(await failedBefore(sa)).failedAttempts, (await failedBefore(sb)).failedAttempts]).toEqual(countsBefore);
  }, 120_000);
});

describe("through the route, against the real stores", () => {
  const post = (body: unknown) => {
    const text = JSON.stringify({ ...(body as object), [FORM_TOKEN_FIELD]: signFormToken(FORM_KEY, "bids", new Date()) });
    return new Request("http://portal.example/supplier/bids/submit", {
      method: "POST", body: text,
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)), "sec-fetch-site": "same-origin", origin: "http://portal.example", host: "portal.example" },
    });
  };

  it("a wrong password increments the lockout counter and submits nothing; the right one submits and answers the receipt", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    const file = await upload(s, ex);
    session.actor = s.actor;
    const body = { exerciseId: ex.id, kind: "BID" as OnlineBidKind, fileIds: [file], declaration: DECLARATION };
    const wrong = await submitRoute(post({ ...body, password: "not the password" }));
    expect([wrong.status, (await wrong.json()).code]).toEqual([403, "WRONG_PASSWORD"]);
    expect((await db.supplierAccount.findUniqueOrThrow({ where: { id: s.actor.accountId } })).failedAttempts).toBe(1);
    expect(await db.onlineBid.count({ where: { exerciseId: ex.id } })).toBe(0);
    const right = await submitRoute(post({ ...body, password: s.identity.password }));
    const answer = await right.json();
    expect([right.status, answer.ok, answer.receipt.submissionNumber]).toEqual([201, true, 1]);
    expect((await db.supplierAccount.findUniqueOrThrow({ where: { id: s.actor.accountId } })).failedAttempts).toBe(0);
  });

  it("a validation failure is a structured 400, and an exercise that is not there is a 404", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    session.actor = s.actor;
    const bad = await submitRoute(post({ exerciseId: ex.id, kind: "BID", fileIds: [], declaration: DECLARATION, password: "x", extra: 1 }));
    expect([bad.status, (await bad.json()).fields]).toEqual([400, ["unknown"]]);
    const gone = await submitRoute(post({ exerciseId: "no_such_exercise", kind: "BID", fileIds: ["nothing_here_05"], declaration: DECLARATION, password: s.identity.password }));
    expect([gone.status, (await gone.json()).code]).toEqual([404, "NOT_FOUND"]);
  });

  it("repeated rate refusals in one window write exactly one access event (20w)", async () => {
    const ex = await exercise();
    const s = await bidder(ex);
    session.actor = s.actor;
    const limit = RATE_LIMITS["bid-submit"].limit;
    const statuses: number[] = [];
    // A declaration the rules refuse is answered after the rate is counted and before the password is asked, so these tries are cheap.
    for (let n = 0; n < limit + 5; n++) statuses.push((await submitRoute(post({ exerciseId: ex.id, kind: "BID", fileIds: ["nothing_here_06"], declaration: { price: "0", completionPeriod: 0, completionUnit: "X" }, password: "p" }))).status);
    expect(statuses.filter((x) => x === 429)).toHaveLength(5);
    expect((await events(ex.id)).filter((e) => e.kind === "SUBMIT")).toMatchObject([{ outcome: "REFUSED", reasonCode: "RATE_LIMITED" }]);
  });
});

describe("the void register answers identically for every buyer before the opening, with and without online submissions (S21, ruling 20r)", () => {
  it("voidSaleFault and voidRefusalNote read the same for a buyer with a submission, one without, and one who withdrew", async () => {
    const ex = await exercise();
    const buyers = [await bidder(ex), await bidder(ex), await bidder(ex)];
    must(await submit(buyers[0], ex));
    const withdrawn = must(await submit(buyers[1], ex));
    must(await withdraw(buyers[1], withdrawn.onlineBidId));
    const parties = await db.exerciseParty.findMany({ where: { exerciseId: ex.id }, orderBy: { createdAt: "asc" } });
    // Both readings of whether a party holds a bid envelope: the register's list, and the void act's count on the locked register.
    const holders = new Set((await db.bidEnvelope.findMany({ where: { exerciseId: ex.id, partyId: { not: null }, status: { not: "WITHDRAWN" }, kind: { not: "COMPANY_ESTIMATE" } }, select: { partyId: true } })).map((e) => e.partyId));
    const readings: string[] = [];
    for (const p of parties) {
      const holdsByList = holders.has(p.id);
      const holdsByCount = (await db.bidEnvelope.count({ where: { exerciseId: ex.id, partyId: p.id, status: { not: "WITHDRAWN" }, kind: { not: "COMPANY_ESTIMATE" } } })) > 0;
      expect([holdsByList, holdsByCount]).toEqual([false, false]);
      for (const phase of ["OPEN_FOR_PURCHASE", "CLOSED", "CANCELLED"] as const) {
        const f = voidSaleFault({ voidedAt: null, purchaseId: null }, phase, "a reason", holdsByList);
        readings.push(`${phase}|${f ? f.code : "allowed"}|${f ? voidRefusalNote(windowFindingText(f)) : ""}`);
      }
    }
    expect(parties).toHaveLength(3);
    // Three phases for each of three buyers, and every buyer reads the same.
    expect(readings).toHaveLength(9);
    expect(new Set(readings.slice(0, 3)).size).toBe(3);
    expect(readings.slice(3, 6)).toEqual(readings.slice(0, 3));
    expect(readings.slice(6, 9)).toEqual(readings.slice(0, 3));
    // Online envelopes name no party before the opening, which is why.
    expect(await db.bidEnvelope.count({ where: { exerciseId: ex.id, channel: "ONLINE", partyId: { not: null } } })).toBe(0);
  });

  it("the void guard's sources never read the online bid (20r): OnlineBid is not added to holdsEnvelope in the sale rule, the void act or the register's read", () => {
    for (const file of ["src/lib/window/sale.ts", "src/lib/window/read.ts", "src/app/sourcing/[id]/window/register-actions.ts"]) {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src, file).not.toMatch(/onlineBid|OnlineBid/);
    }
  });
});

describe("what the supplier's screens read (build plan step 11)", () => {
  it("numbers a supplier's own submissions from its own rows only, and shows another supplier's none of them", async () => {
    const ex = await exercise();
    const [a, b] = [await bidder(ex), await bidder(ex)];
    const first = must(await submit(a, ex));
    must(await submit(b, ex));
    const second = must(await submit(a, ex, { replacesOnlineBidId: first.onlineBidId }));
    const screen = (await loadBidScreen(db, a.actor, ex.id))!;
    expect(screen.online).toBe(true);
    expect(screen.demonstration).toBe(true);
    expect(screen.submissions.map((v) => [v.id, v.number, v.status])).toEqual([[second.onlineBidId, 2, "SUBMITTED"], [first.onlineBidId, 1, "REPLACED"]]);
    expect(screen.submissions[0].receiptDigest).toBe(second.receipt.receiptDigest);
    expect(screen.submissions[0].withdraw).toEqual({ allowed: true });
    expect(screen.replaceable.map((r) => r.id)).toEqual([second.onlineBidId]);
    expect(screen.bidStands).toBe(true);
    const theirs = (await loadBidScreen(db, b.actor, ex.id))!;
    expect(theirs.submissions.map((v) => v.number)).toEqual([1]);
    expect(JSON.stringify(screen)).not.toContain(theirs.submissions[0].id);
    // An exercise the supplier may not see reads as nothing at all.
    expect(await loadBidScreen(db, a.actor, "nothing_here_99")).toBeNull();
  });

  it("re-keying an exercise with a supplier's draft waiting: the page's data carries the notice for that supplier only, naming both fingerprints, and not a draft it discarded itself", async () => {
    const ex = await exercise();
    const [a, b] = [await bidder(ex), await bidder(ex)];
    const kept = await upload(a, ex);
    const own = await upload(a, ex);
    expect(own).not.toBe(kept);
    const { discardPart } = await import("./upload-store");
    expect((await discardPart(a.actor, { exerciseId: ex.id, fileId: own })).ok).toBe(true);
    expect((await loadBidScreen(db, a.actor, ex.id))!.parts[0].draft?.fileId).toBe(kept);

    const made = await db.$transaction((tx) => rekeyKey(tx, { organisationId: org, exerciseId: ex.id, reason: "A test re-key", now: new Date(), byPersonId: issuer }));
    expect(made).not.toBeNull();

    const mine = (await loadBidScreen(db, a.actor, ex.id))!;
    expect(mine.discarded).toEqual([{ sealedTo: ex.fingerprint, now: made!.made.fingerprint, files: 1 }]);
    expect(mine.liveFingerprint).toBe(made!.made.fingerprint);
    expect(mine.parts[0].draft).toBeNull();
    expect((await loadBidScreen(db, b.actor, ex.id))!.discarded).toEqual([]);
  });

  it("a supplier reads the fingerprint history of an exercise it may see, without the reason or the officer, in the order the staff card reads, and not another organisation's or a restricted exercise's", async () => {
    const ex = await exercise();
    const [a, b] = [await bidder(ex), await bidder(ex)];
    const first = await db.$transaction((tx) => rekeyKey(tx, { organisationId: org, exerciseId: ex.id, reason: "The first re-key, a secret reason", now: new Date(), byPersonId: issuer }));
    const second = await db.$transaction((tx) => rekeyKey(tx, { organisationId: org, exerciseId: ex.id, reason: "The second re-key", now: new Date(Date.now() + 1000), byPersonId: issuer }));
    const seen = (await loadKeyHistory(db, a.actor, ex.id))!;
    expect(seen.fingerprint).toBe(second!.made.fingerprint);
    expect(seen.changes.map((c) => [c.fromFingerprint, c.toFingerprint])).toEqual([[first!.made.fingerprint, second!.made.fingerprint], [ex.fingerprint, first!.made.fingerprint]]);
    expect(Object.keys(seen.changes[0]).sort()).toEqual(["at", "fromFingerprint", "id", "toFingerprint"]);
    expect(JSON.stringify(seen)).not.toContain("secret reason");
    // The staff card reads the same rows in the same order (the one order constant).
    const staff = await db.publishedKeyChange.findMany({ where: { exerciseId: ex.id, organisationId: org }, orderBy: [...KEY_CHANGE_ORDER], select: { id: true } });
    expect(seen.changes.map((c) => c.id)).toEqual(staff.map((c) => c.id));
    expect((await loadKeyHistory(db, b.actor, ex.id))!.changes).toHaveLength(2);

    // Another organisation's supplier, and an exercise restricted to people the supplier is not among: nothing.
    const elsewhere = await db.organisation.create({ data: { code: `SUB_O_${randomId()}`, name: "Another", timeZone: "Asia/Kuala_Lumpur" } });
    expect(await loadKeyHistory(db, { ...a.actor, organisationId: elsewhere.id }, ex.id)).toBeNull();
    const hidden = await exercise();
    await db.sourcingExercise.update({ where: { id: hidden.id }, data: { restricted: true } });
    expect(await loadKeyHistory(db, a.actor, hidden.id)).toBeNull();
    expect(await loadBidScreen(db, a.actor, hidden.id)).toBeNull();
  });
});
