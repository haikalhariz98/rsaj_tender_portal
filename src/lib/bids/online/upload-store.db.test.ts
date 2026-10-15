import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/documents/store";
import { SEALED_BIDS_DEMONSTRATION_ENV } from "@/lib/integration/sealing-deployment";
import { MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE, RATE_LIMITS, rateRefusalLogged } from "@/lib/portal/bids/limits";
import { countAndJudgeCounted } from "@/lib/portal/bids/rate-store";
import { fileBodyAad, fileDekAad } from "@/lib/sealing/file-seal";
import { unpackHpke } from "@/lib/sealing/hpke";
import { gcmOpen, hpkeOpen } from "@/lib/sealing/open";
import { fingerprint, generateX25519 } from "@/lib/sealing/x25519";
import { makeSupplierAccount, randomId } from "@/lib/test-db/auth-fixtures";

import type { OnlineBidRules } from "./types";
import { discardPart, loadUploadFacts, logPartRefusal, PartRefused, storePart, type UploadFacts } from "./upload-store";

/**
 * The part upload's store against a real database (SR-13, ADR 0036 D5, D6; plan step 9): the exercise as a supplier may see it, the sealed draft and what the database holds of
 * it (no plain byte, no filename), the audit row and the access event beside it, the cap judged again under the supplier's lock so two uploads that arrive together cannot both
 * pass it, a key re-made between the read and the write, the discard, and the 20w rate rule counted by the database.
 */

const PLAIN = Buffer.from("%PDF-1.7\nTHE-PLAIN-MARKER-FOR-THE-DATABASE-TEST\n");
const FILENAME = "secret-tender-name.pdf";
const DAY = 24 * 60 * 60 * 1000;
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const hex = (n: number) => randomBytes(n).toString("hex");
const newId = (p: string) => `${p}_${randomId()}${randomId()}`;

let org = "";
let packPartId = "";
let exerciseId = "";
let windowId = "";
let reference = "";
let issuer = "";
let keyId = "";
const pair = generateX25519();
const ENV_BEFORE = process.env[SEALED_BIDS_DEMONSTRATION_ENV];

