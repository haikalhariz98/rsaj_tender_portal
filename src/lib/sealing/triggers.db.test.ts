import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { notYetPresent, SEALED_TABLES } from "@/lib/auth/db-role";
import { db } from "@/lib/db";
import { MAX_STAMP_SKEW_SECONDS } from "@/lib/portal/bids/limits";
import { makeSupplierAccount, randomId } from "@/lib/test-db/auth-fixtures";

import { applyAppRole } from "../../../scripts/db-role-apply";

/**
 * Wave 3b step 2 (ADR 0036 D12, build plan §1.4 triggers 1 to 10): each trigger of migration 20261103110000, proved against the database.
 *
 * The app's login is played by `perolehan_app_test` (NOLOGIN), given exactly the grants `scripts/db-roles.ts` gives the real one through the same function, and
 * reached with SET LOCAL ROLE, as in `trail-integrity.db.test.ts`. Every act here runs as that role unless the test is about the owner. The rows are written in raw
 * SQL, as an attacker holding the app's login would write them: the triggers, not the application, are what is under test. Each refusal is told apart by its
 * SQLSTATE: PA010 to PA024 the wave 3b triggers, PA001 the append-only trail, 42501 a missing privilege, 23505 a unique key.
 */

const TEST_ROLE = "perolehan_app_test";
type Tx = Prisma.TransactionClient;

/// A refusal inside a statement arrives wrapped by the client (`meta.driverAdapterError`); one at the commit, from a deferred trigger, arrives as the driver adapter's own
/// error, with the code on its `cause`.
function sqlState(error: unknown): string {
  type Cause = { originalCode?: string; code?: string; kind?: string };
  const e = error as { meta?: { driverAdapterError?: { cause?: Cause } }; name?: string; cause?: Cause };
  const cause = e.meta?.driverAdapterError?.cause ?? (e.name === "DriverAdapterError" ? e.cause : undefined);
  return cause?.originalCode ?? cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 400)}`;
}

async function refusal(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return sqlState(error);
  }
}

const asApp = <T>(fn: (tx: Tx) => Promise<T>) =>
  db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${TEST_ROLE}`);
    return fn(tx);
  });
const asOwner = <T>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn);

const hex = (n: number) => randomBytes(n).toString("hex");
const newId = (prefix: string) => `${prefix}_${randomId()}${randomId()}`;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const NOW = `date_trunc('second', "sealed_clock"())`;
/// The exercise's closing as stored, as a stamp expression: an act stamped exactly then, whichever second the transaction runs in.
const CLOSING = (exerciseId: string) => `(SELECT "closingAt" FROM "SourcingExercise" WHERE "id" = '${exerciseId}')`;

let org = "";
let requisitionId = "";
let officers: string[] = [];
let namer = "";
let committeeId = "";
let packPartId = "";
let estimateVersionId = "";
let s1 = { supplierId: "", accountId: "" };
let s2 = { supplierId: "", accountId: "" };
const sequences = new Map<string, number>();

interface Ex {
  id: string;
  keyId: string;
  fingerprint: string;
  roster: string[];
  officerKeys: string[];
  shares: string[];
}

async function supplier() {
  const s = await makeSupplierAccount(org);
  return { supplierId: s.supplier.id, accountId: s.account!.id };
}

/// An ONLINE exercise whose closing is `closingInSeconds` away, with its roster of two, their keys, the exercise key and the two shares, set before the closing.
async function onlineExercise(closingInSeconds = 3600, channel: "ONLINE" | "PAPER" = "ONLINE"): Promise<Ex> {
  const ex = await db.sourcingExercise.create({
    data: { organisationId: org, reference: `SB/EX/${randomId()}`, requisitionId, title: "Sealed bids trigger test", estimatedValue: "1000.00", sourcingMethodCode: "SB_METHOD", status: "ADVERTISED", closingAt: new Date(Date.now() + 3600_000), submissionChannel: channel },
  });
  sequences.set(ex.id, 0);
  const out: Ex = { id: ex.id, keyId: newId("key"), fingerprint: hex(32), roster: [], officerKeys: [], shares: [] };
  if (channel === "PAPER") return out;
  for (const personId of officers) {
    out.roster.push((await db.exerciseOpeningOfficer.create({ data: { organisationId: org, exerciseId: ex.id, personId, seatLabelSnapshot: "Member", namedAt: new Date(), namedByPersonId: namer } })).id);
  }
  await asApp(async (tx) => {
    for (let i = 0; i < officers.length; i++) {
      const keyId = newId("ok");
      out.officerKeys.push(keyId);
      await tx.$executeRawUnsafe(
        `INSERT INTO "OfficerExerciseKey" ("id","organisationId","exerciseId","openingOfficerId","personId","publicKey","wrappedPrivateKey","kdfLog2N","kdfR","kdfP","kdfSalt","createdAt")
         VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),decode($7,'hex'),17,8,1,decode($8,'hex'),"sealed_clock"())`,
        keyId, org, ex.id, out.roster[i], officers[i], hex(32), hex(60), hex(16),
      );
    }
    await tx.$executeRawUnsafe(
      `INSERT INTO "ExerciseSealingKey" ("id","organisationId","exerciseId","publicKey","fingerprint","officerCount","createdAt") VALUES ($1,$2,$3,decode($4,'hex'),$5,2,"sealed_clock"())`,
      out.keyId, org, ex.id, hex(32), out.fingerprint,
    );
    for (let i = 0; i < officers.length; i++) {
      const shareId = newId("sh");
      out.shares.push(shareId);
      await tx.$executeRawUnsafe(
        `INSERT INTO "ExerciseKeyShare" ("id","organisationId","keyId","openingOfficerId","officerKeyId","sealedShare","createdAt") VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),"sealed_clock"())`,
        shareId, org, out.keyId, out.roster[i], out.officerKeys[i], hex(80),
      );
    }
  });
  await setClosing(ex.id, closingInSeconds);
  return out;
}

