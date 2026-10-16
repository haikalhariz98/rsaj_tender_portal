import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { parseEstimateFigure } from "@/lib/opening/online-finalise";
import { leadTime } from "@/lib/scope/estimate";
import { writeSealedLodgement } from "@/lib/scope/estimate-store";
import { ensureAdministrator, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { estimateLodgedOn, needsRelodgement } from "./estimate-lodgement";
import { standingLodgement } from "./estimate-lodgement-store";
import { sealedSqlState } from "./store";
import { estimateAad, estimateDekAad, openStoredGcm, openStoredHpke } from "./unseal-seal";
import { fingerprint, generateX25519 } from "./x25519";

/**
 * Wave 3b step 16 (ADR 0036 D10, D11; ruling 20g): the sealed company estimate lodgement against a real database. The figure goes in as ciphertext under the live key and opens
 * with that key's private half; a re-key takes the lodgement's standing with it, and lodging the same version again leaves exactly one copy standing, the version rows untouched
 * (so the lead check reads the same day); the database refuses a lodgement after the closing and one under a retired key.
 */

const FIGURE = "123456.78";
const hex = (n: number) => randomBytes(n).toString("hex");
const newId = (p: string) => `${p}_${randomId()}${randomId()}`;

let org = "";
let person = "";
const pair = generateX25519();
const second = generateX25519();

interface Ex { id: string; keyId: string; estimateId: string; versionId: string; preparedOn: Date; roster: string[]; officerKeys: string[] }

async function insertKey(exerciseId: string, keyId: string, publicKey: Uint8Array, roster: string[], officerKeys: string[]) {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "ExerciseSealingKey" ("id","organisationId","exerciseId","publicKey","fingerprint","officerCount","createdAt") VALUES ($1,$2,$3,decode($4,'hex'),$5,2,"sealed_clock"())`,
      keyId, org, exerciseId, Buffer.from(publicKey).toString("hex"), fingerprint(publicKey),
    );
    for (let i = 0; i < roster.length; i++) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "ExerciseKeyShare" ("id","organisationId","keyId","openingOfficerId","officerKeyId","sealedShare","createdAt") VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),"sealed_clock"())`,
        newId("sh"), org, keyId, roster[i], officerKeys[i], hex(80),
      );
    }
  });
}