const rules = (): OnlineBidRules => ({ v: 1, frozenAt: new Date().toISOString(), parts: [{ packPartId, label: "Form of Tender", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000000", openingCheck: true }] });

async function supplier(withSale = true): Promise<{ actor: SupplierActor }> {
  const s = await makeSupplierAccount(org);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(new Date(Date.now() - 100 * DAY)) } });
  const party = await db.exerciseParty.create({ data: { organisationId: org, exerciseId, source: "PURCHASER", name: `Party ${randomId()}`, registrationNo: `RN-${randomId()}`, vendorId: s.supplier.id } });
  if (withSale) {
    await db.documentSale.create({ data: { organisationId: org, windowId, partyId: party.id, soldOn: D(new Date()), collectedBy: "A collector", authoritySighted: true, amount: "50.00", paymentMethod: "Cash", issuedByPersonId: issuer, annotation: { v: 1, purchaser: party.name } } });
  }
  const actor: SupplierActor = {
    kind: "SUPPLIER", accountId: s.account!.id, sessionId: `sess_${randomId()}`, contactId: s.contact.id, displayName: s.contact.name, supplierId: s.supplier.id, supplierName: s.supplier.registeredName,
    loginName: s.loginName, organisationId: org, organisationTimeZone: "Asia/Kuala_Lumpur", stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: "203.0.113.9", mustChangePassword: false, resetNoticePending: false,
  };
  return { actor };
}

const factsFor = async (actor: SupplierActor): Promise<UploadFacts> => {
  const f = await loadUploadFacts(db, actor, { exerciseId, packPartId });
  if (!f) throw new Error("the supplier cannot see the exercise");
  return f;
};
const upload = async (actor: SupplierActor, facts?: UploadFacts) =>
  storePart(actor, { facts: facts ?? (await factsFor(actor)), packPartId, plain: new Uint8Array(PLAIN), filename: FILENAME, mediaType: "application/pdf", scan: "NOT_SCANNED", scannerConfigured: false });

beforeAll(async () => {
  process.env[SEALED_BIDS_DEMONSTRATION_ENV] = "true";
  org = (await db.organisation.create({ data: { code: `UPL_${randomId()}`, name: "Part upload test", timeZone: "Asia/Kuala_Lumpur" } })).id;
  const namer = (await db.person.create({ data: { organisationId: org, name: `Namer ${randomId()}` } })).id;
  issuer = namer;
  const officers = [(await db.person.create({ data: { organisationId: org, name: `Officer A ${randomId()}` } })).id, (await db.person.create({ data: { organisationId: org, name: `Officer B ${randomId()}` } })).id];
  const requisitionId = (
    await db.requisition.create({
      data: { organisationId: org, reference: `UPL/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: namer, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") },
    })
  ).id;
  reference = `UPL/EX/${randomId()}`;
  const ex = await db.sourcingExercise.create({
    data: { organisationId: org, reference, requisitionId, title: "Part upload", estimatedValue: "1000.00", sourcingMethodCode: "UPL_METHOD", status: "DOCUMENTS_IN_PREPARATION", closingAt: new Date(Date.now() + 30 * DAY), submissionChannel: "ONLINE", onlineSubmissionMode: "DEMONSTRATION" },
  });
  exerciseId = ex.id;
  windowId = (
    await db.exerciseWindow.create({
      data: { organisationId: org, exerciseId, path: "ADVERTISED", publishedAt: new Date(Date.now() - 2 * DAY), advertisementDay: D(new Date(Date.now() - 2 * DAY)), policySnapshot: { attendance: { mandatoryPermitted: true } }, purchaseFromDay: D(new Date(Date.now() - DAY)), purchaseCloseDay: D(new Date(Date.now() + 10 * DAY)), feeAmount: "50.00" },
    })
  ).id;
  const pack = await db.tenderPack.create({ data: { organisationId: org, exerciseId, versionNo: 1, packKind: "TENDER", contractBasisCode: "X", compositionSnapshot: {} } });
  packPartId = (await db.tenderPackPart.create({ data: { organisationId: org, packId: pack.id, partCode: "FORM", printedNumber: "1", sortOrder: 1, labelSnapshot: "Form of Tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE" } })).id;
  // The roster, its keys, the exercise key and the shares, set before publication.
  const roster: string[] = [];
  for (const personId of officers) roster.push((await db.exerciseOpeningOfficer.create({ data: { organisationId: org, exerciseId, personId, seatLabelSnapshot: "Member", namedAt: new Date(), namedByPersonId: namer } })).id);
  keyId = newId("key");
  await db.$transaction(async (tx) => {
    const officerKeys: string[] = [];
    for (let i = 0; i < officers.length; i++) {
      const id = newId("ok");
      officerKeys.push(id);
      await tx.$executeRawUnsafe(
        `INSERT INTO "OfficerExerciseKey" ("id","organisationId","exerciseId","openingOfficerId","personId","publicKey","wrappedPrivateKey","kdfLog2N","kdfR","kdfP","kdfSalt","createdAt") VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),decode($7,'hex'),17,8,1,decode($8,'hex'),"sealed_clock"())`,
        id, org, exerciseId, roster[i], officers[i], hex(32), hex(60), hex(16),
      );
    }
    await tx.$executeRawUnsafe(
      `INSERT INTO "ExerciseSealingKey" ("id","organisationId","exerciseId","publicKey","fingerprint","officerCount","createdAt") VALUES ($1,$2,$3,decode($4,'hex'),$5,2,"sealed_clock"())`,
      keyId, org, exerciseId, Buffer.from(pair.publicKey).toString("hex"), fingerprint(pair.publicKey),
    );
    for (let i = 0; i < officers.length; i++) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "ExerciseKeyShare" ("id","organisationId","keyId","openingOfficerId","officerKeyId","sealedShare","createdAt") VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),"sealed_clock"())`,
        newId("sh"), org, keyId, roster[i], officerKeys[i], hex(80),
      );
    }
  });
  await db.sourcingExercise.update({ where: { id: exerciseId }, data: { onlineBidRules: rules() as never, publishedKeyFingerprint: fingerprint(pair.publicKey) } });
  // Publication: the status moves last, once the channel, the mode, the rules and the fingerprint are frozen (the order the triggers read).
  await db.sourcingExercise.update({ where: { id: exerciseId }, data: { status: "ADVERTISED" } });
});