/// Moves the closing to a whole second this far from the database clock (the owner's edit: a closing change is not under test here).
const setClosing = (exerciseId: string, seconds: number) =>
  db.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "closingAt" = ${NOW} + make_interval(secs => $2) WHERE "id" = $1`, exerciseId, seconds);

async function envelope(tx: Tx, exerciseId: string, o: { kind?: "BID" | "ALTERNATIVE"; stamp?: string; late?: boolean } = {}) {
  const id = newId("env");
  const sequence = (sequences.get(exerciseId) ?? 0) + 1;
  sequences.set(exerciseId, sequence);
  await tx.$executeRawUnsafe(
    `INSERT INTO "BidEnvelope" ("id","organisationId","exerciseId","sequence","kind","channel","receivedAt","receivedSource","markings","late","recordedAfterClosing")
     VALUES ($1,$2,$3,$4,$5::"EnvelopeKind",'ONLINE',${o.stamp ?? NOW},'PORTAL','',$6,false)`,
    id, org, exerciseId, sequence, o.kind ?? "BID", o.late ?? false,
  );
  return id;
}

async function draftFile(tx: Tx, ex: Ex, who: { supplierId: string; accountId: string }) {
  const bytes = randomBytes(64);
  const digest = sha256(bytes);
  await tx.$executeRawUnsafe(`INSERT INTO "BlobContent" ("organisationId","sha256","byteSize","bytes") VALUES ($1,$2,64,decode($3,'hex'))`, org, digest, bytes.toString("hex"));
  const id = newId("file");
  await tx.$executeRawUnsafe(
    `INSERT INTO "OnlineBidFile" ("id","organisationId","exerciseId","keyId","supplierId","uploadedBySupplierAccountId","packPartId","cipherSha256","cipherBytes","sealedDek","sealedMeta","bodyIv","scan","uploadedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,64,decode($9,'hex'),decode($10,'hex'),decode($11,'hex'),'NOT_SCANNED',"sealed_clock"())`,
    id, org, ex.id, ex.keyId, who.supplierId, who.accountId, packPartId, digest, hex(80), hex(120), hex(12),
  );
  return id;
}

async function submit(tx: Tx, ex: Ex, who: { supplierId: string; accountId: string }, o: { kind?: "BID" | "ALTERNATIVE"; parent?: string; replaces?: string; files?: string[]; stamp?: string } = {}) {
  const envelopeId = await envelope(tx, ex.id, { kind: o.kind, stamp: o.stamp });
  const bidId = newId("bid");
  await tx.$executeRawUnsafe(
    `INSERT INTO "OnlineBid" ("id","organisationId","exerciseId","keyId","envelopeId","supplierId","submittedBySupplierAccountId","kind","parentOnlineBidId","replacesOnlineBidId",
       "sealedManifest","manifestDek","manifestCipherSha256","sealedDeclaration","declarationDek","declarationCipherSha256","receiptDigest")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::"OnlineBidKind",$9,$10,decode($11,'hex'),decode($12,'hex'),$13,decode($14,'hex'),decode($15,'hex'),$16,$17)`,
    bidId, org, ex.id, ex.keyId, envelopeId, who.supplierId, who.accountId, o.kind ?? "BID", o.parent ?? null, o.replaces ?? null, hex(200), hex(80), hex(32), hex(60), hex(80), hex(32), hex(32),
  );
  for (const fileId of o.files ?? []) {
    await tx.$executeRawUnsafe(`INSERT INTO "OnlineBidPart" ("organisationId","onlineBidId","fileId") VALUES ($1,$2,$3)`, org, bidId, fileId);
    await tx.$executeRawUnsafe(`UPDATE "OnlineBidFile" SET "state" = 'SUBMITTED' WHERE "id" = $1`, fileId);
  }
  return { bidId, envelopeId };
}

/// A replace, as the act will write it: the new submission, then the old one REPLACED with the new one's stamp, its envelope SUPERSEDED, and its alternatives re-pointed.
async function replace(tx: Tx, ex: Ex, who: { supplierId: string; accountId: string }, old: { bidId: string; envelopeId: string }, stamp?: string) {
  const next = await submit(tx, ex, who, { replaces: old.bidId, stamp });
  await tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "status" = 'REPLACED', "statusAt" = (SELECT "receivedAt" FROM "BidEnvelope" WHERE "id" = $2) WHERE "id" = $1`, old.bidId, next.envelopeId);
  await tx.$executeRawUnsafe(`UPDATE "BidEnvelope" SET "status" = 'SUPERSEDED' WHERE "id" = $1`, old.envelopeId);
  await tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "parentOnlineBidId" = $2 WHERE "parentOnlineBidId" = $1`, old.bidId, next.bidId);
  return next;
}

/// A withdrawal stamped by the database clock, its envelope following, and the kept alternatives' links cleared.
async function withdraw(tx: Tx, bid: { bidId: string; envelopeId: string }, stamp = NOW) {
  await tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "status" = 'WITHDRAWN', "statusAt" = ${stamp} WHERE "id" = $1`, bid.bidId);
  await tx.$executeRawUnsafe(`UPDATE "BidEnvelope" SET "status" = 'WITHDRAWN' WHERE "id" = $1`, bid.envelopeId);
  await tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "parentOnlineBidId" = NULL WHERE "parentOnlineBidId" = $1`, bid.bidId);
}