/// An ONLINE exercise, a day from closing, with its roster of two, their keys, the live exercise key, and a prepared estimate of one version.
async function exercise(): Promise<Ex> {
  const requisitionId = (await db.requisition.create({ data: { organisationId: org, reference: `LDG/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: person, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") } })).id;
  const ex = await db.sourcingExercise.create({
    data: { organisationId: org, reference: `LDG/EX/${randomId()}`, requisitionId, title: "Lodgement test", estimatedValue: "1000.00", sourcingMethodCode: "LDG_METHOD", status: "DOCUMENTS_IN_PREPARATION", closingAt: new Date(Date.now() + 86_400_000), submissionChannel: "ONLINE", onlineSubmissionMode: "DEMONSTRATION" },
  });
  const people = [(await db.person.create({ data: { organisationId: org, name: `Officer A ${randomId()}` } })).id, (await db.person.create({ data: { organisationId: org, name: `Officer B ${randomId()}` } })).id];
  const roster: string[] = [];
  for (const personId of people) roster.push((await db.exerciseOpeningOfficer.create({ data: { organisationId: org, exerciseId: ex.id, personId, seatLabelSnapshot: "Member", namedAt: new Date(), namedByPersonId: person } })).id);
  const officerKeys: string[] = [];
  await db.$transaction(async (tx) => {
    for (let i = 0; i < people.length; i++) {
      const id = newId("ok");
      officerKeys.push(id);
      await tx.$executeRawUnsafe(
        `INSERT INTO "OfficerExerciseKey" ("id","organisationId","exerciseId","openingOfficerId","personId","publicKey","wrappedPrivateKey","kdfLog2N","kdfR","kdfP","kdfSalt","createdAt") VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),decode($7,'hex'),17,8,1,decode($8,'hex'),"sealed_clock"())`,
        id, org, ex.id, roster[i], people[i], hex(32), hex(60), hex(16),
      );
    }
  });
  const keyId = newId("key");
  await insertKey(ex.id, keyId, pair.publicKey, roster, officerKeys);
  const preparedOn = new Date("2026-10-01T00:00:00.000Z");
  const estimate = await db.companyEstimate.create({ data: { organisationId: org, exerciseId: ex.id, preparerPersonId: person, currentVersionNo: 1, state: "DRAFT" } });
  const version = await db.companyEstimateVersion.create({ data: { organisationId: org, estimateId: estimate.id, versionNo: 1, value: FIGURE, preparedOn, preparerPersonId: person } });
  return { id: ex.id, keyId, estimateId: estimate.id, versionId: version.id, preparedOn, roster, officerKeys };
}

const lodge = (ex: Ex, keyId: string, publicKey: Uint8Array, reason = "Version 1 was lodged") =>
  db.$transaction((tx) => writeSealedLodgement(tx, { organisationId: org, exerciseId: ex.id, estimateId: ex.estimateId, versionNo: 1, key: { id: keyId, publicKey }, lodgedByPersonId: person, supersededReason: reason, now: new Date() }));

beforeAll(async () => {
  org = (await testOrganisation()).id;
  await ensureAdministrator(org);
  person = (await db.person.create({ data: { organisationId: org, name: `Lodger ${randomId()}` } })).id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("the sealed lodgement (step 16)", () => {
  it("holds the figure only as ciphertext under the live key, and it opens with that key's private half", async () => {
    const ex = await exercise();
    const made = await lodge(ex, ex.keyId, pair.publicKey);
    const row = await db.sealedEstimateLodgement.findUniqueOrThrow({ where: { id: made.lodgementId } });
    const bytes = Buffer.concat([row.sealedEstimate, row.estimateDek]);
    expect(bytes.includes(Buffer.from(FIGURE))).toBe(false);
    expect(bytes.includes(Buffer.from("12345678"))).toBe(false);
    const context = { organisationId: org, exerciseId: ex.id, keyId: ex.keyId, lodgementId: made.lodgementId };
    const dek = openStoredHpke({ privateKey: pair.privateKey, stored: new Uint8Array(row.estimateDek), aad: estimateDekAad(context) });
    const plain = openStoredGcm({ dek, stored: new Uint8Array(row.sealedEstimate), aad: estimateAad(context) });
    expect(parseEstimateFigure(plain)).toBe(12345678n);
    // The version table still holds the figure (ADR 0012's recorded gap), and the lodgement did not touch it.
    const versions = await db.companyEstimateVersion.findMany({ where: { estimateId: ex.estimateId }, select: { id: true, versionNo: true, preparedOn: true } });
    expect(versions).toHaveLength(1);
  });

  it("is judged lodged ONLINE only under the live key, and a re-key takes the standing with it", async () => {
    const ex = await exercise();
    await db.companyEstimate.update({ where: { id: ex.estimateId }, data: { state: "LODGED", lodgedAt: new Date() } });
    const before = await standingLodgement(db, org, ex.id);
    expect(before).toBeNull();
    expect(estimateLodgedOn({ channel: "ONLINE", state: "LODGED", liveKeyId: ex.keyId, standing: before })).toBe(false);
    expect(estimateLodgedOn({ channel: "PAPER", state: "LODGED", liveKeyId: null, standing: null })).toBe(true);
    await lodge(ex, ex.keyId, pair.publicKey);
    const standing = await standingLodgement(db, org, ex.id);
    expect(standing).toMatchObject({ keyId: ex.keyId, versionNo: 1, lodgedByPersonId: person });
    expect(estimateLodgedOn({ channel: "ONLINE", state: "LODGED", liveKeyId: ex.keyId, standing })).toBe(true);

    // The key is retired and a new one made (as a re-key does), before the closing.
    await db.$executeRawUnsafe(`UPDATE "ExerciseSealingKey" SET "retiredAt" = "sealed_clock"(), "retiredReason" = 'Re-key' WHERE "id" = $1`, ex.keyId);
    const newKey = newId("key");
    await insertKey(ex.id, newKey, second.publicKey, ex.roster, ex.officerKeys);
    expect(estimateLodgedOn({ channel: "ONLINE", state: "LODGED", liveKeyId: newKey, standing })).toBe(false);
    expect(needsRelodgement({ channel: "ONLINE", state: "LODGED", liveKeyId: newKey, standing })).toBe(true);
    // The old key cannot be lodged under any more: the database says so.
    expect(sealedSqlState(await lodge(ex, ex.keyId, pair.publicKey).catch((e) => e))).toBe("PA018");

    const lead = (policyDays: number) => leadTime(ex.preparedOn.toISOString().slice(0, 10), new Date("2026-11-20T04:00:00Z"), { estimateLeadDays: policyDays }, "Asia/Kuala_Lumpur");
    const leadBefore = lead(7);
    const again = await lodge(ex, newKey, second.publicKey, "The key was changed");
    expect(again.superseded).toBe(1);
    const after = await standingLodgement(db, org, ex.id);
    expect(after).toMatchObject({ keyId: newKey, versionNo: 1, id: again.lodgementId });
    expect(estimateLodgedOn({ channel: "ONLINE", state: "LODGED", liveKeyId: newKey, standing: after })).toBe(true);
    const live = await db.sealedEstimateLodgement.count({ where: { exerciseId: ex.id, supersededAt: null } });
    expect(live).toBe(1);
    const old = await db.sealedEstimateLodgement.findFirstOrThrow({ where: { exerciseId: ex.id, supersededAt: { not: null } } });
    expect(old.supersededReason).toBe("The key was changed");
    // The same version, the same day: the lead check reads the version's date, never the lodgement's.
    expect(lead(7)).toEqual(leadBefore);
    const versions = await db.companyEstimateVersion.findMany({ where: { estimateId: ex.estimateId } });
    expect(versions).toHaveLength(1);
    expect(versions[0].preparedOn.toISOString()).toBe(ex.preparedOn.toISOString());
  });

  it("is refused after the closing", async () => {
    const ex = await exercise();
    await db.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "closingAt" = date_trunc('second', "sealed_clock"()) - interval '2 seconds' WHERE "id" = $1`, ex.id);
    const refused = await lodge(ex, ex.keyId, pair.publicKey).catch((e) => e);
    expect(sealedSqlState(refused)).toBe("PA018");
    expect(await db.sealedEstimateLodgement.count({ where: { exerciseId: ex.id } })).toBe(0);
  });
});