afterAll(async () => {
  if (ENV_BEFORE === undefined) delete process.env[SEALED_BIDS_DEMONSTRATION_ENV];
  else process.env[SEALED_BIDS_DEMONSTRATION_ENV] = ENV_BEFORE;
  await db.$disconnect();
});

describe("the exercise as a supplier may see it", () => {
  it("an open exercise with a live sale has every door open", async () => {
    const { actor } = await supplier();
    const f = await factsFor(actor);
    expect(f.gate).toEqual([]);
    expect(f.key?.id).toBe(keyId);
    expect(f.rule?.packPartId).toBe(packPartId);
    expect(f.demonstration).toBe(true);
    expect(f.draftFiles).toBe(0);
  });
  it("a supplier with no sale is told so, and an unknown or another organisation's exercise is null", async () => {
    const { actor } = await supplier(false);
    expect((await factsFor(actor)).gate).toEqual(["NO_LIVE_SALE"]);
    expect(await loadUploadFacts(db, actor, { exerciseId: "nothing_00000001", packPartId })).toBeNull();
    const other = await db.organisation.create({ data: { code: `UPL_O_${randomId()}`, name: "Another", timeZone: "Asia/Kuala_Lumpur" } });
    expect(await loadUploadFacts(db, { ...actor, organisationId: other.id }, { exerciseId, packPartId })).toBeNull();
  });
  it("an exercise whose deployment switch is off is shut (a demonstration exercise needs the deployment to allow it)", async () => {
    const { actor } = await supplier();
    delete process.env[SEALED_BIDS_DEMONSTRATION_ENV];
    try {
      expect((await factsFor(actor)).gate).toEqual(["ONLINE_NOT_ALLOWED"]);
    } finally {
      process.env[SEALED_BIDS_DEMONSTRATION_ENV] = "true";
    }
  });
});