async function mainOpening(exerciseId: string) {
  const id = newId("op");
  await db.$executeRawUnsafe(
    `INSERT INTO "Opening" ("id","organisationId","exerciseId","kind","sequenceNo","committeeId","committeeNameSnapshot","startedAt","startedByPersonId","checklistSnapshot","policySnapshot")
     VALUES ($1,$2,$3,'MAIN',1,$4,'Opening committee',"sealed_clock"(),$5,'{}'::jsonb,'{}'::jsonb)`,
    id, org, exerciseId, committeeId, namer,
  );
  return id;
}

const one = async <T>(sql: string, ...values: unknown[]) => (await db.$queryRawUnsafe<T[]>(sql, ...values))[0];

beforeAll(async () => {
  const applied = await db.$transaction((tx) => applyAppRole(tx, { role: TEST_ROLE, password: null }));
  expect(applied.ok).toBe(true);
  org = (await db.organisation.create({ data: { code: `SB_${randomId()}`, name: "Sealed bids trigger test", timeZone: "Asia/Kuala_Lumpur" } })).id;
  namer = (await db.person.create({ data: { organisationId: org, name: `Namer ${randomId()}` } })).id;
  officers = [(await db.person.create({ data: { organisationId: org, name: `Officer A ${randomId()}` } })).id, (await db.person.create({ data: { organisationId: org, name: `Officer B ${randomId()}` } })).id];
  requisitionId = (
    await db.requisition.create({
      data: { organisationId: org, reference: `SB/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: namer, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") },
    })
  ).id;
  committeeId = (await db.committee.create({ data: { organisationId: org, code: `SB_OC_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "Test" } })).id;
  const packExercise = await onlineExercise();
  const pack = await db.tenderPack.create({ data: { organisationId: org, exerciseId: packExercise.id, versionNo: 1, packKind: "TENDER", contractBasisCode: "X", compositionSnapshot: {} } });
  packPartId = (await db.tenderPackPart.create({ data: { organisationId: org, packId: pack.id, partCode: "FORM", printedNumber: "1", sortOrder: 1, labelSnapshot: "Form of Tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE" } })).id;
  const estimate = await db.companyEstimate.create({ data: { organisationId: org, exerciseId: packExercise.id, preparerPersonId: namer, currentVersionNo: 1 } });
  estimateVersionId = (await db.companyEstimateVersion.create({ data: { organisationId: org, estimateId: estimate.id, versionNo: 1, value: "900.00", preparedOn: new Date("2026-10-01"), preparerPersonId: namer } })).id;
  s1 = await supplier();
  s2 = await supplier();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("the skew is one number (MAX_STAMP_SKEW_SECONDS)", () => {
  it("the migration's literal is the product constant in limits.ts", () => {
    const sql = readFileSync(path.join(process.cwd(), "prisma", "migrations", "20261103110000_sr13_sealed_tables_triggers", "migration.sql"), "utf8");
    const literals = [...sql.matchAll(/make_interval\(secs => (\d+)\)/g)].map((m) => Number(m[1]));
    expect(literals.length).toBe(2);
    for (const n of literals) expect(n).toBe(MAX_STAMP_SKEW_SECONDS);
    expect([...sql.matchAll(/within (\d+) seconds/g)].map((m) => Number(m[1])).every((n) => n === MAX_STAMP_SKEW_SECONDS)).toBe(true);
  });
});

describe("trigger 1: the stamp on an ONLINE envelope (H2)", () => {
  let ex: Ex;
  beforeAll(async () => {
    ex = await onlineExercise();
  });

  it("refuses a stamp outside the skew, in the future, or not a whole second; takes one inside it", async () => {
    expect(await refusal(asApp((tx) => envelope(tx, ex.id, { stamp: `${NOW} - interval '${MAX_STAMP_SKEW_SECONDS + 1} seconds'` })))).toBe("PA010");
    expect(await refusal(asApp((tx) => envelope(tx, ex.id, { stamp: `${NOW} + interval '5 seconds'` })))).toBe("PA010");
    expect(await refusal(asApp((tx) => envelope(tx, ex.id, { stamp: `${NOW} - interval '1.5 seconds'` })))).toBe("PA010");
    expect(await refusal(asApp((tx) => envelope(tx, ex.id, { stamp: `${NOW} - interval '${MAX_STAMP_SKEW_SECONDS - 1} seconds'` })))).toBeNull();
  });

  it("the closing second is in time and the next second is late, judged by the trigger against the closing as it stands", async () => {
    await setClosing(ex.id, -5);
    const closing = (await one<{ c: Date }>(`SELECT "closingAt" AS c FROM "SourcingExercise" WHERE "id" = $1`, ex.id)).c;
    const atClosing = await asApp((tx) => envelope(tx, ex.id, { stamp: CLOSING(ex.id) }));
    const after = await asApp((tx) => envelope(tx, ex.id, { stamp: `${CLOSING(ex.id)} + interval '1 second'` }));
    const read = (id: string) => one<{ late: boolean; judged: Date; after: boolean }>(`SELECT "late", "closingAtJudged" AS judged, "recordedAfterClosing" AS after FROM "BidEnvelope" WHERE "id" = $1`, id);
    expect(await read(atClosing)).toMatchObject({ late: false, after: false });
    expect(await read(after)).toMatchObject({ late: true, after: true });
    expect((await read(after)).judged.getTime()).toBe(closing.getTime());
    await setClosing(ex.id, 3600);
  });

  it("a forged late = false after the closing is overwritten to true", async () => {
    const late = await onlineExercise();
    await setClosing(late.id, -10);
    const id = await asApp((tx) => envelope(tx, late.id, { late: false }));
    expect((await one<{ late: boolean }>(`SELECT "late" FROM "BidEnvelope" WHERE "id" = $1`, id)).late).toBe(true);
    // And a forged late = true in time is overwritten to false.
    const inTime = await asApp((tx) => envelope(tx, ex.id, { late: true }));
    expect((await one<{ late: boolean }>(`SELECT "late" FROM "BidEnvelope" WHERE "id" = $1`, inTime)).late).toBe(false);
  });

  it("refuses an ONLINE envelope on an exercise not pinned ONLINE", async () => {
    const paper = await onlineExercise(3600, "PAPER");
    expect(await refusal(asApp((tx) => envelope(tx, paper.id)))).toBe("PA010");
  });

  it("refuses an ONLINE envelope that names a receiving officer or a stated time (CHECK)", async () => {
    expect(
      await refusal(
        asApp((tx) =>
          tx.$executeRawUnsafe(
            `INSERT INTO "BidEnvelope" ("id","organisationId","exerciseId","sequence","kind","channel","receivedAt","receivedSource","markings","late","recordedAfterClosing","receivedByPersonId")
             VALUES ($1,$2,$3,9001,'BID','ONLINE',${NOW},'PORTAL','',false,false,$4)`,
            newId("env"), org, ex.id, namer,
          ),
        ),
      ),
    ).toBe("23514");
  });

  it("refuses a late insert once the main opening exists, and any insert at all", async () => {
    const opened = await onlineExercise();
    await setClosing(opened.id, -60);
    expect(await refusal(asApp((tx) => envelope(tx, opened.id)))).toBeNull();
    await mainOpening(opened.id);
    expect(await refusal(asApp((tx) => envelope(tx, opened.id)))).toBe("PA011");
  });
});

describe("triggers 2, 3 and 6: a submission, a replace, a withdrawal, and the parent link", () => {
  let ex: Ex;
  beforeAll(async () => {
    ex = await onlineExercise();
  });

  it("submits, replaces and withdraws in time, the envelope following, and the alternative's parent moving with each act", async () => {
    const result = await asApp(async (tx) => {
      const file = await draftFile(tx, ex, s1);
      return submit(tx, ex, s1, { files: [file] });
    });
    const alt = await asApp((tx) => submit(tx, ex, s1, { kind: "ALTERNATIVE", parent: result.bidId }));
    const replacement = await asApp((tx) => replace(tx, ex, s1, result));
    const read = (id: string) => one<{ status: string; parent: string | null; statusAt: Date | null }>(`SELECT "status"::text, "parentOnlineBidId" AS parent, "statusAt" FROM "OnlineBid" WHERE "id" = $1`, id);
    expect((await read(result.bidId)).status).toBe("REPLACED");
    expect((await read(alt.bidId)).parent).toBe(replacement.bidId);
    expect((await one<{ status: string }>(`SELECT "status"::text FROM "BidEnvelope" WHERE "id" = $1`, result.envelopeId)).status).toBe("SUPERSEDED");
    await asApp((tx) => withdraw(tx, replacement));
    expect((await read(replacement.bidId)).status).toBe("WITHDRAWN");
    expect((await read(alt.bidId))).toMatchObject({ status: "SUBMITTED", parent: null });
    expect((await one<{ status: string }>(`SELECT "status"::text FROM "BidEnvelope" WHERE "id" = $1`, replacement.envelopeId)).status).toBe("WITHDRAWN");
  });

  it("an OnlineBid without its envelope inserted in the same transaction is refused", async () => {
    const envelopeId = await asApp((tx) => envelope(tx, ex.id));
    const late = refusal(
      asApp((tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "OnlineBid" ("id","organisationId","exerciseId","keyId","envelopeId","supplierId","submittedBySupplierAccountId","kind","sealedManifest","manifestDek","manifestCipherSha256","sealedDeclaration","declarationDek","declarationCipherSha256","receiptDigest")
           VALUES ($1,$2,$3,$4,$5,$6,$7,'BID',decode($8,'hex'),decode($8,'hex'),$9,decode($8,'hex'),decode($8,'hex'),$9,$9)`,
          newId("bid"), org, ex.id, ex.keyId, envelopeId, s1.supplierId, s1.accountId, hex(40), hex(32),
        ),
      ),
    );
    expect(await late).toBe("PA013");
  });

  it("a second OnlineBidPart with the same file is refused, and a file of another supplier's is never taken", async () => {
    const file = await asApp((tx) => draftFile(tx, ex, s1));
    await asApp((tx) => submit(tx, ex, s1, { files: [file] }));
    expect(await refusal(asApp((tx) => submit(tx, ex, s2, { files: [file] })))).toMatch(/^(23505|PA013)$/);
    const other = await asApp((tx) => draftFile(tx, ex, s2));
    expect(await refusal(asApp((tx) => submit(tx, ex, s1, { files: [other] })))).toBe("PA013");
    // The unique key itself, past the trigger: two submissions written in one transaction, both naming the same draft.
    const third = await asApp((tx) => draftFile(tx, ex, s1));
    expect(
      await refusal(
        asApp(async (tx) => {
          const a = await submit(tx, ex, s1);
          const b = await submit(tx, ex, s1);
          await tx.$executeRawUnsafe(`INSERT INTO "OnlineBidPart" ("organisationId","onlineBidId","fileId") VALUES ($1,$2,$3)`, org, a.bidId, third);
          await tx.$executeRawUnsafe(`INSERT INTO "OnlineBidPart" ("organisationId","onlineBidId","fileId") VALUES ($1,$2,$3)`, org, b.bidId, third);
        }),
      ),
    ).toBe("23505");
  });

  it("an alternative naming a parent that is not the supplier's own live bid is refused", async () => {
    const theirs = await asApp((tx) => submit(tx, ex, s2));
    expect(await refusal(asApp((tx) => submit(tx, ex, s1, { kind: "ALTERNATIVE", parent: theirs.bidId })))).toBe("PA013");
  });

  it("a parent moved other than by the parent's own replacement or withdrawal is refused", async () => {
    const mine = await asApp((tx) => submit(tx, ex, s1));
    const other = await asApp((tx) => submit(tx, ex, s1));
    const alt = await asApp((tx) => submit(tx, ex, s1, { kind: "ALTERNATIVE", parent: mine.bidId }));
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "parentOnlineBidId" = $2 WHERE "id" = $1`, alt.bidId, other.bidId)))).toBe("PA016");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "parentOnlineBidId" = NULL WHERE "id" = $1`, alt.bidId)))).toBe("PA016");
    // The parent withdrawn in an earlier transaction does not let a later one clear the link: the move belongs to the withdrawal's act.
    await asApp(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "status" = 'WITHDRAWN', "statusAt" = ${NOW} WHERE "id" = $1`, mine.bidId);
      await tx.$executeRawUnsafe(`UPDATE "BidEnvelope" SET "status" = 'WITHDRAWN' WHERE "id" = $1`, mine.envelopeId);
    });
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "parentOnlineBidId" = NULL WHERE "id" = $1`, alt.bidId)))).toBe("PA016");
    // A bid never names a parent.
    expect(await refusal(asApp((tx) => submit(tx, ex, s1, { kind: "BID", parent: other.bidId })))).toMatch(/^(23514|PA013)$/);
  });

  it("REPLACED and WITHDRAWN after the closing are refused, judged by the act's own stamp", async () => {
    const closingEx = await onlineExercise();
    const mine = await asApp((tx) => submit(tx, closingEx, s1));
    const theirs = await asApp((tx) => submit(tx, closingEx, s2));
    await setClosing(closingEx.id, -3);
    expect(await refusal(asApp((tx) => replace(tx, closingEx, s1, mine)))).toBe("PA012");
    expect(await refusal(asApp((tx) => withdraw(tx, theirs)))).toBe("PA012");
    // A withdrawal stamped at the closing second still stands when it commits after it (FR-BID-002, D7).
    expect(await refusal(asApp((tx) => withdraw(tx, theirs, CLOSING(closingEx.id))))).toBeNull();
    // A replace stamped at the closing second stands too.
    expect(await refusal(asApp((tx) => replace(tx, closingEx, s1, mine, CLOSING(closingEx.id))))).toBeNull();
  });

  it("a withdrawal's stamp outside the skew is refused", async () => {
    const mine = await asApp((tx) => submit(tx, ex, s1));
    expect(await refusal(asApp((tx) => withdraw(tx, mine, `${NOW} - interval '${MAX_STAMP_SKEW_SECONDS + 1} seconds'`)))).toBe("PA012");
    expect(await refusal(asApp((tx) => withdraw(tx, mine, `${NOW} + interval '2 seconds'`)))).toBe("PA012");
  });

  it("a status moves forward only, and an envelope moves only with its submission", async () => {
    const mine = await asApp((tx) => submit(tx, ex, s1));
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "BidEnvelope" SET "status" = 'WITHDRAWN' WHERE "id" = $1`, mine.envelopeId)))).toBe("PA012");
    await asApp((tx) => withdraw(tx, mine));
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "status" = 'SUBMITTED', "statusAt" = NULL WHERE "id" = $1`, mine.bidId)))).toBe("PA012");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "BidEnvelope" SET "status" = 'RECEIVED' WHERE "id" = $1`, mine.envelopeId)))).toBe("PA012");
    // The stamp and the late flag are the database's, and never change.
    const other = await asApp((tx) => submit(tx, ex, s2));
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "BidEnvelope" SET "late" = true WHERE "id" = $1`, other.envelopeId)))).toBe("PA012");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "BidEnvelope" SET "receivedAt" = "receivedAt" - interval '1 hour' WHERE "id" = $1`, other.envelopeId)))).toBe("PA012");
  });

  it("OPENED is refused unless the exercise's opening is being unsealed in the same transaction", async () => {
    const openEx = await onlineExercise();
    const mine = await asApp((tx) => submit(tx, openEx, s1));
    await setClosing(openEx.id, -60);
    const openingId = await mainOpening(openEx.id);
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "status" = 'OPENED' WHERE "id" = $1`, mine.bidId)))).toBe("PA022");
    await asApp(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "Opening" SET "unsealedAt" = "sealed_clock"() WHERE "id" = $1`, openingId);
      await tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "status" = 'OPENED' WHERE "id" = $1`, mine.bidId);
      await tx.$executeRawUnsafe(`UPDATE "BidEnvelope" SET "status" = 'OPENED' WHERE "id" = $1`, mine.envelopeId);
    });
    expect((await one<{ status: string }>(`SELECT "status"::text FROM "OnlineBid" WHERE "id" = $1`, mine.bidId)).status).toBe("OPENED");
  });
});

describe("trigger 4: ciphertext and key material never change, and a shred goes one way", () => {
  let ex: Ex;
  beforeAll(async () => {
    ex = await onlineExercise();
  });

  it("refuses a change of a submission's or a file's ciphertext, a sealed key, or an officer's wrap", async () => {
    const file = await asApp((tx) => draftFile(tx, ex, s1));
    const mine = await asApp((tx) => submit(tx, ex, s1, { files: [file] }));
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "sealedDeclaration" = decode($2,'hex') WHERE "id" = $1`, mine.bidId, hex(60))))).toBe("PA014");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OnlineBid" SET "supplierId" = $2 WHERE "id" = $1`, mine.bidId, s2.supplierId)))).toBe("PA014");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OnlineBidFile" SET "sealedDek" = decode($2,'hex') WHERE "id" = $1`, file, hex(80))))).toBe("PA014");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OfficerExerciseKey" SET "wrappedPrivateKey" = decode($2,'hex') WHERE "id" = $1`, ex.officerKeys[0], hex(60))))).toBe("PA014");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "ExerciseSealingKey" SET "fingerprint" = $2 WHERE "id" = $1`, ex.keyId, hex(32))))).toBe("PA014");
    // The lockout counter is the officer key's one moving part.
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OfficerExerciseKey" SET "failedAttempts" = "failedAttempts" + 1 WHERE "id" = $1`, ex.officerKeys[0])))).toBeNull();
  });

  it("refuses a share shredded while its key is live and its officer has released nothing, and lets a retired key's shares go, once", async () => {
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "ExerciseKeyShare" SET "sealedShare" = NULL, "endedAt" = "sealed_clock"(), "endedReason" = 'x' WHERE "id" = $1`, ex.shares[0])))).toBe("PA014");
    const other = await onlineExercise();
    await asApp(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "ExerciseSealingKey" SET "retiredAt" = "sealed_clock"(), "retiredReason" = 'Re-key before any submission' WHERE "id" = $1`, other.keyId);
      for (const s of other.shares) await tx.$executeRawUnsafe(`UPDATE "ExerciseKeyShare" SET "sealedShare" = NULL, "endedAt" = "sealed_clock"(), "endedReason" = 'Key retired' WHERE "id" = $1`, s);
    });
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "ExerciseKeyShare" SET "sealedShare" = decode($2,'hex') WHERE "id" = $1`, other.shares[0], hex(80))))).toBe("PA014");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "ExerciseSealingKey" SET "retiredAt" = NULL WHERE "id" = $1`, other.keyId)))).toBe("PA014");
  });

  it("a draft file is uploaded under the live key only", async () => {
    const other = await onlineExercise();
    await asApp((tx) => tx.$executeRawUnsafe(`UPDATE "ExerciseSealingKey" SET "retiredAt" = "sealed_clock"(), "retiredReason" = 'Re-key' WHERE "id" = $1`, other.keyId));
    expect(await refusal(asApp((tx) => draftFile(tx, other, s1)))).toBe("PA024");
  });
});

describe("trigger 5: a released data key", () => {
  it("is refused outside a finalise", async () => {
    const ex = await onlineExercise();
    const file = await asApp((tx) => draftFile(tx, ex, s1));
    await asApp((tx) => submit(tx, ex, s1, { files: [file] }));
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OnlineBidFile" SET "releasedDek" = decode($2,'hex') WHERE "id" = $1`, file, hex(32))))).toBe("PA015");
  });
});

describe("trigger 7: the exercise key and the published fingerprint", () => {
  it("publication freezes the live key's fingerprint, and nothing else", async () => {
    const ex = await onlineExercise();
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "publishedKeyFingerprint" = $2 WHERE "id" = $1`, ex.id, hex(32))))).toBe("PA017");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "publishedKeyFingerprint" = $2 WHERE "id" = $1`, ex.id, ex.fingerprint)))).toBeNull();
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "publishedKeyFingerprint" = NULL WHERE "id" = $1`, ex.id)))).toBe("PA017");
  });

  it("a fingerprint change, a new key or a retired key after publication without a PublishedKeyChange is refused; with one in the same act it stands", async () => {
    const ex = await onlineExercise();
    await asApp((tx) => tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "publishedKeyFingerprint" = $2 WHERE "id" = $1`, ex.id, ex.fingerprint));
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "publishedKeyFingerprint" = $2 WHERE "id" = $1`, ex.id, hex(32))))).toBe("PA017");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "ExerciseSealingKey" SET "retiredAt" = "sealed_clock"(), "retiredReason" = 'Re-key' WHERE "id" = $1`, ex.keyId)))).toBe("PA017");
    // The re-key as one act (20g, 20p): retire the key and shred its shares, make the new key, record the change, re-freeze the fingerprint.
    const nextKey = newId("key");
    const nextFingerprint = hex(32);
    const rekey = asApp(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "ExerciseSealingKey" SET "retiredAt" = "sealed_clock"(), "retiredReason" = 'Re-key before any submission' WHERE "id" = $1`, ex.keyId);
      for (const s of ex.shares) await tx.$executeRawUnsafe(`UPDATE "ExerciseKeyShare" SET "sealedShare" = NULL, "endedAt" = "sealed_clock"(), "endedReason" = 'Key retired' WHERE "id" = $1`, s);
      await tx.$executeRawUnsafe(`INSERT INTO "ExerciseSealingKey" ("id","organisationId","exerciseId","publicKey","fingerprint","officerCount","createdAt") VALUES ($1,$2,$3,decode($4,'hex'),$5,2,"sealed_clock"())`, nextKey, org, ex.id, hex(32), nextFingerprint);
      await tx.$executeRawUnsafe(
        `INSERT INTO "PublishedKeyChange" ("id","organisationId","exerciseId","fromKeyId","toKeyId","fromFingerprint","toFingerprint","reason","byPersonId","at") VALUES ($1,$2,$3,$4,$5,$6,$7,'An officer forgot the passphrase before any submission',$8,"sealed_clock"())`,
        newId("pkc"), org, ex.id, ex.keyId, nextKey, ex.fingerprint, nextFingerprint, namer,
      );
      await tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "publishedKeyFingerprint" = $2 WHERE "id" = $1`, ex.id, nextFingerprint);
    });
    expect(await refusal(rekey)).toBeNull();
    // A new key after publication with no change row is refused at the commit.
    const third = newId("key");
    expect(
      await refusal(
        asApp(async (tx) => {
          await tx.$executeRawUnsafe(`UPDATE "ExerciseSealingKey" SET "retiredAt" = "sealed_clock"(), "retiredReason" = 'Again' WHERE "id" = $1`, nextKey);
          await tx.$executeRawUnsafe(`INSERT INTO "ExerciseSealingKey" ("id","organisationId","exerciseId","publicKey","fingerprint","officerCount","createdAt") VALUES ($1,$2,$3,decode($4,'hex'),$5,2,"sealed_clock"())`, third, org, ex.id, hex(32), hex(32));
        }),
      ),
    ).toBe("PA017");
    // A change row naming fingerprints that are not its keys' is refused.
    expect(
      await refusal(
        asApp((tx) =>
          tx.$executeRawUnsafe(
            `INSERT INTO "PublishedKeyChange" ("id","organisationId","exerciseId","fromKeyId","toKeyId","fromFingerprint","toFingerprint","reason","byPersonId","at") VALUES ($1,$2,$3,$4,$5,$6,$7,'x',$8,"sealed_clock"())`,
            newId("pkc"), org, ex.id, ex.keyId, nextKey, hex(32), nextFingerprint, namer,
          ),
        ),
      ),
    ).toBe("PA017");
  });

  it("a key retired, or made, after the closing is refused", async () => {
    const ex = await onlineExercise();
    await setClosing(ex.id, -2);
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "ExerciseSealingKey" SET "retiredAt" = "sealed_clock"(), "retiredReason" = 'Re-key' WHERE "id" = $1`, ex.keyId)))).toBe("PA017");
    expect(
      await refusal(asApp((tx) => tx.$executeRawUnsafe(`INSERT INTO "ExerciseSealingKey" ("id","organisationId","exerciseId","publicKey","fingerprint","officerCount","createdAt") VALUES ($1,$2,$3,decode($4,'hex'),$5,2,"sealed_clock"())`, newId("key"), org, ex.id, hex(32), hex(32)))),
    ).toBe("PA017");
  });

  it("an officer key is set only by the named officer on their own live roster row", async () => {
    const ex = await onlineExercise();
    expect(
      await refusal(
        asApp((tx) =>
          tx.$executeRawUnsafe(
            `INSERT INTO "OfficerExerciseKey" ("id","organisationId","exerciseId","openingOfficerId","personId","publicKey","wrappedPrivateKey","kdfLog2N","kdfR","kdfP","kdfSalt","createdAt")
             VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),decode($6,'hex'),17,8,1,decode($7,'hex'),"sealed_clock"())`,
            newId("ok"), org, ex.id, ex.roster[0], officers[1], hex(32), hex(16),
          ),
        ),
      ),
    ).toBe("PA017");
  });
});

describe("trigger 8: LODGEMENT_CLOSED", () => {
  const lodge = (ex: Ex) =>
    asApp((tx) =>
      tx.$executeRawUnsafe(
        `INSERT INTO "SealedEstimateLodgement" ("id","organisationId","exerciseId","keyId","estimateVersionId","sealedEstimate","estimateDek","cipherSha256","lodgedAt","lodgedByPersonId")
         VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),decode($6,'hex'),$7,"sealed_clock"(),$8) RETURNING "id"`,
        newId("lodge"), org, ex.id, ex.keyId, estimateVersionId, hex(48), hex(32), namer,
      ),
    );

  it("a lodgement before the closing stands, and one after it is refused, as is a supersession", async () => {
    const ex = await onlineExercise();
    expect(await refusal(lodge(ex))).toBeNull();
    const lodged = await one<{ id: string }>(`SELECT "id" FROM "SealedEstimateLodgement" WHERE "exerciseId" = $1`, ex.id);
    await setClosing(ex.id, -1);
    expect(await refusal(lodge(ex))).toBe("PA018");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "SealedEstimateLodgement" SET "supersededAt" = "sealed_clock"(), "supersededReason" = 'Re-key' WHERE "id" = $1`, lodged.id)))).toBe("PA018");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "SealedEstimateLodgement" SET "sealedEstimate" = decode($2,'hex') WHERE "id" = $1`, lodged.id, hex(48))))).toBe("PA014");
  });
});

describe("trigger 9 and the frozen mode: the pepper, and a demonstration never promoted", () => {
  it("an exercise is not frozen LIVE while an officer key lacks the pepper, and a key without it is refused on a LIVE exercise", async () => {
    const ex = await onlineExercise();
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "onlineSubmissionMode" = 'LIVE' WHERE "id" = $1`, ex.id)))).toBe("PA019");
    const live = await onlineExercise();
    await asApp(async (tx) => {
      for (const k of live.officerKeys) await tx.$executeRawUnsafe(`UPDATE "OfficerExerciseKey" SET "retiredAt" = "sealed_clock"(), "retiredReason" = 'Peppered again' WHERE "id" = $1`, k);
    });
    await asOwner((tx) => tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "onlineSubmissionMode" = 'LIVE' WHERE "id" = $1`, live.id));
    const insertKey = (pepperId: string | null) =>
      asApp((tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "OfficerExerciseKey" ("id","organisationId","exerciseId","openingOfficerId","personId","publicKey","wrappedPrivateKey","kdfLog2N","kdfR","kdfP","kdfSalt","pepperId","createdAt")
           VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),decode($6,'hex'),17,8,1,decode($7,'hex'),$8,"sealed_clock"())`,
          newId("ok"), org, live.id, live.roster[0], officers[0], hex(32), hex(16), pepperId,
        ),
      );
    expect(await refusal(insertKey(null))).toBe("PA019");
    expect(await refusal(insertKey("pepper-1"))).toBeNull();
  });

  it("a mode frozen at publication never changes", async () => {
    const ex = await onlineExercise();
    await asOwner((tx) => tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "onlineSubmissionMode" = 'DEMONSTRATION' WHERE "id" = $1`, ex.id));
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "onlineSubmissionMode" = 'LIVE' WHERE "id" = $1`, ex.id)))).toBe("PA023");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "onlineSubmissionMode" = NULL WHERE "id" = $1`, ex.id)))).toBe("PA023");
  });
});

describe("the price: no finalise while a bid has none, and a paper bid always has one", () => {
  it("refuses a NULL price on a paper envelope, and a finalise while an online bid's price is NULL", async () => {
    const ex = await onlineExercise();
    const mine = await asApp((tx) => submit(tx, ex, s1));
    await setClosing(ex.id, -60);
    const openingId = await mainOpening(ex.id);
    const partyId = (await db.exerciseParty.create({ data: { organisationId: org, exerciseId: ex.id, source: "BIDDER_AT_OPENING", name: "Bidder", registrationNo: randomId() } })).id;
    const insertOpened = (envelopeId: string, listingNo: number) =>
      asApp((tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "OpenedBid" ("id","organisationId","exerciseId","openingId","envelopeId","listingNo","partyId","openedAt","bidderNameAsRead","priceAsRead","saleFinding","restrictionFinding")
           VALUES ($1,$2,$3,$4,$5,$6,$7,"sealed_clock"(),'Bidder',NULL,'LIVE_SALE','NOT_RESTRICTED')`,
          newId("ob"), org, ex.id, openingId, envelopeId, listingNo, partyId,
        ),
      );
    // A paper envelope on another exercise of the organisation, opened with no price: refused.
    const paper = await onlineExercise(3600, "PAPER");
    const paperEnvelope = newId("env");
    await db.$executeRawUnsafe(
      `INSERT INTO "BidEnvelope" ("id","organisationId","exerciseId","sequence","kind","channel","receivedAt","receivedSource","markings","late","closingAtJudged","recordedAfterClosing","receivedByPersonId")
       VALUES ($1,$2,$3,1,'BID','COUNTER',"sealed_clock"(),'SERVER','Sealed envelope',false,"sealed_clock"() + interval '1 day',false,$4)`,
      paperEnvelope, org, paper.id, namer,
    );
    expect(await refusal(insertOpened(paperEnvelope, 1))).toBe("PA021");
    expect(await refusal(insertOpened(mine.envelopeId, 1))).toBeNull();
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "Opening" SET "unsealedAt" = "sealed_clock"(), "finalisedAt" = "sealed_clock"() WHERE "id" = $1`, openingId)))).toBe("PA021");
  });
});

describe("trigger 10: nothing sealed is deleted or truncated, by any login", () => {
  const APPEND_ONLY = ["SealedAccessEvent", "PublishedKeyChange"];

  it("the app's login holds no DELETE or TRUNCATE on any sealed table (grants)", async () => {
    for (const table of [...SEALED_TABLES, ...APPEND_ONLY]) {
      expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE false`))), table).toBe("42501");
      expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`TRUNCATE "${table}" CASCADE`))), table).toBe("42501");
    }
    for (const table of APPEND_ONLY) expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "${table}" SET "id" = "id" WHERE false`))), table).toBe("42501");
  });

  it("the owner is refused by the triggers: every DELETE and TRUNCATE, and an ONLINE envelope's DELETE", async () => {
    const ex = await onlineExercise();
    const file = await asApp((tx) => draftFile(tx, ex, s1));
    const mine = await asApp((tx) => submit(tx, ex, s1, { files: [file] }));
    await asApp((tx) =>
      tx.$executeRawUnsafe(`INSERT INTO "SealedAccessEvent" ("id","organisationId","exerciseId","kind","outcome","supplierAccountId","at") VALUES ($1,$2,$3,'SUBMIT','GRANTED',$4,"sealed_clock"())`, newId("sae"), org, ex.id, s1.accountId),
    );
    await db.bidSealingPolicy.upsert({ where: { organisationId: org }, create: { organisationId: org }, update: {} });
    const rows: Record<string, string> = {
      OfficerExerciseKey: ex.officerKeys[0], ExerciseSealingKey: ex.keyId, ExerciseKeyShare: ex.shares[0], OnlineBidFile: file, OnlineBid: mine.bidId,
    };
    for (const [table, id] of Object.entries(rows)) expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "id" = $1`, id))), table).toBe("PA020");
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`DELETE FROM "OnlineBidPart" WHERE "fileId" = $1`, file)))).toBe("PA020");
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`DELETE FROM "BidSealingPolicy" WHERE "organisationId" = $1`, org)))).toBe("PA020");
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`DELETE FROM "SealedAccessEvent" WHERE "exerciseId" = $1`, ex.id)))).toBe("PA001");
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`DELETE FROM "BidEnvelope" WHERE "id" = $1`, mine.envelopeId)))).toBe("PA020");
    for (const table of [...SEALED_TABLES, ...APPEND_ONLY]) expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`TRUNCATE "${table}" CASCADE`))), table).toMatch(/^PA0(01|04|20)$/);
    // The rows are all still there.
    expect((await one<{ n: bigint }>(`SELECT count(*) AS n FROM "OnlineBid" WHERE "id" = $1`, mine.bidId)).n).toBe(BigInt(1));
  });

  it("each sealed table's triggers are ENABLE ALWAYS, so a replica session does not skip them", async () => {
    const triggers = await db.$queryRawUnsafe<{ table: string; name: string; enabled: string }[]>(
      `SELECT c.relname AS table, t.tgname AS name, t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       WHERE NOT t.tgisinternal AND c.relname = ANY($1::text[])`,
      [...SEALED_TABLES, ...APPEND_ONLY, "BidEnvelope"],
    );
    const ours = triggers.filter((t) => !(t.table === "BidEnvelope" && !t.name.startsWith("BidEnvelope_online")));
    expect(ours.length).toBeGreaterThan(30);
    expect(ours.filter((t) => t.enabled !== "A")).toEqual([]);
  });
});

describe("db:roles reports nothing not yet present", () => {
  it("every protected table exists in this database", async () => {
    const tables = await db.$queryRawUnsafe<{ name: string }[]>(`SELECT table_name::text AS name FROM information_schema.tables WHERE table_schema = current_schema()`);
    expect(notYetPresent(new Set(tables.map((t) => t.name)))).toEqual([]);
  });
});