describe("storing a part", () => {
  it("writes a DRAFT whose bytes hold nothing plain, with the audit row and the access event beside it", async () => {
    const { actor } = await supplier();
    const stored = await upload(actor);
    expect(stored).toMatchObject({ plainBytes: PLAIN.length, plainSha256: sha256Hex(PLAIN), scan: "NOT_SCANNED", packPartId });
    const file = await db.onlineBidFile.findUniqueOrThrow({ where: { id: stored.fileId } });
    expect(file).toMatchObject({ state: "DRAFT", scan: "NOT_SCANNED", supplierId: actor.supplierId, uploadedBySupplierAccountId: actor.accountId, keyId, exerciseId, releasedDek: null });
    const blob = await db.blobContent.findUniqueOrThrow({ where: { organisationId_sha256: { organisationId: org, sha256: file.cipherSha256 } } });
    expect(blob.sha256).toBe(sha256Hex(blob.bytes));
    for (const held of [blob.bytes, file.sealedDek, file.sealedMeta]) {
      expect(Buffer.from(held).includes(Buffer.from("THE-PLAIN-MARKER"))).toBe(false);
      expect(Buffer.from(held).includes(Buffer.from(FILENAME))).toBe(false);
    }
    // The exercise key opens it.
    const ctx = { organisationId: org, exerciseId, keyId, fileId: file.id, packPartId };
    const dek = hpkeOpen(pair.privateKey, unpackHpke(new Uint8Array(file.sealedDek)), fileDekAad(ctx));
    const cipher = new Uint8Array(blob.bytes);
    const plain = gcmOpen(dek, { iv: new Uint8Array(file.bodyIv), ct: cipher.slice(0, cipher.length - 16), tag: cipher.slice(cipher.length - 16) }, fileBodyAad(ctx));
    expect(Buffer.from(plain).equals(PLAIN)).toBe(true);
    // The audit row and the event name ids and the digest, never the filename or a plain byte.
    const audit = await db.auditEntry.findFirstOrThrow({ where: { organisationId: org, entity: "OnlineBidFile", entityId: file.id } });
    expect(audit.action).toBe("CREATE");
    expect(JSON.stringify(audit)).not.toContain(FILENAME);
    expect(JSON.stringify(audit)).toContain(file.cipherSha256);
    const event = await db.sealedAccessEvent.findFirstOrThrow({ where: { exerciseId, recordId: file.id } });
    expect(event).toMatchObject({ kind: "PART_UPLOAD", outcome: "GRANTED", supplierAccountId: actor.accountId });
  });

  it("an upload sealed to a key that is no longer live is refused in the rule's words and stores nothing", async () => {
    const { actor } = await supplier();
    const f = await factsFor(actor);
    const before = await db.onlineBidFile.count({ where: { supplierId: actor.supplierId } });
    const e = await upload(actor, { ...f, key: { ...f.key!, id: "key_retired_000001" } }).catch((x) => x);
    expect(e).toBeInstanceOf(PartRefused);
    expect((e as PartRefused).faults).toEqual(["KEY_NOT_LIVE"]);
    expect(await db.onlineBidFile.count({ where: { supplierId: actor.supplierId } })).toBe(before);
  });

  it("two uploads that arrive together at the cap: exactly one is taken", async () => {
    const { actor } = await supplier();
    for (let i = 0; i < MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE - 1; i++) await upload(actor);
    const f = await factsFor(actor);
    expect(f.draftFiles).toBe(MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE - 1);
    const results = await Promise.allSettled([upload(actor, f), upload(actor, f)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(PartRefused);
    expect((refused.reason as PartRefused).faults).toEqual(["TOO_MANY_DRAFT_FILES"]);
    expect(await db.onlineBidFile.count({ where: { supplierId: actor.supplierId, state: "DRAFT" } })).toBe(MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE);
  }, 120_000);
});

describe("discarding a part", () => {
  it("the supplier's own draft is discarded, with audit and event; a second discard changes nothing", async () => {
    const { actor } = await supplier();
    const { fileId } = await upload(actor);
    expect(await discardPart(actor, { exerciseId, fileId })).toEqual({ ok: true, changed: true });
    expect((await db.onlineBidFile.findUniqueOrThrow({ where: { id: fileId } })).state).toBe("DISCARDED");
    expect(await db.auditEntry.count({ where: { organisationId: org, entity: "OnlineBidFile", entityId: fileId, action: "UPDATE" } })).toBe(1);
    expect(await db.sealedAccessEvent.count({ where: { exerciseId, recordId: fileId, kind: "PART_DISCARD", outcome: "GRANTED" } })).toBe(1);
    expect(await discardPart(actor, { exerciseId, fileId })).toEqual({ ok: true, changed: false });
    expect(await db.sealedAccessEvent.count({ where: { exerciseId, recordId: fileId, kind: "PART_DISCARD" } })).toBe(1);
    // A discarded draft frees its place.
    expect((await factsFor(actor)).draftFiles).toBe(0);
  });
  it("another supplier's file, and a file that does not exist, are not found, and nothing changes", async () => {
    const mine = await supplier();
    const theirs = await supplier();
    const { fileId } = await upload(mine.actor);
    expect(await discardPart(theirs.actor, { exerciseId, fileId })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await discardPart(mine.actor, { exerciseId, fileId: "nothing_00000001" })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect((await db.onlineBidFile.findUniqueOrThrow({ where: { id: fileId } })).state).toBe("DRAFT");
  });
});

describe("the rate limit is counted by the database (20w)", () => {
  it("the first refusal in a window is the one just over the limit, and one event is written for it", async () => {
    const { actor } = await supplier();
    const { limit } = RATE_LIMITS["bid-part-upload"];
    const now = new Date("2026-11-05T03:00:10Z");
    const logged: number[] = [];
    for (let i = 1; i <= limit + 5; i++) {
      const v = await countAndJudgeCounted(db, { organisationId: org, accountId: actor.accountId, action: "bid-part-upload" }, now);
      expect(v.limited).toBe(i > limit);
      if (v.limited && rateRefusalLogged(v.count, limit)) {
        logged.push(v.count);
        await logPartRefusal(actor, exerciseId, "PART_UPLOAD", "RATE_LIMITED");
      }
    }
    expect(logged).toEqual([limit + 1]);
    expect(await db.sealedAccessEvent.count({ where: { exerciseId, supplierAccountId: actor.accountId, reasonCode: "RATE_LIMITED" } })).toBe(1);
  });
  it("a refusal for an exercise that is not the organisation's leaves no row", async () => {
    const { actor } = await supplier();
    await logPartRefusal(actor, "nothing_00000001", "PART_UPLOAD", "RATE_LIMITED");
    expect(await db.sealedAccessEvent.count({ where: { supplierAccountId: actor.accountId } })).toBe(0);
  });
});
